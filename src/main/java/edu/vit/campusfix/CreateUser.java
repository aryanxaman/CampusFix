package edu.vit.campusfix;

import java.io.Console;
import java.sql.*;
import java.util.*;
import org.mindrot.jbcrypt.BCrypt;

/** Trusted administrator CLI; passwords are read from the console, never command-line arguments. */
public final class CreateUser {

    public static void main(String[] args) throws Exception {
        if (args.length < 3 || args.length > 4) {
            System.err.println(
                "Usage: CreateUser <name> <email> <STUDENT|FACULTY|ADMIN|STAFF> [specialization]"
            );
            System.exit(2);
        }
        String role = args[2].toUpperCase(Locale.ROOT),
            email = args[1].toLowerCase(Locale.ROOT);
        if (
            !Set.of("STUDENT", "FACULTY", "ADMIN", "STAFF").contains(role) ||
            !email.matches(
                "[^@\\s]+@(?:(?:[a-zA-Z0-9-]+\\.)?vit\\.ac\\.in|vitstudent\\.ac\\.in)"
            ) ||
            args[0].isBlank() ||
            args[0].length() > 100
        ) throw new IllegalArgumentException("Use a valid name, VIT email and role.");
        Console console = System.console();
        if (console == null) throw new IllegalStateException(
            "Run in an interactive terminal to enter a hidden password."
        );
        char[] password = console.readPassword("Password (12–72 characters): ");
        char[] confirm = console.readPassword("Confirm password: ");
        try {
            if (
                password.length < 12 || password.length > 72 || !Arrays.equals(password, confirm)
            ) throw new IllegalArgumentException(
                "Passwords must match and contain 12–72 characters."
            );
            AdminService.validatePassword(new String(password));
            String hash = BCrypt.hashpw(new String(password), BCrypt.gensalt(12));
            try (Connection c = Database.connect()) {
                c.setAutoCommit(false);
                try {
                    long id = Database.insert(
                        c,
                        "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
                        args[0],
                        email,
                        hash,
                        role
                    );
                    if ("STAFF".equals(role)) Database.update(
                        c,
                        "INSERT INTO maintenance_staff(user_id,specialization) VALUES(?,?)",
                        id,
                        args.length == 4 ? args[3] : "General maintenance"
                    );
                    c.commit();
                    System.out.println("Created " + role + " account for " + email);
                } catch (Exception e) {
                    c.rollback();
                    throw e;
                }
            }
        } finally {
            Arrays.fill(password, '\0');
            Arrays.fill(confirm, '\0');
        }
    }
}
