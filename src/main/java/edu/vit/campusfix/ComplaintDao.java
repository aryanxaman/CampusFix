package edu.vit.campusfix;

import java.sql.*;
import java.util.*;

/** Parameterized JDBC only. Each mutation records its timeline and notifications atomically. */
public final class ComplaintDao {

    public record Upload(String filePath, String fileType, long fileSize, String originalName) {}

    private static String iso(Timestamp t) {
        return t == null ? null : t.toInstant().toString();
    }

    private static String scope(User u) {
        return u.isAdmin() ? "1=1" : u.isStaff() ? "c.assigned_staff_id=?" : "c.user_id=?";
    }

    private static void scopeBind(PreparedStatement p, User u) throws SQLException {
        if (!u.isAdmin()) p.setLong(1, u.id());
    }

    public List<Map<String, Object>> list(User u) throws SQLException {
        try (Connection c = Database.connect()) {
            // All three queries must see the same snapshot during reporting and reassignment.
            c.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
            c.setAutoCommit(false);
            AppSettings config = SettingsDao.get(c);
            Map<Long, Map<String, Object>> tickets = new LinkedHashMap<>();
            String sql =
                "SELECT c.*,u.name reporter,s.name assigned_staff,k.name category,l.type,l.block,l.floor,l.room,f.rating,f.comment FROM complaints c JOIN users u ON u.id=c.user_id JOIN categories k ON k.id=c.category_id JOIN locations l ON l.id=c.location_id LEFT JOIN users s ON s.id=c.assigned_staff_id LEFT JOIN feedback f ON f.complaint_id=c.id WHERE " +
                scope(u) +
                " ORDER BY c.created_at DESC";
            try (PreparedStatement p = c.prepareStatement(sql)) {
                scopeBind(p, u);
                try (ResultSet r = p.executeQuery()) {
                    while (r.next()) {
                        Map<String, Object> t = new LinkedHashMap<>();
                        long id = r.getLong("id");
                        t.put("id", id);
                        t.put("userId", r.getLong("user_id"));
                        for (String field : List.of(
                            "title",
                            "description",
                            "priority",
                            "status",
                            "reporter",
                            "category",
                            "type",
                            "block",
                            "floor",
                            "room"
                        ))
                            t.put(field, r.getString(field));
                        t.put("assignedStaffId", r.getObject("assigned_staff_id"));
                        t.put("assignedStaff", r.getString("assigned_staff"));
                        t.put("createdAt", iso(r.getTimestamp("created_at")));
                        t.put("updatedAt", iso(r.getTimestamp("updated_at")));
                        t.put("rating", r.getObject("rating"));
                        t.put("feedback", r.getString("comment"));
                        t.put("updates", new ArrayList<>());
                        t.put("attachments", new ArrayList<>());
                        tickets.put(id, t);
                        Timestamp resolved = r.getTimestamp("resolved_at");
                        t.put("resolvedAt", iso(resolved));
                        t.put(
                            "sla",
                            SlaService.evaluate(
                                r.getString("priority"),
                                r.getString("status"),
                                r.getTimestamp("created_at").toInstant(),
                                resolved == null ? null : resolved.toInstant(),
                                config,
                                java.time.Instant.now()
                            )
                        );
                    }
                }
            }
            if (!tickets.isEmpty()) {
                String updates =
                    "SELECT x.complaint_id,x.status,x.remarks,x.created_at,a.name FROM complaint_updates x JOIN users a ON a.id=x.actor_id JOIN complaints c ON c.id=x.complaint_id WHERE " +
                    scope(u) +
                    " ORDER BY x.created_at,x.id";
                try (PreparedStatement p = c.prepareStatement(updates)) {
                    scopeBind(p, u);
                    try (ResultSet r = p.executeQuery()) {
                        while (r.next()) {
                            Map<String, Object> item = new LinkedHashMap<>();
                            item.put("status", r.getString(2));
                            item.put("remarks", r.getString(3));
                            item.put("createdAt", iso(r.getTimestamp(4)));
                            item.put("actor", r.getString(5));
                            children(tickets.get(r.getLong(1)), "updates").add(item);
                        }
                    }
                }
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT a.id,a.complaint_id,a.original_name FROM attachments a JOIN complaints c ON c.id=a.complaint_id WHERE " +
                            scope(u)
                    )
                ) {
                    scopeBind(p, u);
                    try (ResultSet r = p.executeQuery()) {
                        while (r.next())
                            children(tickets.get(r.getLong(2)), "attachments").add(
                                Map.of("id", r.getLong(1), "name", r.getString(3))
                            );
                    }
                }
            }
            c.commit();
            return new ArrayList<>(tickets.values());
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> children(Map<String, Object> t, String key) {
        return (List<Map<String, Object>>) t.get(key);
    }

    private static void history(Connection c, long id, User u, String status, String remarks)
        throws SQLException {
        Database.update(
            c,
            "INSERT INTO complaint_updates(complaint_id,actor_id,status,remarks) VALUES(?,?,?,?)",
            id,
            u.id(),
            status,
            remarks
        );
    }

    private static void notify(Connection c, long user, long id, String message)
        throws SQLException {
        AppSettings config = SettingsDao.get(c);
        String role = "";
        try (PreparedStatement p = c.prepareStatement("SELECT role FROM users WHERE id=?")) {
            p.setLong(1, user);
            try (ResultSet r = p.executeQuery()) {
                if (r.next()) role = r.getString(1);
            }
        }
        if (
            "STAFF".equals(role)
                ? !config.notifyStaff
                : "ADMIN".equals(role)
                  ? !config.notifyAdmins
                  : !config.notifyReporter
        ) return;
        Database.update(
            c,
            "INSERT INTO notifications(user_id,complaint_id,message) VALUES(?,?,?)",
            user,
            id,
            "CF-" + id + ": " + message
        );
    }

    private static void notifyAdmins(Connection c, long id, String message) throws SQLException {
        if (!SettingsDao.get(c).notifyAdmins) return;
        Database.update(
            c,
            "INSERT INTO notifications(user_id,complaint_id,message) SELECT id,?,? FROM users WHERE role='ADMIN' AND active=TRUE",
            id,
            "CF-" + id + ": " + message
        );
    }

    public long create(User u, Map<String, String> d, List<Upload> photos) throws SQLException {
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                long category;
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM categories WHERE name=?"
                    )
                ) {
                    p.setString(1, d.get("category"));
                    try (ResultSet r = p.executeQuery()) {
                        if (!r.next()) throw new ApiException(400, "Category is unavailable.");
                        category = r.getLong(1);
                    }
                }
                Database.update(
                    c,
                    "INSERT IGNORE INTO locations(type,block,floor,room) VALUES(?,?,?,?)",
                    d.get("type"),
                    d.get("block"),
                    d.get("floor"),
                    d.get("room").trim()
                );
                long location;
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM locations WHERE type=? AND block=? AND floor=? AND room=?"
                    )
                ) {
                    Database.bind(
                        p,
                        d.get("type"),
                        d.get("block"),
                        d.get("floor"),
                        d.get("room").trim()
                    );
                    try (ResultSet r = p.executeQuery()) {
                        if (!r.next()) throw new SQLException("Location not found");
                        location = r.getLong(1);
                    }
                }
                long id = Database.insert(
                    c,
                    "INSERT INTO complaints(user_id,category_id,location_id,title,description,priority) VALUES(?,?,?,?,?,?)",
                    u.id(),
                    category,
                    location,
                    d.get("title").trim(),
                    d.get("description").trim(),
                    d.get("priority")
                );
                for (Upload f : photos)
                    Database.update(
                        c,
                        "INSERT INTO attachments(complaint_id,uploaded_by,file_path,file_type,file_size,original_name) VALUES(?,?,?,?,?,?)",
                        id,
                        u.id(),
                        f.filePath(),
                        f.fileType(),
                        f.fileSize(),
                        f.originalName()
                    );
                history(
                    c,
                    id,
                    u,
                    "REPORTED",
                    "Complaint submitted. Our campus team will review it shortly."
                );
                notify(c, u.id(), id, "Your complaint has been submitted.");
                notifyAdmins(c, id, "New complaint: " + d.get("title").trim());
                c.commit();
                return id;
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    private static Map<String, Object> lock(Connection c, long id) throws SQLException {
        try (
            PreparedStatement p = c.prepareStatement(
                "SELECT user_id,assigned_staff_id,status,priority FROM complaints WHERE id=? FOR UPDATE"
            )
        ) {
            p.setLong(1, id);
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) throw new ApiException(404, "Complaint not found.");
                Map<String, Object> result = new HashMap<>();
                result.put("owner", r.getLong(1));
                Object assigned = r.getObject(2);
                result.put("assigned", assigned == null ? null : ((Number) assigned).longValue());
                result.put("status", r.getString(3));
                result.put("priority", r.getString(4));
                return result;
            }
        }
    }

    public void updateWorkflow(User u, long id, Map<String, String> d) throws SQLException {
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                Map<String, Object> old = lock(c, id);
                Long assigned = (Long) old.get("assigned"),
                    chosen = assigned;
                if (u.isAdmin() && d.get("staffId") != null && !d.get("staffId").isBlank()) {
                    try {
                        chosen = Long.valueOf(d.get("staffId"));
                    } catch (NumberFormatException e) {
                        throw new ApiException(400, "Invalid staff member.");
                    }
                    if (!Objects.equals(chosen, assigned)) try (
                        PreparedStatement p = c.prepareStatement(
                            "SELECT m.user_id FROM maintenance_staff m JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND u.role='STAFF' AND u.active=TRUE AND m.available=TRUE FOR UPDATE"
                        )
                    ) {
                        p.setLong(1, chosen);
                        try (ResultSet r = p.executeQuery()) {
                            if (!r.next()) throw new ApiException(
                                400,
                                "Choose an available maintenance staff member."
                            );
                        }
                    }
                }
                String next = d.get("status");
                ComplaintService.validateTransition(
                    u,
                    (String) old.get("status"),
                    next,
                    chosen,
                    assigned
                );
                String priority = u.isAdmin() ? d.get("priority") : (String) old.get("priority");
                // Staff cannot reassign tickets or change priority, regardless of supplied JSON.
                if (!u.isAdmin()) chosen = assigned;
                Database.update(
                    c,
                    "UPDATE complaints SET status=?,priority=?,assigned_staff_id=?,updated_at=CURRENT_TIMESTAMP,resolved_at=CASE WHEN ?='RESOLVED' THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id=?",
                    next,
                    priority,
                    chosen,
                    next,
                    id
                );
                history(c, id, u, next, d.get("remarks").trim());
                notify(
                    c,
                    (Long) old.get("owner"),
                    id,
                    next.replace('_', ' ') + ". " + d.get("remarks").trim()
                );
                if (chosen != null && !Objects.equals(chosen, assigned)) notify(
                    c,
                    chosen,
                    id,
                    "A complaint has been assigned to you."
                );
                if (u.isStaff()) notifyAdmins(c, id, "Staff update: " + next.replace('_', ' '));
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    public void feedback(User u, long id, int rating, String comment) throws SQLException {
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                Map<String, Object> old = lock(c, id);
                if (!u.canReport() || (Long) old.get("owner") != u.id()) throw new ApiException(
                    403,
                    "Only the reporter can submit feedback."
                );
                if (!"RESOLVED".equals(old.get("status"))) throw new ApiException(
                    409,
                    "Feedback is available once the complaint is resolved."
                );
                Database.update(
                    c,
                    "INSERT INTO feedback(complaint_id,user_id,rating,comment) VALUES(?,?,?,?)",
                    id,
                    u.id(),
                    rating,
                    comment
                );
                Database.update(
                    c,
                    "UPDATE complaints SET status='CLOSED',updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    id
                );
                history(c, id, u, "CLOSED", "Feedback received. Complaint closed.");
                notify(c, u.id(), id, "Thank you for your feedback. Complaint closed.");
                notifyAdmins(c, id, "Complaint closed with a " + rating + "/5 rating.");
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    public List<Map<String, Object>> notifications(User u) throws SQLException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT id,message,is_read,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100"
            )
        ) {
            p.setLong(1, u.id());
            try (ResultSet r = p.executeQuery()) {
                while (r.next())
                    result.add(
                        Map.of(
                            "id",
                            r.getLong(1),
                            "message",
                            r.getString(2),
                            "read",
                            r.getBoolean(3),
                            "createdAt",
                            iso(r.getTimestamp(4))
                        )
                    );
            }
        }
        return result;
    }

    public void readNotifications(User u) throws SQLException {
        try (Connection c = Database.connect()) {
            Database.update(c, "UPDATE notifications SET is_read=TRUE WHERE user_id=?", u.id());
        }
    }

    public Upload attachment(User u, long id) throws SQLException {
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT a.file_path,a.file_type,a.file_size,a.original_name,c.user_id,c.assigned_staff_id FROM attachments a JOIN complaints c ON c.id=a.complaint_id WHERE a.id=?"
            )
        ) {
            p.setLong(1, id);
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) throw new ApiException(404, "Photo not found.");
                Object staff = r.getObject(6);
                if (
                    !u.canRead(r.getLong(5), staff == null ? null : ((Number) staff).longValue())
                ) throw new ApiException(403, "You cannot view this photo.");
                return new Upload(r.getString(1), r.getString(2), r.getLong(3), r.getString(4));
            }
        }
    }
}
