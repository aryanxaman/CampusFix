package edu.vit.campusfix;

import java.sql.*;
import java.time.*;
import java.util.*;

/** SLA runs from report creation. Priority/settings changes recalculate deadlines; resolution stops the clock. */
public final class SlaService {

    public static Map<String, Object> evaluate(
        String priority,
        String status,
        Instant created,
        Instant resolved,
        AppSettings config,
        Instant now
    ) {
        long target = config.slaHours.getOrDefault(priority, 48) * 3600L;
        Instant due = created.plusSeconds(target);
        boolean done = Set.of("RESOLVED", "CLOSED").contains(status);
        Instant end = done ? (resolved == null ? now : resolved) : now;
        double elapsed = Math.max(0, Duration.between(created, end).toMillis() / 3600000d);
        long remaining = Duration.between(now, due).getSeconds();
        boolean breached = end.isAfter(due);
        String state = done
            ? breached
                ? "BREACHED"
                : "MET"
            : now.isAfter(due)
              ? "OVERDUE"
              : remaining <= target * .2
                ? "APPROACHING"
                : "WITHIN";
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("state", state);
        result.put("dueAt", due.toString());
        result.put("targetHours", target / 3600);
        result.put("elapsedHours", elapsed);
        result.put("remainingSeconds", remaining);
        result.put("escalationRequired", !done && breached);
        return result;
    }

    public int escalate() throws SQLException {
        try (Connection c = Database.connect()) {
            c.setAutoCommit(false);
            try {
                AppSettings settings = SettingsDao.get(c);
                Instant now = Instant.now();
                List<Long> overdue = new ArrayList<>();
                try (
                    PreparedStatement p = c.prepareStatement(
                        "SELECT id,priority,status,created_at FROM complaints WHERE deleted_at IS NULL AND status NOT IN ('RESOLVED','CLOSED')"
                    );
                    ResultSet r = p.executeQuery()
                ) {
                    while (r.next())
                        if (
                            Boolean.TRUE.equals(
                                evaluate(
                                    r.getString(2),
                                    r.getString(3),
                                    r.getTimestamp(4).toInstant(),
                                    null,
                                    settings,
                                    now
                                ).get("escalationRequired")
                            )
                        ) overdue.add(r.getLong(1));
                }
                int notified = 0;
                for (long id : overdue) {
                    // Recheck with a row lock: a job may have been resolved while candidates were collected.
                    try (
                        PreparedStatement p = c.prepareStatement(
                            "SELECT priority,status,created_at FROM complaints WHERE deleted_at IS NULL AND id=? FOR UPDATE"
                        )
                    ) {
                        p.setLong(1, id);
                        try (ResultSet r = p.executeQuery()) {
                            if (
                                !r.next() ||
                                !Boolean.TRUE.equals(
                                    evaluate(
                                        r.getString(1),
                                        r.getString(2),
                                        r.getTimestamp(3).toInstant(),
                                        null,
                                        settings,
                                        now
                                    ).get("escalationRequired")
                                )
                            ) continue;
                        }
                    }
                    Database.update(
                        c,
                        "INSERT IGNORE INTO complaint_escalations(complaint_id) VALUES(?)",
                        id
                    );
                    if (settings.notifyEscalations) {
                        // Per-recipient unique key prevents duplicate notices across refreshes, threads and restarts.
                        List<Long> admins = new ArrayList<>();
                        try (
                            PreparedStatement p = c.prepareStatement(
                                "SELECT id FROM users WHERE role='ADMIN' AND active=TRUE"
                            );
                            ResultSet r = p.executeQuery()
                        ) {
                            while (r.next()) admins.add(r.getLong(1));
                        }
                        for (long admin : admins)
                            if (
                                Database.update(
                                    c,
                                    "INSERT IGNORE INTO escalation_recipients(complaint_id,user_id) VALUES(?,?)",
                                    id,
                                    admin
                                ) > 0
                            ) {
                                Database.update(
                                    c,
                                    "INSERT INTO notifications(user_id,complaint_id,message) VALUES(?,?,?)",
                                    admin,
                                    id,
                                    "CF-" +
                                        id +
                                        ": Escalation Required — complaint has exceeded its SLA."
                                );
                                notified++;
                            }
                    }
                }
                c.commit();
                return notified;
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }
}
