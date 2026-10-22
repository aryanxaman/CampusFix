package edu.vit.campusfix;

import java.sql.*;
import java.util.*;
import org.mindrot.jbcrypt.BCrypt;

/** Administrative authorization and input policy. All persistence is delegated to AdminDao. */
public final class AdminService {

    private static final Set<String> ROLES = Set.of("STUDENT", "FACULTY", "ADMIN", "STAFF");
    private final AdminDao dao = new AdminDao();

    public static void requireAdmin(User user) {
        if (user == null || !user.isAdmin()) throw new ApiException(
            403,
            "Administrator access is required."
        );
    }

    public static void validatePassword(String password) {
        if (
            password == null ||
            password.length() < 12 ||
            password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72
        ) throw new ApiException(
            400,
            "Use a password with at least 12 characters and at most 72 UTF-8 bytes."
        );
    }

    private static void role(String role) {
        if (role == null || !ROLES.contains(role)) throw new ApiException(
            400,
            "Choose a supported account role."
        );
    }

    private static boolean bool(Map<String, String> d, String key, boolean fallback) {
        if (!d.containsKey(key)) return fallback;
        if (
            d.get(key) == null || !Set.of("true", "false").contains(d.get(key))
        ) throw new ApiException(400, "Invalid " + key + " value.");
        return Boolean.parseBoolean(d.get(key));
    }

    public List<Map<String, Object>> users(User actor) throws SQLException {
        requireAdmin(actor);
        return dao.users(actor);
    }

    public long create(User actor, Map<String, String> d) throws SQLException {
        requireAdmin(actor);
        String name = ComplaintService.text(d, "name", 2, 100),
            email = ComplaintService.text(d, "email", 3, 190).toLowerCase(Locale.ROOT),
            userRole = ComplaintService.text(d, "role", 3, 10);
        role(userRole);
        validatePassword(d.get("password"));
        if (
            !email.matches("[^@\\s]+@(?:(?:[a-zA-Z0-9-]+\\.)?vit\\.ac\\.in|vitstudent\\.ac\\.in)")
        ) throw new ApiException(400, "Use a valid VIT campus email address.");
        String specialization = d.getOrDefault("specialization", "General maintenance");
        if (specialization == null) specialization = "General maintenance";
        specialization = specialization.trim();
        if (specialization.isEmpty()) specialization = "General maintenance";
        if (specialization.length() > 150) throw new ApiException(
            400,
            "Specialization is too long."
        );
        return dao.create(
            actor,
            name,
            email,
            userRole,
            BCrypt.hashpw(d.get("password"), BCrypt.gensalt(12)),
            bool(d, "active", true),
            specialization,
            bool(d, "available", true),
            hostelBlock(d)
        );
    }

    public void update(User actor, long id, Map<String, String> data) throws SQLException {
        requireAdmin(actor);
        Map<String, String> d = new HashMap<>(data);
        if (d.containsKey("role")) role(d.get("role"));
        if (d.containsKey("name")) d.put("name", ComplaintService.text(d, "name", 2, 100));
        if (d.containsKey("specialization")) d.put(
            "specialization",
            ComplaintService.text(d, "specialization", 1, 150)
        );
        bool(d, "active", true);
        bool(d, "available", true);
        if (d.containsKey("hostelBlock")) d.put("hostelBlock", hostelBlock(d));
        dao.update(actor, id, d);
    }

    private static String hostelBlock(Map<String, String> d) throws SQLException {
        String block = d.getOrDefault("hostelBlock", "");
        if (block == null) throw new ApiException(400, "Choose a valid hostel block.");
        block = block.trim();
        if (
            !block.isEmpty() && !new SettingsDao().get().hostelBlocks.contains(block)
        ) throw new ApiException(400, "Choose a valid hostel block.");
        return block;
    }

    public void resetPassword(User actor, long id, String password) throws SQLException {
        requireAdmin(actor);
        validatePassword(password);
        dao.resetPassword(actor, id, BCrypt.hashpw(password, BCrypt.gensalt(12)));
    }
}
