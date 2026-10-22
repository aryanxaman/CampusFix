package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;

class AdminAnalyticsDatabaseTest {

    final DatabaseWorkflowTest fixture = new DatabaseWorkflowTest();
    final AdminService adminService = new AdminService();
    final SettingsDao settings = new SettingsDao();

    @BeforeEach
    void setup() throws Exception {
        fixture.setup();
    }

    @AfterAll
    static void cleanup() {
        DatabaseWorkflowTest.cleanup();
    }

    Map<String, String> account(String email, String role) {
        return new HashMap<>(
            Map.of(
                "name",
                "New campus user",
                "email",
                email,
                "role",
                role,
                "password",
                "Safe-password-1234",
                "specialization",
                "Electrical"
            )
        );
    }

    @Test
    void createEveryRoleAndNeverExposeSecrets() throws Exception {
        for (String role : List.of("STUDENT", "FACULTY", "ADMIN", "STAFF"))
            adminService.create(
                fixture.admin,
                account(role.toLowerCase() + ".new@vit.ac.in", role)
            );
        var users = adminService.users(fixture.admin);
        assertEquals(8, users.size());
        assertTrue(
            users
                .stream()
                .noneMatch(u -> u.containsKey("password") || u.containsKey("password_hash"))
        );
        assertEquals(2, AnalyticsService.staff(users, fixture.dao.list(fixture.admin)).size());
    }

    @Test
    void nonAdminsCannotManageUsersOrSettings() {
        assertThrows(ApiException.class, () -> adminService.users(fixture.student));
        assertThrows(ApiException.class, () ->
            adminService.create(fixture.staff, account("x@vit.ac.in", "ADMIN"))
        );
        assertThrows(ApiException.class, () -> settings.save(fixture.student, new AppSettings()));
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        adminService.create(fixture.admin, account("new@vit.ac.in", "STUDENT"));
        assertThrows(ApiException.class, () ->
            adminService.create(fixture.admin, account("NEW@vit.ac.in", "FACULTY"))
        );
    }

    @Test
    void disablingAndRoleChangesRevokeSessionVersion() throws Exception {
        var users = new UserDao();
        int first = users.identity(1).version();
        adminService.update(fixture.admin, 1, Map.of("role", "FACULTY"));
        assertTrue(users.identity(1).version() > first);
        assertEquals("FACULTY", users.identity(1).user().role());
        adminService.update(fixture.admin, 1, Map.of("active", "false"));
        assertNull(users.identity(1));
        assertNull(users.authenticate("student@vit.ac.in", "test-password-123"));
        adminService.update(fixture.admin, 1, Map.of("active", "true"));
        assertNotNull(users.identity(1));
    }

    @Test
    void passwordResetRehashesAndRevokesExistingVersion() throws Exception {
        UserDao users = new UserDao();
        int version = users.identity(1).version();
        adminService.resetPassword(fixture.admin, 1, "New-secure-password-123");
        assertNull(users.authenticate("student@vit.ac.in", "test-password-123"));
        assertNotNull(users.authenticate("student@vit.ac.in", "New-secure-password-123"));
        assertTrue(users.identity(1).version() > version);
    }

    @Test
    void cannotRemoveOwnAdminAccess() throws Exception {
        assertThrows(ApiException.class, () ->
            adminService.update(fixture.admin, 3, Map.of("active", "false"))
        );
        assertThrows(ApiException.class, () ->
            adminService.update(fixture.admin, 3, Map.of("role", "STAFF"))
        );
        assertEquals("ADMIN", new UserDao().identity(3).user().role());
    }

    @Test
    void staffWithActiveAssignmentsMustBeReassignedFirst() throws Exception {
        long id = fixture.report();
        fixture.update(fixture.admin, id, "ASSIGNED", "staffId", "4");
        assertThrows(ApiException.class, () ->
            adminService.update(fixture.admin, 4, Map.of("active", "false"))
        );
        assertThrows(ApiException.class, () ->
            adminService.update(fixture.admin, 4, Map.of("role", "FACULTY"))
        );
        adminService.update(
            fixture.admin,
            4,
            Map.of("available", "false", "specialization", "Electrical repairs")
        );
        assertNotNull(new UserDao().identity(4));
        // Existing work can still proceed; unavailability only prevents new assignments.
        fixture.update(fixture.staff, id, "IN_PROGRESS");
        fixture.update(fixture.staff, id, "PENDING_CONFIRMATION");
        fixture.service.confirmResolution(fixture.student, id, Map.of("confirmed", "true"));
        adminService.update(fixture.admin, 4, Map.of("active", "false"));
        assertNull(new UserDao().identity(4));
    }

    @Test
    void unavailableStaffCannotReceiveNewWork() throws Exception {
        adminService.update(fixture.admin, 4, Map.of("available", "false"));
        long id = fixture.report();
        assertThrows(ApiException.class, () ->
            fixture.update(fixture.admin, id, "ASSIGNED", "staffId", "4")
        );
    }

    @Test
    void reportingSettingsPersistAndHistoricalChoicesSurvive() throws Exception {
        fixture.report();
        AppSettings c = new AppSettings();
        c.maxPhotos = 2;
        c.uploadSizeMb = 1;
        c.categories = List.of("Custom service");
        c.hostelBlocks = List.of("NEW");
        settings.save(fixture.admin, c);
        assertEquals(2, settings.get().maxPhotos);
        assertEquals("Electrical", fixture.dao.list(fixture.student).get(0).get("category"));
        var data = fixture.reportData();
        data.put("category", "Custom service");
        data.put("block", "NEW");
        adminService.update(fixture.admin, fixture.student.id(), Map.of("hostelBlock", "NEW"));
        fixture.service.report(
            new UserDao().identity(fixture.student.id()).user(),
            data,
            List.of()
        );
        assertEquals(2, fixture.dao.list(fixture.student).size());
        assertThrows(ApiException.class, fixture::report);
        assertThrows(ApiException.class, () ->
            fixture.service.report(
                fixture.student,
                data,
                List.of(new ComplaintDao.Upload("a.jpg", "image/jpeg", 2 * 1024 * 1024, "a.jpg"))
            )
        );
    }

    @Test
    void notificationPreferencesApplyToFutureNotices() throws Exception {
        AppSettings c = new AppSettings();
        c.notifyReporter = false;
        c.notifyAdmins = false;
        c.notifyStaff = false;
        settings.save(fixture.admin, c);
        long id = fixture.report();
        fixture.update(fixture.admin, id, "ASSIGNED", "staffId", "4");
        assertTrue(fixture.dao.notifications(fixture.student).isEmpty());
        assertTrue(fixture.dao.notifications(fixture.admin).isEmpty());
        assertTrue(fixture.dao.notifications(fixture.staff).isEmpty());
    }

    @Test
    void escalationIsDeduplicatedAndResolvedComplaintsDoNotEscalate() throws Exception {
        long id = fixture.report();
        try (Connection c = Database.connect()) {
            Database.update(
                c,
                "UPDATE complaints SET created_at=? WHERE id=?",
                Timestamp.from(Instant.now().minus(Duration.ofHours(100))),
                id
            );
        }
        SlaService sla = new SlaService();
        assertEquals(1, sla.escalate());
        assertEquals(0, sla.escalate());
        var t = fixture.dao.list(fixture.admin).get(0);
        assertEquals("OVERDUE", ((Map<?, ?>) t.get("sla")).get("state"));
        assertEquals(
            1,
            fixture.dao
                .notifications(fixture.admin)
                .stream()
                .filter(n -> n.get("message").toString().contains("Escalation Required"))
                .count()
        );
        fixture.update(fixture.admin, id, "ASSIGNED", "staffId", "4");
        fixture.update(fixture.staff, id, "IN_PROGRESS");
        fixture.update(fixture.staff, id, "PENDING_CONFIRMATION");
        fixture.service.confirmResolution(fixture.student, id, Map.of("confirmed", "true"));
        assertEquals(0, sla.escalate());
        assertEquals(
            false,
            ((Map<?, ?>) fixture.dao.list(fixture.admin).get(0).get("sla")).get(
                "escalationRequired"
            )
        );
    }

    @Test
    void disabledEscalationAlertsCanBeEnabledLater() throws Exception {
        long id = fixture.report();
        try (Connection c = Database.connect()) {
            Database.update(
                c,
                "UPDATE complaints SET created_at=? WHERE id=?",
                Timestamp.from(Instant.now().minus(Duration.ofHours(100))),
                id
            );
        }
        AppSettings s = new AppSettings();
        s.notifyEscalations = false;
        settings.save(fixture.admin, s);
        assertEquals(0, new SlaService().escalate());
        s.notifyEscalations = true;
        settings.save(fixture.admin, s);
        assertEquals(1, new SlaService().escalate());
    }

    @Test
    void analyticsIncludeStaffBlocksAndDetailedRecurringGroups() throws Exception {
        long first = fixture.report();
        fixture.report();
        fixture.update(fixture.admin, first, "ASSIGNED", "staffId", "4");
        fixture.update(fixture.staff, first, "IN_PROGRESS");
        fixture.update(fixture.staff, first, "PENDING_CONFIRMATION");
        fixture.service.confirmResolution(fixture.student, first, Map.of("confirmed", "true"));
        fixture.service.feedback(
            fixture.student,
            first,
            Map.of("rating", "4", "comment", "Thanks for the repair.")
        );
        var tickets = fixture.dao.list(fixture.admin);
        var staff = AnalyticsService.staff(adminService.users(fixture.admin), tickets);
        assertEquals(1, staff.get(0).get("resolved"));
        assertEquals(4d, staff.get(0).get("averageRating"));
        assertNotNull(staff.get(0).get("averageResolutionHours"));
        var report = AnalyticsService.report(tickets, staff, new AppSettings(), Instant.now());
        var recurring = (List<?>) report.get("recurring");
        assertEquals(1, recurring.size());
        var card = (Map<?, ?>) recurring.get(0);
        assertEquals(2, card.get("count"));
        assertNotNull(card.get("latestComplaint"));
        assertNotNull(card.get("firstAt"));
        assertEquals(2, ((List<?>) card.get("relatedIds")).size());
        assertEquals(12, ((List<?>) report.get("blocks")).size());
    }

    @Test
    void migrationIsAdditiveAndRepeatable() throws Exception {
        long id = fixture.report();
        try (Connection c = Database.connect(); Statement s = c.createStatement()) {
            s.execute("ALTER TABLE users DROP COLUMN auth_version");
        }
        MigrationTool.main(new String[] { "database/schema.sql" });
        MigrationTool.main(new String[] { "database/schema.sql" });
        assertNotNull(new UserDao().identity(1));
        assertEquals(id, ((Number) fixture.dao.list(fixture.student).get(0).get("id")).longValue());
    }

    @Test
    void auditRecordsActionsWithoutPasswordMaterial() throws Exception {
        adminService.resetPassword(fixture.admin, 1, "New-secure-password-123");
        try (
            Connection c = Database.connect();
            Statement s = c.createStatement();
            ResultSet r = s.executeQuery("SELECT action,target_user_id FROM admin_audit")
        ) {
            assertTrue(r.next());
            assertEquals("PASSWORD_RESET", r.getString(1));
            assertEquals(1, r.getLong(2));
        }
    }
}
