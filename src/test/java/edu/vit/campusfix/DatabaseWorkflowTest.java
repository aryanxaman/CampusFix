package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.mindrot.jbcrypt.BCrypt;

/** Runs the actual DAO against an isolated, in-memory SQL database in MySQL mode. */
class DatabaseWorkflowTest {

    final User student = new User(1, "Student", "student@vit.ac.in", "STUDENT", "K"),
        faculty = new User(2, "Faculty", "faculty@vit.ac.in", "FACULTY"),
        admin = new User(3, "Admin", "admin@vit.ac.in", "ADMIN"),
        staff = new User(4, "Staff", "staff@vit.ac.in", "STAFF");
    final ComplaintDao dao = new ComplaintDao();
    final ComplaintService service = new ComplaintService();

    @BeforeEach
    void setup() throws Exception {
        System.setProperty(
            "campusfix.db.url",
            "jdbc:h2:mem:campusfix;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
        );
        System.setProperty("campusfix.db.user", "sa");
        System.setProperty("campusfix.db.password", "");
        try (Connection c = Database.connect(); Statement st = c.createStatement()) {
            st.execute("DROP ALL OBJECTS");
            String schema = Files.readString(Path.of("database/schema.sql"));
            schema = schema
                .replaceAll("(?m)^CREATE DATABASE[^;]+;", "")
                .replace("USE campusfix;", "")
                .replaceAll("(?m)^--.*$", "");
            for (String query : schema.split(";")) {
                if (!query.isBlank()) st.execute(query);
            }
            String hash = BCrypt.hashpw("test-password-123", BCrypt.gensalt(4));
            for (User u : List.of(student, faculty, admin, staff))
                Database.update(
                    c,
                    "INSERT INTO users(id,name,email,password_hash,role,hostel_block) VALUES(?,?,?,?,?,?)",
                    u.id(),
                    u.name(),
                    u.email(),
                    hash,
                    u.role(),
                    u.hostelBlock()
                );
            Database.update(
                c,
                "INSERT INTO maintenance_staff(user_id,specialization) VALUES(?,?)",
                4,
                "Electrical"
            );
        }
    }

    @AfterAll
    static void cleanup() {
        for (String key : List.of("campusfix.db.url", "campusfix.db.user", "campusfix.db.password"))
            System.clearProperty(key);
    }

    Map<String, String> reportData() {
        return new HashMap<>(
            Map.of(
                "title",
                "Fan is not working",
                "description",
                "The ceiling fan stopped working yesterday.",
                "category",
                "Electrical",
                "type",
                "Hostel",
                "block",
                "K",
                "floor",
                "3",
                "room",
                "312",
                "priority",
                "HIGH"
            )
        );
    }

    long report() throws Exception {
        return service.report(student, reportData(), List.of());
    }

    void update(User u, long id, String status, String... extra) throws Exception {
        Map<String, String> d = new HashMap<>(
            Map.of("status", status, "remarks", "Inspection and repair update.")
        );
        if (u.isAdmin()) d.put("priority", "HIGH");
        for (int i = 0; i < extra.length; i += 2) d.put(extra[i], extra[i + 1]);
        service.update(u, id, d);
    }

    @Test
    void fullLifecyclePersistsHistoryAndFeedback() throws Exception {
        long id = report();
        update(admin, id, "REVIEW");
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS");
        update(staff, id, "PENDING_CONFIRMATION");
        service.confirmResolution(student, id, Map.of("confirmed", "true"));
        service.feedback(
            student,
            id,
            Map.of("rating", "5", "comment", "Excellent repair, thank you.")
        );
        var t = dao.list(student).get(0);
        assertEquals("CLOSED", t.get("status"));
        assertEquals(5, ((Number) t.get("rating")).intValue());
        assertEquals(7, ((List<?>) t.get("updates")).size());
        assertEquals(1, dao.list(staff).size());
        assertFalse(dao.notifications(admin).isEmpty());
        assertThrows(ApiException.class, () ->
            service.feedback(student, id, Map.of("rating", "4", "comment", "duplicate"))
        );
    }

    @Test
    void ownershipScopesRecordsAndAttachments() throws Exception {
        long id = service.report(
            student,
            reportData(),
            List.of(new ComplaintDao.Upload("random.jpg", "image/jpeg", 200, "photo.jpg"))
        );
        assertEquals(0, dao.list(faculty).size());
        assertEquals(0, dao.list(staff).size());
        assertEquals(1, dao.list(admin).size());
        var list = (List<?>) dao.list(student).get(0).get("attachments");
        long aid = ((Number) ((Map<?, ?>) list.get(0)).get("id")).longValue();
        assertEquals("random.jpg", dao.attachment(student, aid).filePath());
        assertThrows(ApiException.class, () -> dao.attachment(faculty, aid));
        assertThrows(ApiException.class, () -> dao.attachment(staff, aid));
        update(admin, id, "ASSIGNED", "staffId", "4");
        assertEquals("image/jpeg", dao.attachment(staff, aid).fileType());
    }

    @Test
    void rejectedTransitionRollsBackEverything() throws Exception {
        long id = report();
        int before = dao.notifications(student).size();
        assertThrows(ApiException.class, () -> update(admin, id, "RESOLVED", "staffId", "4"));
        var t = dao.list(admin).get(0);
        assertEquals("REPORTED", t.get("status"));
        assertNull(t.get("assignedStaffId"));
        assertEquals(1, ((List<?>) t.get("updates")).size());
        assertEquals(before, dao.notifications(student).size());
    }

    @Test
    void staffCannotOverridePriorityOrAssignment() throws Exception {
        long id = report();
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS", "priority", "LOW", "staffId", "99");
        var t = dao.list(admin).get(0);
        assertEquals("HIGH", t.get("priority"));
        assertEquals(4, ((Number) t.get("assignedStaffId")).intValue());
    }

    @Test
    void onlyOwnerCanGiveFeedbackAfterResolution() throws Exception {
        long id = report();
        assertThrows(ApiException.class, () ->
            service.feedback(student, id, Map.of("rating", "5", "comment", "early review"))
        );
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS");
        update(staff, id, "PENDING_CONFIRMATION");
        service.confirmResolution(student, id, Map.of("confirmed", "true"));
        assertThrows(ApiException.class, () ->
            service.feedback(faculty, id, Map.of("rating", "5", "comment", "not my complaint"))
        );
        assertEquals("RESOLVED", dao.list(student).get(0).get("status"));
    }

    @Test
    void reporterMustConfirmBeforeResolutionAndFeedback() throws Exception {
        long id = report();
        assertThrows(ApiException.class, () ->
            service.confirmResolution(
                student,
                id,
                Map.of("confirmed", "false", "remarks", "No submitted fix yet.")
            )
        );
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS");
        assertThrows(ApiException.class, () -> update(staff, id, "RESOLVED"));
        update(staff, id, "PENDING_CONFIRMATION");
        assertEquals("PENDING_CONFIRMATION", dao.list(student).get(0).get("status"));
        assertThrows(ApiException.class, () ->
            service.feedback(student, id, Map.of("rating", "5", "comment", "Premature feedback"))
        );
        for (User other : List.of(admin, staff, faculty))
            assertThrows(ApiException.class, () ->
                service.confirmResolution(other, id, Map.of("confirmed", "true"))
            );
        assertThrows(ApiException.class, () -> update(admin, id, "PENDING_CONFIRMATION"));
        assertThrows(ApiException.class, () ->
            service.confirmResolution(student, id, Map.of("confirmed", "yes"))
        );
        service.confirmResolution(student, id, Map.of("confirmed", "true"));
        assertEquals("RESOLVED", dao.list(student).get(0).get("status"));
        assertThrows(ApiException.class, () ->
            service.confirmResolution(student, id, Map.of("confirmed", "true"))
        );
        assertTrue(
            dao
                .notifications(staff)
                .stream()
                .anyMatch(n -> n.get("message").toString().contains("confirmed your fix"))
        );
    }

    @Test
    void reporterCanReturnUnfixedIssueAndConfirmSubsequentRepair() throws Exception {
        long id = report();
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS");
        update(staff, id, "PENDING_CONFIRMATION");
        assertThrows(ApiException.class, () ->
            service.confirmResolution(student, id, Map.of("confirmed", "false", "remarks", ""))
        );
        service.confirmResolution(
            student,
            id,
            Map.of("confirmed", "false", "remarks", "The fan is still not rotating.")
        );
        assertEquals("IN_PROGRESS", dao.list(student).get(0).get("status"));
        try (
            Connection c = Database.connect();
            PreparedStatement p = c.prepareStatement(
                "SELECT resolved_at FROM complaints WHERE id=?"
            )
        ) {
            p.setLong(1, id);
            try (ResultSet rs = p.executeQuery()) {
                assertTrue(rs.next());
                assertNull(rs.getTimestamp(1));
            }
        }
        assertThrows(ApiException.class, () ->
            service.confirmResolution(
                student,
                id,
                Map.of("confirmed", "false", "remarks", "No submitted fix yet.")
            )
        );
        update(staff, id, "PENDING_CONFIRMATION");
        service.confirmResolution(student, id, Map.of("confirmed", "true"));
        assertEquals("RESOLVED", dao.list(student).get(0).get("status"));
    }

    @Test
    void facultyReporterCanConfirmTheirAcademicComplaint() throws Exception {
        var data = reportData();
        data.put("type", "Academic");
        data.put("block", "SJT");
        long id = service.report(faculty, data, List.of());
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS");
        update(staff, id, "PENDING_CONFIRMATION");
        assertThrows(ApiException.class, () ->
            service.confirmResolution(student, id, Map.of("confirmed", "true"))
        );
        service.confirmResolution(faculty, id, Map.of("confirmed", "true"));
        assertEquals("RESOLVED", dao.list(faculty).get(0).get("status"));
    }

    @Test
    void reportersCanResolveTheirOwnIssuesWithoutStaffSubmissionAtEveryOpenStage()
        throws Exception {
        for (User reporter : List.of(student, faculty)) {
            for (String stage : List.of("REPORTED", "REVIEW", "ASSIGNED", "IN_PROGRESS")) {
                var data = reportData();
                if (reporter == faculty) {
                    data.put("type", "Academic");
                    data.put("block", "SJT");
                }
                long id = service.report(reporter, data, List.of());
                if (stage.equals("REVIEW")) update(admin, id, "REVIEW");
                if (List.of("ASSIGNED", "IN_PROGRESS").contains(stage)) update(
                    admin,
                    id,
                    "ASSIGNED",
                    "staffId",
                    "4"
                );
                if (stage.equals("IN_PROGRESS")) update(staff, id, "IN_PROGRESS");
                for (User other : List.of(admin, staff, reporter == student ? faculty : student))
                    assertThrows(ApiException.class, () ->
                        service.confirmResolution(other, id, Map.of("confirmed", "true"))
                    );
                service.confirmResolution(reporter, id, Map.of("confirmed", "true"));
                var ticket = dao
                    .list(reporter)
                    .stream()
                    .filter(t -> ((Number) t.get("id")).longValue() == id)
                    .findFirst()
                    .orElseThrow();
                assertEquals("RESOLVED", ticket.get("status"));
                assertThrows(ApiException.class, () ->
                    service.confirmResolution(reporter, id, Map.of("confirmed", "true"))
                );
                assertThrows(ApiException.class, () -> update(staff, id, "PENDING_CONFIRMATION"));
                try (
                    Connection c = Database.connect();
                    PreparedStatement p = c.prepareStatement(
                        "SELECT resolved_at FROM complaints WHERE id=?"
                    )
                ) {
                    p.setLong(1, id);
                    try (ResultSet rs = p.executeQuery()) {
                        assertTrue(rs.next());
                        assertNotNull(rs.getTimestamp(1));
                    }
                }
            }
        }
    }

    @Test
    void reporterEditsOwnComplaintWithoutChangingAnotherReportsSharedLocation() throws Exception {
        long id = report();
        long other = report();
        var data = reportData();
        data.put("title", "Updated fan complaint");
        data.put("room", "313");
        data.put("priority", "LOW");
        service.manageOwn(student, id, "edit", data);
        var tickets = dao.list(student);
        var edited = tickets
            .stream()
            .filter(t -> ((Number) t.get("id")).longValue() == id)
            .findFirst()
            .orElseThrow();
        var unchanged = tickets
            .stream()
            .filter(t -> ((Number) t.get("id")).longValue() == other)
            .findFirst()
            .orElseThrow();
        assertEquals("Updated fan complaint", edited.get("title"));
        assertEquals("313", edited.get("room"));
        assertEquals("LOW", edited.get("priority"));
        assertEquals("312", unchanged.get("room"));
        data.put("block", "N");
        assertThrows(ApiException.class, () -> service.manageOwn(student, id, "edit", data));
        assertEquals("K", dao.list(student).get(0).get("block"));
    }

    @Test
    void deletionIsRecoverableAndPreservesPhotosAndHistory() throws Exception {
        long id = service.report(
            student,
            reportData(),
            List.of(new ComplaintDao.Upload("keep.jpg", "image/jpeg", 200, "photo.jpg"))
        );
        update(admin, id, "ASSIGNED", "staffId", "4");
        var photo = (Map<?, ?>) ((List<?>) dao.list(student).get(0).get("attachments")).get(0);
        long aid = ((Number) photo.get("id")).longValue();
        service.manageOwn(student, id, "delete", Map.of());
        assertTrue(dao.list(student).isEmpty());
        assertTrue(dao.list(admin).isEmpty());
        assertTrue(dao.list(staff).isEmpty());
        assertEquals(1, dao.list(student, true).size());
        assertThrows(ApiException.class, () -> dao.attachment(student, aid));
        assertThrows(ApiException.class, () ->
            service.confirmResolution(student, id, Map.of("confirmed", "true"))
        );
        assertThrows(ApiException.class, () -> update(staff, id, "IN_PROGRESS"));
        service.manageOwn(student, id, "restore", Map.of());
        var restored = dao.list(student).get(0);
        assertEquals("REPORTED", restored.get("status"));
        assertNull(restored.get("assignedStaffId"));
        assertEquals("keep.jpg", dao.attachment(student, aid).filePath());
        assertEquals(4, ((List<?>) restored.get("updates")).size());
        assertTrue(dao.list(student, true).isEmpty());
        assertThrows(ApiException.class, () -> service.manageOwn(student, id, "restore", Map.of()));
    }

    @Test
    void onlyOwnerCanEditDeleteOrRestoreComplaint() throws Exception {
        long id = report();
        for (User other : List.of(staff, faculty)) {
            for (String action : List.of("edit", "delete", "restore"))
                assertThrows(ApiException.class, () ->
                    service.manageOwn(other, id, action, reportData())
                );
        }
        assertThrows(ApiException.class, () -> service.manageOwn(admin, id, "edit", reportData()));
        service.manageOwn(student, id, "delete", Map.of());
        assertTrue(dao.list(faculty, true).isEmpty());
        assertEquals(1, dao.list(admin, true).size());
        assertThrows(ApiException.class, () -> service.manageOwn(student, id, "delete", Map.of()));
    }

    @Test
    void editingCannotRacePastStartedWorkOrResolution() throws Exception {
        long id = report();
        update(admin, id, "ASSIGNED", "staffId", "4");
        update(staff, id, "IN_PROGRESS");
        for (String action : List.of("edit"))
            assertThrows(ApiException.class, () ->
                service.manageOwn(student, id, action, reportData())
            );
        service.confirmResolution(student, id, Map.of("confirmed", "true"));
        for (String action : List.of("edit"))
            assertThrows(ApiException.class, () ->
                service.manageOwn(student, id, action, reportData())
            );
        assertEquals("RESOLVED", dao.list(student).get(0).get("status"));
    }

    @Test
    void invalidEditRollsBackAndFacultyCanManageAcademicReports() throws Exception {
        var data = reportData();
        data.put("type", "Academic");
        data.put("block", "SJT");
        long id = service.report(faculty, data, List.of());
        data.put("description", "short");
        assertThrows(ApiException.class, () -> service.manageOwn(faculty, id, "edit", data));
        assertEquals(1, ((List<?>) dao.list(faculty).get(0).get("updates")).size());
        data.put("description", "Updated academic classroom fan report.");
        service.manageOwn(faculty, id, "edit", data);
        service.manageOwn(faculty, id, "delete", Map.of());
        service.manageOwn(faculty, id, "restore", Map.of());
        assertEquals(
            "Updated academic classroom fan report.",
            dao.list(faculty).get(0).get("description")
        );
    }

    @Test
    void completedComplaintsCanBeDeletedAndRestoredWithoutLosingResolutionOrFeedback()
        throws Exception {
        for (User reporter : List.of(student, faculty)) {
            for (boolean closed : List.of(false, true)) {
                var data = reportData();
                if (reporter == faculty) {
                    data.put("type", "Academic");
                    data.put("block", "SJT");
                }
                long id = service.report(reporter, data, List.of());
                update(admin, id, "ASSIGNED", "staffId", "4");
                service.confirmResolution(reporter, id, Map.of("confirmed", "true"));
                if (closed) service.feedback(
                    reporter,
                    id,
                    Map.of("rating", "4", "comment", "The repair was completed.")
                );
                var before = dao
                    .list(reporter)
                    .stream()
                    .filter(t -> ((Number) t.get("id")).longValue() == id)
                    .findFirst()
                    .orElseThrow();
                service.manageOwn(reporter, id, "delete", Map.of());
                assertTrue(
                    dao
                        .list(reporter)
                        .stream()
                        .noneMatch(t -> ((Number) t.get("id")).longValue() == id)
                );
                assertTrue(
                    dao
                        .list(reporter, true)
                        .stream()
                        .anyMatch(t -> ((Number) t.get("id")).longValue() == id)
                );
                service.manageOwn(reporter, id, "restore", Map.of());
                var restored = dao
                    .list(reporter)
                    .stream()
                    .filter(t -> ((Number) t.get("id")).longValue() == id)
                    .findFirst()
                    .orElseThrow();
                assertEquals(closed ? "CLOSED" : "RESOLVED", restored.get("status"));
                for (String key : List.of("resolvedAt", "rating", "feedback", "assignedStaffId"))
                    assertEquals(before.get(key), restored.get(key));
                assertThrows(ApiException.class, () ->
                    service.confirmResolution(reporter, id, Map.of("confirmed", "true"))
                );
            }
        }
    }

    @Test
    void inProgressAndPendingComplaintsCanBeDeletedAndRestoredForFreshReview() throws Exception {
        for (String stage : List.of("IN_PROGRESS", "PENDING_CONFIRMATION")) {
            long id = report();
            update(admin, id, "ASSIGNED", "staffId", "4");
            update(staff, id, "IN_PROGRESS");
            if (stage.equals("PENDING_CONFIRMATION")) update(staff, id, stage);
            service.manageOwn(student, id, "delete", Map.of());
            assertThrows(ApiException.class, () -> update(staff, id, "PENDING_CONFIRMATION"));
            service.manageOwn(student, id, "restore", Map.of());
            var restored = dao
                .list(student)
                .stream()
                .filter(t -> ((Number) t.get("id")).longValue() == id)
                .findFirst()
                .orElseThrow();
            assertEquals("REPORTED", restored.get("status"));
            assertNull(restored.get("assignedStaffId"));
        }
    }

    @Test
    void adminCanDeleteAndRestoreAnyComplaintAtEveryStageWithoutGainingEditRights()
        throws Exception {
        for (String stage : List.of(
            "REPORTED",
            "REVIEW",
            "ASSIGNED",
            "IN_PROGRESS",
            "PENDING_CONFIRMATION",
            "RESOLVED",
            "CLOSED"
        )) {
            long id = report();
            if (stage.equals("REVIEW")) update(admin, id, "REVIEW");
            if (!List.of("REPORTED", "REVIEW").contains(stage)) update(
                admin,
                id,
                "ASSIGNED",
                "staffId",
                "4"
            );
            if (
                List.of("IN_PROGRESS", "PENDING_CONFIRMATION", "RESOLVED", "CLOSED").contains(stage)
            ) update(staff, id, "IN_PROGRESS");
            if (stage.equals("PENDING_CONFIRMATION")) update(staff, id, stage);
            if (List.of("RESOLVED", "CLOSED").contains(stage)) service.confirmResolution(
                student,
                id,
                Map.of("confirmed", "true")
            );
            if (stage.equals("CLOSED")) service.feedback(
                student,
                id,
                Map.of("rating", "5", "comment", "The repair is complete.")
            );
            var before = dao
                .list(admin)
                .stream()
                .filter(t -> ((Number) t.get("id")).longValue() == id)
                .findFirst()
                .orElseThrow();
            assertThrows(ApiException.class, () ->
                service.manageOwn(admin, id, "edit", reportData())
            );
            assertThrows(ApiException.class, () ->
                service.manageOwn(staff, id, "delete", Map.of())
            );
            service.manageOwn(admin, id, "delete", Map.of());
            assertTrue(
                dao
                    .list(student)
                    .stream()
                    .noneMatch(t -> ((Number) t.get("id")).longValue() == id)
            );
            var archived = dao
                .list(admin, true)
                .stream()
                .filter(t -> ((Number) t.get("id")).longValue() == id)
                .findFirst()
                .orElseThrow();
            var updates = (List<?>) archived.get("updates");
            assertTrue(
                ((Map<?, ?>) updates.get(updates.size() - 1))
                    .get("remarks")
                    .toString()
                    .startsWith("Admin deleted")
            );
            assertTrue(
                dao
                    .notifications(student)
                    .stream()
                    .anyMatch(n -> n.get("message").toString().contains("administrator deleted"))
            );
            assertThrows(ApiException.class, () ->
                service.manageOwn(faculty, id, "restore", Map.of())
            );
            service.manageOwn(admin, id, "restore", Map.of());
            var restored = dao
                .list(student)
                .stream()
                .filter(t -> ((Number) t.get("id")).longValue() == id)
                .findFirst()
                .orElseThrow();
            assertEquals(
                List.of("RESOLVED", "CLOSED").contains(stage) ? stage : "REPORTED",
                restored.get("status")
            );
            for (String key : List.of("resolvedAt", "rating", "feedback"))
                assertEquals(before.get(key), restored.get(key));
        }
    }

    @Test
    void adminCanRestoreAReportDeletedByItsReporter() throws Exception {
        long id = report();
        service.manageOwn(student, id, "delete", Map.of());
        service.manageOwn(admin, id, "restore", Map.of());
        assertEquals("REPORTED", dao.list(student).get(0).get("status"));
        assertThrows(ApiException.class, () -> service.manageOwn(admin, id, "restore", Map.of()));
    }

    @Test
    void loginVerifiesHashedPasswordsAndActiveAccount() throws Exception {
        UserDao users = new UserDao();
        assertEquals(1, users.authenticate("student@vit.ac.in", "test-password-123").id());
        assertNull(users.authenticate("student@vit.ac.in", "incorrect"));
        try (Connection c = Database.connect()) {
            Database.update(c, "UPDATE users SET active=FALSE WHERE id=1");
        }
        assertNull(users.authenticate("student@vit.ac.in", "test-password-123"));
    }

    @Test
    void notificationsAreReadOnlyForTheirRecipient() throws Exception {
        report();
        assertFalse(dao.notifications(student).isEmpty());
        dao.readNotifications(student);
        assertTrue(
            dao
                .notifications(student)
                .stream()
                .allMatch(n -> Boolean.TRUE.equals(n.get("read")))
        );
        assertTrue(
            dao
                .notifications(admin)
                .stream()
                .noneMatch(n -> Boolean.TRUE.equals(n.get("read")))
        );
    }
}
