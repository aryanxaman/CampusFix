package edu.vit.campusfix;

import com.google.gson.Gson;
import java.sql.*;

public final class SettingsDao {

    private static final Gson JSON = new Gson();

    public AppSettings get() throws SQLException {
        try (Connection c = Database.connect()) {
            return get(c);
        }
    }

    static AppSettings get(Connection c) throws SQLException {
        try (
            PreparedStatement p = c.prepareStatement(
                "SELECT config_json FROM app_settings WHERE id=1"
            );
            ResultSet r = p.executeQuery()
        ) {
            if (!r.next()) return new AppSettings();
            AppSettings settings = JSON.fromJson(r.getString(1), AppSettings.class);
            settings.validate();
            return settings;
        }
    }

    public void save(User actor, AppSettings settings) throws SQLException {
        AdminService.requireAdmin(actor);
        settings.validate();
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                AdminDao.lockAdmins(c, actor);
                // Always lock the single settings row so simultaneous edits cannot produce partial policy updates.
                Database.update(
                    c,
                    "INSERT IGNORE INTO app_settings(id,config_json) VALUES(1,?)",
                    JSON.toJson(new AppSettings())
                );
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM app_settings WHERE id=1 FOR UPDATE"
                    );
                    ResultSet r = p.executeQuery()
                ) {
                    r.next();
                }
                for (String name : settings.categories)
                    Database.update(c, "INSERT IGNORE INTO categories(name) VALUES(?)", name);
                Database.update(
                    c,
                    "UPDATE app_settings SET config_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=1",
                    JSON.toJson(settings)
                );
                AdminDao.audit(c, actor, "SETTINGS_UPDATED", null);
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }
}
