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
                        .getColumns(c.getCatalog(), null, "users", "deleted_at")
                ) {
                    if (!columns.next()) try (Statement st = c.createStatement()) {
                        st.execute("ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL");
                    }
                }
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
            try (
                ResultSet columns = c
                    .getMetaData()
                    .getColumns(c.getCatalog(), null, "complaints", "deleted_at")
            ) {
                if (!columns.next()) {
                    try (
                        ResultSet tables = c
                            .getMetaData()
                            .getTables(c.getCatalog(), null, "complaints", new String[] { "TABLE" })
                    ) {
                        if (tables.next()) try (Statement st = c.createStatement()) {
                            st.execute(
                                "ALTER TABLE complaints ADD COLUMN deleted_at TIMESTAMP NULL"
                            );
                        }
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
            if (c.getMetaData().getDatabaseProductName().toLowerCase().contains("mysql")) {
                String type = "";
                try (
                    Statement st = c.createStatement();
                    ResultSet rs = st.executeQuery("SHOW COLUMNS FROM complaints LIKE 'status'")
                ) {
                    if (rs.next()) type = rs.getString("Type");
                }
                if (!type.contains("PENDING_CONFIRMATION")) try (
                    Statement st = c.createStatement()
                ) {
                    st.execute(
                        "ALTER TABLE complaints MODIFY COLUMN status ENUM('REPORTED','REVIEW','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','PENDING_CONFIRMATION') NOT NULL DEFAULT 'REPORTED'"
                    );
                }
            }
            System.out.println(
                "CampusFix schema is ready. Existing users, complaints, photos and feedback were preserved."
            );
        }
    }
}
