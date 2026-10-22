package edu.vit.campusfix;

import java.sql.*;
import java.util.*;
import org.mindrot.jbcrypt.BCrypt;

/** Not packaged in the WAR. Only provisions a fresh, explicitly opted-in verification database. */
public final class DeploymentFixture {

    public static void main(String[] args) throws Exception {
        if (!"yes".equals(System.getenv("CAMPUSFIX_TEST_FIXTURE"))) throw new IllegalStateException(
            "Fixture opt-in is required."
        );
        String password = System.getenv("CAMPUSFIX_TEST_PASSWORD");
        AdminService.validatePassword(password);
        String hash = BCrypt.hashpw(password, BCrypt.gensalt(12));
        try (Connection c = Database.connect()) {
            if (args.length > 0 && args[0].equals("age")) {
                // Only age the dedicated smoke-test complaint, never an arbitrary production row.
                Database.update(
                    c,
                    "UPDATE complaints SET created_at=TIMESTAMPADD(HOUR,-100,CURRENT_TIMESTAMP) WHERE title='Deployment verification complaint'"
                );
                System.out.println("Verification complaint aged for SLA escalation check.");
                return;
            }
            try (
                Statement p = c.createStatement();
                ResultSet r = p.executeQuery("SELECT COUNT(*) FROM users")
            ) {
                r.next();
                if (r.getLong(1) != 0) throw new IllegalStateException(
                    "Fixture refuses to modify a database that already has accounts."
                );
            }
            c.setAutoCommit(false);
            try {
                for (String role : List.of("ADMIN", "STUDENT", "FACULTY", "STAFF")) {
                    long id = Database.insert(
                        c,
                        "INSERT INTO users(name,email,password_hash,role,hostel_block) VALUES(?,?,?,?,?)",
                        "Verification " + role,
                        role.toLowerCase(Locale.ROOT) + ".it@vit.ac.in",
                        hash,
                        role,
                        "STUDENT".equals(role) ? "VERIFY" : null
                    );
                    if (role.equals("STAFF")) Database.update(
                        c,
                        "INSERT INTO maintenance_staff(user_id,specialization) VALUES(?,?)",
                        id,
                        "Electrical"
                    );
                }
                c.commit();
                System.out.println(
                    "Provisioned four verification roles. Passwords were not logged."
                );
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
    }
}
