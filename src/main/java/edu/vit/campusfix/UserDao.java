package edu.vit.campusfix;

import java.sql.*;
import java.util.*;
import org.mindrot.jbcrypt.BCrypt;

public final class UserDao {

    // A dummy hash keeps nonexistent-user verification on the same expensive code path.
    private static final String DUMMY = BCrypt.hashpw("not-a-real-password", BCrypt.gensalt(12));

    public record Identity(User user, int version) {}

    public long registerStudent(String name, String email, String hash, String hostelBlock)
        throws SQLException {
        try (Connection c = Database.connect()) {
            return Database.insert(
                c,
                "INSERT INTO users(name,email,password_hash,role,hostel_block) VALUES(?,?,?,'STUDENT',?)",
                name,
                email,
                hash,
                hostelBlock
            );
        } catch (SQLException error) {
            if (
                "23000".equals(error.getSQLState()) || "23505".equals(error.getSQLState())
            ) throw new ApiException(
                409,
                "An account with this email already exists. Please sign in."
            );
            throw error;
        }
    }

    public User authenticate(String email, String password) throws SQLException {
        Identity identity = authenticateIdentity(email, password);
        return identity == null ? null : identity.user();
    }

    public Identity authenticateIdentity(String email, String password) throws SQLException {
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT id,name,email,role,password_hash,auth_version,hostel_block FROM users WHERE email=? AND active=TRUE AND deleted_at IS NULL"
            )
        ) {
            p.setString(1, email.toLowerCase(Locale.ROOT));
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) {
                    BCrypt.checkpw(password, DUMMY);
                    return null;
                }
                if (!BCrypt.checkpw(password, r.getString("password_hash"))) return null;
                return new Identity(
                    new User(
                        r.getLong("id"),
                        r.getString("name"),
                        r.getString("email"),
                        r.getString("role"),
                        r.getString("hostel_block")
                    ),
                    r.getInt("auth_version")
                );
            }
        }
    }

    public Identity identity(long id) throws SQLException {
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT name,email,role,auth_version,hostel_block FROM users WHERE id=? AND active=TRUE AND deleted_at IS NULL"
            )
        ) {
            p.setLong(1, id);
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) return null;
                return new Identity(
                    new User(id, r.getString(1), r.getString(2), r.getString(3), r.getString(5)),
                    r.getInt(4)
                );
            }
        }
    }

    public List<Map<String, Object>> staff() throws SQLException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT u.id,u.name,m.specialization,m.available FROM users u JOIN maintenance_staff m ON u.id=m.user_id WHERE u.active=TRUE AND u.role='STAFF' AND u.deleted_at IS NULL ORDER BY u.name"
            );
            ResultSet r = p.executeQuery()
        ) {
            while (r.next())
                result.add(
                    Map.of(
                        "id",
                        r.getLong(1),
                        "name",
                        r.getString(2),
                        "specialization",
                        r.getString(3),
                        "available",
                        r.getBoolean(4)
                    )
                );
        }
        return result;
    }
}
