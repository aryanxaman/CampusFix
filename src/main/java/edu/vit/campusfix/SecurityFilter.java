package edu.vit.campusfix;

import com.google.gson.Gson;
import jakarta.servlet.*;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.SQLException;
import java.util.Map;

@WebFilter("/*")
public final class SecurityFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
        throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        req.setCharacterEncoding("UTF-8");
        res.setCharacterEncoding("UTF-8");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "same-origin");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        res.setHeader(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        );
        String path = req.getRequestURI().substring(req.getContextPath().length());
        if (path.startsWith("/api/")) {
            res.setHeader("Cache-Control", "no-store");
            boolean read = "GET".equals(req.getMethod());
            if (!read && !"POST".equals(req.getMethod())) {
                error(res, 405, "Method not supported.");
                return;
            }
            if (!read && req.getHeader("Origin") != null) {
                try {
                    URI origin = URI.create(req.getHeader("Origin"));
                    int port =
                        origin.getPort() == -1
                            ? "https".equals(origin.getScheme())
                                ? 443
                                : 80
                            : origin.getPort();
                    if (
                        !req.getScheme().equals(origin.getScheme()) ||
                        !req.getServerName().equalsIgnoreCase(origin.getHost()) ||
                        req.getServerPort() != port
                    ) {
                        error(res, 403, "Cross-origin requests are not allowed.");
                        return;
                    }
                } catch (Exception e) {
                    error(res, 403, "Invalid request origin.");
                    return;
                }
            }
            HttpSession existing = req.getSession(false);
            if (
                existing != null &&
                existing.getAttribute("user") instanceof User principal &&
                !path.equals("/api/login") &&
                !path.equals("/api/logout")
            ) {
                try {
                    UserDao.Identity identity = new UserDao().identity(principal.id());
                    Object version = existing.getAttribute("authVersion");
                    if (
                        identity == null ||
                        !(version instanceof Number) ||
                        ((Number) version).intValue() != identity.version()
                    ) {
                        existing.invalidate();
                        error(res, 401, "Your account has changed. Please sign in again.");
                        return;
                    }
                    existing.setAttribute("user", identity.user());
                } catch (SQLException e) {
                    req.getServletContext().log("Session verification failed", e);
                    error(res, 503, "Campus services are unavailable. Please try again shortly.");
                    return;
                }
            }
            if (
                !path.equals("/api/login") &&
                !path.equals("/api/session") &&
                !path.equals("/api/config") &&
                !path.equals("/api/register")
            ) {
                HttpSession session = req.getSession(false);
                if (session == null || !(session.getAttribute("user") instanceof User)) {
                    error(res, 401, "Please sign in to continue.");
                    return;
                }
                if (!read) {
                    String expected = (String) session.getAttribute("csrf"),
                        actual = req.getHeader("X-CSRF-Token");
                    if (
                        expected == null ||
                        actual == null ||
                        !MessageDigest.isEqual(
                            expected.getBytes(StandardCharsets.UTF_8),
                            actual.getBytes(StandardCharsets.UTF_8)
                        )
                    ) {
                        error(res, 403, "Your session token is invalid. Please sign in again.");
                        return;
                    }
                }
            }
        }
        chain.doFilter(req, res);
    }

    public static void error(HttpServletResponse res, int status, String message)
        throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.getWriter().write(new Gson().toJson(Map.of("error", message)));
    }
}
