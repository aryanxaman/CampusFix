package edu.vit.campusfix;

import com.google.gson.Gson;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import org.mindrot.jbcrypt.BCrypt;

/** Local setup CLI. Reads the first administrator's password from stdin, never command arguments. */
public final class BootstrapAdmin {

    public static void main(String[] args) throws Exception {
        try (Connection c = Database.connect()) {
            if (args.length == 1 && args[0].equals("check")) {
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM users WHERE role='ADMIN' AND active=TRUE LIMIT 1"
                    );
                    ResultSet r = p.executeQuery()
                ) {
                    System.exit(r.next() ? 0 : 3);
                }
                return;
            }
            @SuppressWarnings("unchecked")
            Map<String, String> data = new Gson().fromJson(
                new InputStreamReader(System.in, StandardCharsets.UTF_8),
                Map.class
            );
            if (data == null) throw new IllegalArgumentException(
                "Administrator details are required."
            );
            String name = ComplaintService.text(data, "name", 2, 100),
                email = ComplaintService.text(data, "email", 3, 190).toLowerCase(Locale.ROOT);
            if (
                !email.matches(
                    "[^@\\s]+@(?:(?:[a-zA-Z0-9-]+\\.)?vit\\.ac\\.in|vitstudent\\.ac\\.in)"
                )
            ) throw new IllegalArgumentException("Use a valid VIT campus email address.");
            AdminService.validatePassword(data.get("password"));
            String hash = BCrypt.hashpw(data.get("password"), BCrypt.gensalt(12));
            c.setAutoCommit(false);
            try {
                // Serialize first-run provisioning with the same persistent row used for settings changes.
                Database.update(
                    c,
                    "INSERT IGNORE INTO app_settings(id,config_json) VALUES(1,?)",
                    new Gson().toJson(new AppSettings())
                );
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM app_settings WHERE id=1 FOR UPDATE"
                    );
                    ResultSet r = p.executeQuery()
                ) {
                    r.next();
                }
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM users WHERE role='ADMIN' LIMIT 1"
                    );
                    ResultSet r = p.executeQuery()
                ) {
                    if (r.next()) throw new IllegalStateException(
                        "An administrator already exists. Sign in or contact the existing administrator."
                    );
                }
                Database.insert(
                    c,
                    "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'ADMIN')",
                    name,
                    email,
                    hash
                );
                c.commit();
                System.out.println(
                    "Your administrator account is ready. Sign in with the email and password you just entered."
                );
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
    }
}
