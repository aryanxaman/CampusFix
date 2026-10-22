package edu.vit.campusfix;

import java.sql.*;

/** One connection per operation; JDBC resources are always closed by callers. */
public final class Database {

    private Database() {}

    public static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    public static Connection connect() throws SQLException {
        String url = System.getProperty(
            "campusfix.db.url",
            env(
                "CAMPUSFIX_DB_URL",
                "jdbc:mysql://localhost:3306/campusfix?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC"
            )
        );
        // Explicit loading is important when Connector/J lives inside a Tomcat WAR class loader.
        if (url.startsWith("jdbc:mysql:")) {
            try {
                Class.forName("com.mysql.cj.jdbc.Driver");
            } catch (ClassNotFoundException e) {
                throw new SQLException("MySQL Connector/J is missing from WEB-INF/lib", e);
            }
            if (!url.contains("connectTimeout=")) url +=
                (url.contains("?") ? "&" : "?") + "connectTimeout=5000";
            if (!url.contains("socketTimeout=")) url += "&socketTimeout=15000";
            if (!url.contains("connectionTimeZone=") && !url.contains("serverTimezone=")) url +=
                "&connectionTimeZone=UTC";
            if (!url.contains("forceConnectionTimeZoneToSession=")) url +=
                "&forceConnectionTimeZoneToSession=true";
        }
        return DriverManager.getConnection(
            url,
            System.getProperty("campusfix.db.user", env("CAMPUSFIX_DB_USER", "campusfix")),
            System.getProperty("campusfix.db.password", env("CAMPUSFIX_DB_PASSWORD", ""))
        );
    }

    public static long insert(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement p = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            bind(p, args);
            p.executeUpdate();
            try (ResultSet r = p.getGeneratedKeys()) {
                if (r.next()) return r.getLong(1);
            }
            throw new SQLException("No generated identifier returned");
        }
    }

    public static int update(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement p = c.prepareStatement(sql)) {
            bind(p, args);
            return p.executeUpdate();
        }
    }

    public static void bind(PreparedStatement p, Object... args) throws SQLException {
        for (int i = 0; i < args.length; i++) p.setObject(i + 1, args[i]);
    }
}
