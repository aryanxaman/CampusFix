package edu.vit.campusfix;

import com.google.gson.*;
import com.google.gson.reflect.TypeToken;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.file.*;
import java.sql.SQLException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@WebServlet("/api/*")
@MultipartConfig(
    maxFileSize = 10 * 1024 * 1024,
    maxRequestSize = 102 * 1024 * 1024,
    fileSizeThreshold = 1024 * 1024
)
public final class ApiServlet extends HttpServlet {

    private final Gson gson = new GsonBuilder().serializeNulls().create();
    private final ComplaintDao dao = new ComplaintDao();
    private final ComplaintService service = new ComplaintService();
    private final UserDao users = new UserDao();
    private static final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();

    private static final class Attempts {

        int count;
        long first = System.currentTimeMillis();
    }

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse res) throws IOException {
        res.setContentType("application/json");
        try {
            String path = Optional.ofNullable(req.getPathInfo()).orElse("/");
            String method = req.getMethod();
            if ("GET".equals(method) && path.equals("/config")) {
                json(res, new SettingsDao().get());
                return;
            }
            if ("GET".equals(method) && path.equals("/session")) {
                HttpSession s = req.getSession(false);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("user", s == null ? null : s.getAttribute("user"));
                data.put("csrf", s == null ? null : s.getAttribute("csrf"));
                json(res, data);
                return;
            }
            if ("POST".equals(method) && path.equals("/login")) {
                login(req, res);
                return;
            }
            if ("POST".equals(method) && path.equals("/register")) {
                long now = System.currentTimeMillis();
                attempts.entrySet().removeIf(e -> now - e.getValue().first > 15 * 60 * 1000);
                if (attempts.size() > 10000) throw new ApiException(
                    429,
                    "Sign-up is busy. Try again shortly."
                );
                Attempts registration = attempts.computeIfAbsent(
                    "registration:" + req.getRemoteAddr(),
                    key -> new Attempts()
                );
                synchronized (registration) {
                    if (registration.count >= 10) throw new ApiException(
                        429,
                        "Too many sign-up attempts. Please wait 15 minutes."
                    );
                    registration.count++;
                }
                long id = new RegistrationService().register(body(req));
                res.setStatus(201);
                json(res, Map.of("id", id));
                return;
            }
            User user = (User) req.getSession().getAttribute("user");
            if (user == null) throw new ApiException(401, "Please sign in to continue.");
            if ("POST".equals(method) && path.equals("/logout")) {
                req.getSession().invalidate();
                json(res, Map.of("ok", true));
                return;
            }
            if (path.startsWith("/admin/")) {
                AdminService.requireAdmin(user);
                AdminService admin = new AdminService();
                if ("GET".equals(method) && path.equals("/admin/users")) {
                    json(res, Map.of("users", admin.users(user)));
                    return;
                }
                if ("POST".equals(method) && path.equals("/admin/users")) {
                    long id = admin.create(user, body(req));
                    res.setStatus(201);
                    json(res, Map.of("id", id));
                    return;
                }
                if ("POST".equals(method) && path.matches("/admin/users/\\d+/delete")) {
                    Map<String, String> d = body(req);
                    if (!"true".equals(d.get("confirmed"))) throw new ApiException(
                        400,
                        "Confirm user deletion first."
                    );
                    admin.delete(user, Long.parseLong(path.split("/")[3]));
                    json(res, Map.of("ok", true));
                    return;
                }
                if ("POST".equals(method) && path.matches("/admin/users/\\d+/(update|password)")) {
                    String[] segments = path.split("/");
                    long id = Long.parseLong(segments[3]);
                    Map<String, String> d = body(req);
                    if (segments[4].equals("password")) admin.resetPassword(
                        user,
                        id,
                        d.get("password")
                    );
                    else admin.update(user, id, d);
                    json(res, Map.of("ok", true));
                    return;
                }
                if ("GET".equals(method) && path.equals("/admin/settings")) {
                    json(res, new SettingsDao().get());
                    return;
                }
                if ("POST".equals(method) && path.equals("/admin/settings")) {
                    Map<String, String> d = body(req);
                    AppSettings settings = gson.fromJson(d.get("config"), AppSettings.class);
                    if (settings == null) throw new ApiException(400, "Settings are required.");
                    new SettingsDao().save(user, settings);
                    json(res, Map.of("ok", true));
                    return;
                }
                if ("GET".equals(method) && path.equals("/admin/analytics")) {
                    var tickets = dao.list(user);
                    var staff = AnalyticsService.staff(admin.users(user), tickets);
                    json(
                        res,
                        AnalyticsService.report(
                            tickets,
                            staff,
                            new SettingsDao().get(),
                            java.time.Instant.now()
                        )
                    );
                    return;
                }
                if ("GET".equals(method) && path.equals("/admin/health")) {
                    try (
                        var c = Database.connect();
                        var p = c.prepareStatement("SELECT auth_version FROM users WHERE id=?")
                    ) {
                        p.setLong(1, user.id());
                        try (var r = p.executeQuery()) {
                            if (!r.next()) throw new ApiException(
                                503,
                                "Account readiness check failed."
                            );
                        }
                    }
                    String databaseVersion;
                    try (var c = Database.connect()) {
                        for (String table : List.of(
                            "users",
                            "maintenance_staff",
                            "categories",
                            "locations",
                            "complaints",
                            "complaint_updates",
                            "attachments",
                            "feedback",
                            "notifications",
                            "app_settings",
                            "admin_audit",
                            "complaint_escalations",
                            "escalation_recipients"
                        ))
                            try (
                                var p = c.prepareStatement("SELECT 1 FROM " + table + " LIMIT 1");
                                var r = p.executeQuery()
                            ) {
                                /* Required schema table exists. */
                            }
                        try (
                            var p = c.prepareStatement("SELECT VERSION()");
                            var r = p.executeQuery()
                        ) {
                            r.next();
                            databaseVersion = r.getString(1);
                        }
                    }
                    new SettingsDao().get();
                    Files.createDirectories(uploadRoot());
                    Path probe = Files.createTempFile(uploadRoot(), "campusfix-health-", ".tmp");
                    Files.delete(probe);
                    json(
                        res,
                        Map.of(
                            "database",
                            "connected",
                            "databaseVersion",
                            databaseVersion,
                            "schema",
                            "ready",
                            "uploads",
                            "writable",
                            "server",
                            getServletContext().getServerInfo(),
                            "java",
                            System.getProperty("java.version")
                        )
                    );
                    return;
                }
            }
            if ("GET".equals(method) && path.equals("/complaints/deleted")) {
                if (!user.canReport() && !user.isAdmin()) throw new ApiException(
                    403,
                    "Reporter access required."
                );
                json(res, Map.of("tickets", dao.list(user, true)));
                return;
            }
            if ("POST".equals(method) && path.matches("/complaints/\\d+/(edit|delete|restore)")) {
                String[] parts = path.split("/");
                service.manageOwn(user, Long.parseLong(parts[2]), parts[3], body(req));
                json(res, Map.of("ok", true));
                return;
            }
            if ("GET".equals(method) && path.equals("/complaints")) {
                if (user.isAdmin()) new SlaService().escalate();
                var tickets = dao.list(user);
                AppSettings config = new SettingsDao().get();
                var staff = user.isAdmin()
                    ? AnalyticsService.staff(new AdminService().users(user), tickets)
                    : List.of();
                json(
                    res,
                    Map.of(
                        "tickets",
                        tickets,
                        "staff",
                        staff,
                        "notifications",
                        dao.notifications(user),
                        "config",
                        config
                    )
                );
                return;
            }
            if ("POST".equals(method) && path.equals("/complaints")) {
                create(req, res, user);
                return;
            }
            if (
                "POST".equals(method) && path.matches("/complaints/\\d+/(update|feedback|confirm)")
            ) {
                String[] segments = path.split("/");
                long id = Long.parseLong(segments[2]);
                Map<String, String> d = body(req);
                if (segments[3].equals("update")) service.update(user, id, d);
                else if (segments[3].equals("confirm")) service.confirmResolution(user, id, d);
                else service.feedback(user, id, d);
                json(res, Map.of("ok", true));
                return;
            }
            if ("POST".equals(method) && path.equals("/notifications/read")) {
                dao.readNotifications(user);
                json(res, Map.of("ok", true));
                return;
            }
            if ("GET".equals(method) && path.equals("/notifications")) {
                json(res, Map.of("notifications", dao.notifications(user)));
                return;
            }
            if ("GET".equals(method) && path.matches("/attachment/\\d+")) {
                ComplaintDao.Upload file = dao.attachment(user, Long.parseLong(path.substring(12)));
                Path p = uploadRoot().resolve(file.filePath()).normalize();
                if (!p.startsWith(uploadRoot()) || !Files.isRegularFile(p)) throw new ApiException(
                    404,
                    "Photo not found."
                );
                res.setContentType(file.fileType());
                res.setHeader("Content-Disposition", "inline; filename=\"campusfix-photo\"");
                res.setContentLengthLong(Files.size(p));
                Files.copy(p, res.getOutputStream());
                return;
            }
            throw new ApiException(404, "This endpoint does not exist.");
        } catch (ApiException e) {
            SecurityFilter.error(res, e.status(), e.getMessage());
        } catch (JsonParseException | NumberFormatException e) {
            SecurityFilter.error(res, 400, "Please check the submitted data.");
        } catch (IllegalStateException e) {
            SecurityFilter.error(
                res,
                413,
                "Upload exceeds the server request limit. Check the current photo count and per-photo size in campus settings."
            );
        } catch (SQLException e) {
            getServletContext().log("CampusFix database operation failed", e);
            SecurityFilter.error(
                res,
                503,
                "Campus services are unavailable. Please try again shortly."
            );
        } catch (ServletException e) {
            SecurityFilter.error(
                res,
                400,
                "Please submit a valid form with supported photo files."
            );
        } catch (Exception e) {
            getServletContext().log("CampusFix request failed", e);
            SecurityFilter.error(res, 500, "We couldn’t complete that request. Please try again.");
        }
    }

    private void json(HttpServletResponse res, Object data) throws IOException {
        res.getWriter().write(gson.toJson(data));
    }

    private Map<String, String> body(HttpServletRequest req) throws IOException {
        if (
            req.getContentType() == null || !req.getContentType().startsWith("application/json")
        ) throw new ApiException(415, "Send JSON data for this request.");
        StringBuilder text = new StringBuilder();
        char[] buf = new char[2048];
        int n;
        Reader reader = req.getReader();
        while ((n = reader.read(buf)) != -1) {
            text.append(buf, 0, n);
            if (text.length() > 16384) throw new ApiException(413, "Request is too large.");
        }
        Map<String, String> d = gson.fromJson(
            text.toString(),
            new TypeToken<Map<String, String>>() {}.getType()
        );
        if (d == null) throw new ApiException(400, "A request body is required.");
        return d;
    }

    private void login(HttpServletRequest req, HttpServletResponse res)
        throws IOException, SQLException {
        Map<String, String> d = body(req);
        String email = ComplaintService.text(d, "email", 3, 190).toLowerCase(Locale.ROOT),
            password = Optional.ofNullable(d.get("password")).orElse("");
        if (
            password.isEmpty() ||
            password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72
        ) throw new ApiException(401, "Email or password is incorrect.");
        long now = System.currentTimeMillis();
        attempts.entrySet().removeIf(e -> now - e.getValue().first > 15 * 60 * 1000);
        if (attempts.size() > 10000) throw new ApiException(
            429,
            "Sign-in is busy. Please try again shortly."
        );
        // Two independent limits prevent account guessing and rapid IP-based credential spraying.
        String[] keys = { "ip:" + req.getRemoteAddr(), "account:" + email };
        for (String key : keys) {
            Attempts a = attempts.computeIfAbsent(key, k -> new Attempts());
            synchronized (a) {
                if (a.count >= (key.startsWith("ip:") ? 40 : 10)) throw new ApiException(
                    429,
                    "Too many sign-in attempts. Please wait 15 minutes."
                );
                a.count++;
            }
        }
        UserDao.Identity identity = users.authenticateIdentity(email, password);
        if (identity == null) throw new ApiException(401, "Email or password is incorrect.");
        User u = identity.user();
        attempts.remove("account:" + email);
        HttpSession previous = req.getSession(false);
        if (previous != null) previous.invalidate();
        HttpSession session = req.getSession(true);
        session.setMaxInactiveInterval(30 * 60);
        session.setAttribute("user", u);
        session.setAttribute("authVersion", identity.version());
        String csrf = UUID.randomUUID().toString();
        session.setAttribute("csrf", csrf);
        json(res, Map.of("user", u, "csrf", csrf));
    }

    private static Path uploadRoot() {
        return Path.of(
            Database.env(
                "CAMPUSFIX_UPLOAD_DIR",
                Path.of(System.getProperty("user.home"), "campusfix-uploads").toString()
            )
        )
            .toAbsolutePath()
            .normalize();
    }

    private void create(HttpServletRequest req, HttpServletResponse res, User user)
        throws IOException, ServletException, SQLException {
        if (!user.canReport()) throw new ApiException(
            403,
            "Only students and faculty can report issues."
        );
        Map<String, String> d = new HashMap<>();
        for (String key : List.of(
            "title",
            "description",
            "category",
            "priority",
            "type",
            "block",
            "floor",
            "room"
        ))
            d.put(key, req.getParameter(key));
        AppSettings config = new SettingsDao().get();
        ComplaintService.validateReport(user, d, config);
        List<Part> parts = req
            .getParts()
            .stream()
            .filter(p -> p.getSubmittedFileName() != null && p.getSize() > 0)
            .toList();
        if (parts.size() > config.maxPhotos) throw new ApiException(
            400,
            "A maximum of " + config.maxPhotos + " photos is allowed."
        );
        List<ComplaintDao.Upload> saved = new ArrayList<>();
        boolean committed = false;
        try {
            Files.createDirectories(uploadRoot());
            for (Part part : parts) {
                if (
                    !"photos".equals(part.getName()) ||
                    part.getSize() > config.uploadSizeMb * 1024L * 1024L
                ) throw new ApiException(
                    400,
                    "Each photo must be at most " + config.uploadSizeMb + " MB."
                );
                byte[] bytes;
                try (InputStream in = part.getInputStream()) {
                    bytes = in.readNBytes(config.uploadSizeMb * 1024 * 1024 + 1);
                }
                String type = imageType(bytes);
                if (type == null) throw new ApiException(400, "Use JPEG, PNG or WebP photos only.");
                String filename =
                    UUID.randomUUID() +
                    switch (type) {
                        case "image/jpeg" -> ".jpg";
                        case "image/png" -> ".png";
                        default -> ".webp";
                    };
                String original = part.getSubmittedFileName().replace('\\', '/');
                original = original.substring(original.lastIndexOf('/') + 1);
                if (original.length() > 255) original = original.substring(0, 255);
                ComplaintDao.Upload file = new ComplaintDao.Upload(
                    filename,
                    type,
                    bytes.length,
                    original
                );
                saved.add(file);
                Files.write(uploadRoot().resolve(filename), bytes, StandardOpenOption.CREATE_NEW);
            }
            long id = service.report(user, d, saved);
            committed = true;
            res.setStatus(201);
            json(res, Map.of("id", id));
        } finally {
            if (!committed) for (ComplaintDao.Upload f : saved)
                try {
                    Files.deleteIfExists(uploadRoot().resolve(f.filePath()));
                } catch (IOException cleanup) {
                    getServletContext().log("Unable to clean up failed upload", cleanup);
                }
            for (Part p : parts)
                try {
                    p.delete();
                } catch (IOException ignored) {}
        }
    }

    static String imageType(byte[] b) {
        if (
            b.length >= 3 && (b[0] & 255) == 255 && (b[1] & 255) == 216 && (b[2] & 255) == 255
        ) return "image/jpeg";
        if (
            b.length >= 8 &&
            b[0] == (byte) 137 &&
            b[1] == 80 &&
            b[2] == 78 &&
            b[3] == 71 &&
            b[4] == 13 &&
            b[5] == 10 &&
            b[6] == 26 &&
            b[7] == 10
        ) return "image/png";
        if (
            b.length >= 12 &&
            b[0] == 'R' &&
            b[1] == 'I' &&
            b[2] == 'F' &&
            b[3] == 'F' &&
            b[8] == 'W' &&
            b[9] == 'E' &&
            b[10] == 'B' &&
            b[11] == 'P'
        ) return "image/webp";
        return null;
    }
}
