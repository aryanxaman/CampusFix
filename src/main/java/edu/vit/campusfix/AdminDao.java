package edu.vit.campusfix;

import java.sql.*;
import java.util.*;

/** JDBC persistence for administration. Receives validated data and password hashes from AdminService. */
public final class AdminDao {

    static void audit(Connection c, User actor, String action, Long target) throws SQLException {
        Database.update(
            c,
            "INSERT INTO admin_audit(actor_id,action,target_user_id) VALUES(?,?,?)",
            actor.id(),
            action,
            target
        );
    }

    private static boolean bool(Map<String, String> d, String key, boolean fallback) {
        if (!d.containsKey(key)) return fallback;
        if (!Set.of("true", "false").contains(d.get(key))) throw new ApiException(
            400,
            "Invalid " + key + " value."
        );
        return Boolean.parseBoolean(d.get(key));
    }

    static void lockAdmins(Connection c, User actor) throws SQLException {
        boolean authorized = false;
        try (
            PreparedStatement p = c.prepareStatement(
                "SELECT id,active FROM users WHERE role='ADMIN' ORDER BY id FOR UPDATE"
            );
            ResultSet r = p.executeQuery()
        ) {
            while (r.next()) if (r.getLong(1) == actor.id() && r.getBoolean(2)) authorized = true;
        }
        if (!authorized) throw new ApiException(
            403,
            "Your administrator access is no longer active."
        );
    }

    public List<Map<String, Object>> users(User actor) throws SQLException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT u.id,u.name,u.email,u.role,u.active,u.created_at,m.specialization,m.available,u.hostel_block FROM users u LEFT JOIN maintenance_staff m ON m.user_id=u.id ORDER BY u.name"
            );
            ResultSet r = p.executeQuery()
        ) {
            while (r.next()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", r.getLong(1));
                row.put("name", r.getString(2));
                row.put("email", r.getString(3));
                row.put("role", r.getString(4));
                row.put("active", r.getBoolean(5));
                row.put("createdAt", r.getTimestamp(6).toInstant().toString());
                row.put("specialization", r.getString(7));
                row.put("available", r.getBoolean(8));
                row.put("hostelBlock", r.getString(9));
                result.add(row);
            }
        }
        return result;
    }

    public long create(
        User actor,
        String name,
        String email,
        String userRole,
        String hash,
        boolean active,
        String specialization,
        boolean available,
        String hostelBlock
    ) throws SQLException {
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                lockAdmins(c, actor);
                try (
                    PreparedStatement p = c.prepareStatement("SELECT id FROM users WHERE email=?")
                ) {
                    p.setString(1, email);
                    try (ResultSet r = p.executeQuery()) {
                        if (r.next()) throw new ApiException(
                            409,
                            "That email already has an account."
                        );
                    }
                }
                long id = Database.insert(
                    c,
                    "INSERT INTO users(name,email,password_hash,role,active,hostel_block) VALUES(?,?,?,?,?,?)",
                    name,
                    email,
                    hash,
                    userRole,
                    active,
                    hostelBlock
                );
                if (userRole.equals("STAFF")) Database.update(
                    c,
                    "INSERT INTO maintenance_staff(user_id,specialization,available) VALUES(?,?,?)",
                    id,
                    specialization,
                    available
                );
                audit(c, actor, "USER_CREATED", id);
                c.commit();
                return id;
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                if (
                    e instanceof SQLException sql && "23000".equals(sql.getSQLState())
                ) throw new ApiException(409, "An account with that email already exists.");
                throw e;
            }
        }
    }

    public void update(User actor, long id, Map<String, String> d) throws SQLException {
        String requestedRole = d.get("role");
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                lockAdmins(c, actor);
                String oldRole;
                boolean oldActive;
                String name;
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT role,active,name FROM users WHERE id=? FOR UPDATE"
                    )
                ) {
                    p.setLong(1, id);
                    try (ResultSet r = p.executeQuery()) {
                        if (!r.next()) throw new ApiException(404, "User not found.");
                        oldRole = r.getString(1);
                        oldActive = r.getBoolean(2);
                        name = r.getString(3);
                    }
                }
                String nextRole = requestedRole == null ? oldRole : requestedRole;
                boolean active = bool(d, "active", oldActive);
                if (
                    id == actor.id() && (!active || !nextRole.equals("ADMIN"))
                ) throw new ApiException(
                    409,
                    "You cannot disable your own account or remove your own administrator role."
                );
                if (
                    oldRole.equals("ADMIN") && oldActive && (!active || !nextRole.equals("ADMIN"))
                ) {
                    try (
                        PreparedStatement p = c.prepareStatement(
                            "SELECT COUNT(*) FROM users WHERE role='ADMIN' AND active=TRUE"
                        );
                        ResultSet r = p.executeQuery()
                    ) {
                        r.next();
                        if (r.getLong(1) <= 1) throw new ApiException(
                            409,
                            "Keep at least one active administrator."
                        );
                    }
                }
                if (oldRole.equals("STAFF") && (!nextRole.equals("STAFF") || !active)) {
                    try (
                        PreparedStatement p = c.prepareStatement(
                            "SELECT id FROM complaints WHERE assigned_staff_id=? AND status NOT IN ('RESOLVED','CLOSED') FOR UPDATE"
                        )
                    ) {
                        p.setLong(1, id);
                        try (ResultSet r = p.executeQuery()) {
                            if (r.next()) throw new ApiException(
                                409,
                                "Reassign active complaints before disabling staff or changing their role."
                            );
                        }
                    }
                }
                if (d.containsKey("name")) name = d.get("name");
                if (nextRole.equals("STAFF")) {
                    String specialization = d
                        .getOrDefault("specialization", "General maintenance")
                        .trim();
                    if (
                        specialization.isEmpty() || specialization.length() > 150
                    ) throw new ApiException(400, "Provide a valid specialization.");
                    Database.update(
                        c,
                        "INSERT IGNORE INTO maintenance_staff(user_id,specialization) VALUES(?,?)",
                        id,
                        specialization
                    );
                    if (d.containsKey("specialization")) Database.update(
                        c,
                        "UPDATE maintenance_staff SET specialization=? WHERE user_id=?",
                        specialization,
                        id
                    );
                    if (d.containsKey("available")) Database.update(
                        c,
                        "UPDATE maintenance_staff SET available=? WHERE user_id=?",
                        bool(d, "available", true),
                        id
                    );
                }
                if (d.containsKey("hostelBlock")) {
                    Database.update(
                        c,
                        "UPDATE users SET hostel_block=? WHERE id=?",
                        d.get("hostelBlock").isBlank() ? null : d.get("hostelBlock"),
                        id
                    );
                }
                boolean revoke =
                    !nextRole.equals(oldRole) ||
                    active != oldActive ||
                    d.containsKey("hostelBlock");
                Database.update(
                    c,
                    "UPDATE users SET name=?,role=?,active=?,auth_version=auth_version+? WHERE id=?",
                    name,
                    nextRole,
                    active,
                    revoke ? 1 : 0,
                    id
                );
                audit(c, actor, "USER_UPDATED", id);
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    public void resetPassword(User actor, long id, String hash) throws SQLException {
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                lockAdmins(c, actor);
                if (
                    Database.update(
                        c,
                        "UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?",
                        hash,
                        id
                    ) == 0
                ) throw new ApiException(404, "User not found.");
                audit(c, actor, "PASSWORD_RESET", id);
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }
}
