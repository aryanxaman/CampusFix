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
        update(staff, id, "RESOLVED");
        service.feedback(
            student,
            id,
            Map.of("rating", "5", "comment", "Excellent repair, thank you.")
        );
        var t = dao.list(student).get(0);
        assertEquals("CLOSED", t.get("status"));
        assertEquals(5, ((Number) t.get("rating")).intValue());
        assertEquals(6, ((List<?>) t.get("updates")).size());
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
        update(staff, id, "RESOLVED");
        assertThrows(ApiException.class, () ->
            service.feedback(faculty, id, Map.of("rating", "5", "comment", "not my complaint"))
        );
        assertEquals("RESOLVED", dao.list(student).get(0).get("status"));
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
