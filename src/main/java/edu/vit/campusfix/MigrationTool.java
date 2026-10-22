package edu.vit.campusfix;

import java.nio.file.*;
import java.sql.*;

/** Explicit additive migration CLI. Never drops records, tables, or legacy staff profiles. */
public final class MigrationTool {

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException(
            "Usage: MigrationTool <database/schema.sql>"
        );
        try (Connection c = Database.connect()) {
            boolean version = false;
            try (
                ResultSet columns = c
                    .getMetaData()
                    .getColumns(c.getCatalog(), null, "users", "auth_version")
            ) {
                version = columns.next();
            }
            boolean users = false;
            try (
                ResultSet tables = c
                    .getMetaData()
                    .getTables(c.getCatalog(), null, "users", new String[] { "TABLE" })
            ) {
                users = tables.next();
            }
            if (users && !version) try (Statement s = c.createStatement()) {
                s.execute("ALTER TABLE users ADD COLUMN auth_version INT NOT NULL DEFAULT 1");
            }
            if (users) {
                try (
                    ResultSet columns = c
                        .getMetaData()
                        .getColumns(c.getCatalog(), null, "users", "hostel_block")
                ) {
                    if (!columns.next()) try (Statement st = c.createStatement()) {
                        st.execute("ALTER TABLE users ADD COLUMN hostel_block VARCHAR(10)");
                    }
                }
            }
            String schema = Files.readString(Path.of(args[0]))
                .replaceAll("(?m)^CREATE DATABASE[^;]+;", "")
                .replaceAll("(?m)^USE [^;]+;", "")
                .replaceAll("(?m)^--.*$", "");
            for (String sql : schema.split(";"))
                if (!sql.isBlank()) try (Statement s = c.createStatement()) {
                    s.execute(sql);
                }
            System.out.println(
                "CampusFix schema is ready. Existing users, complaints, photos and feedback were preserved."
            );
        }
    }
}
