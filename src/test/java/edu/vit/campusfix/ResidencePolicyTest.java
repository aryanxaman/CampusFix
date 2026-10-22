package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.*;

class ResidencePolicyTest {

    private final DatabaseWorkflowTest fixture = new DatabaseWorkflowTest();

    @BeforeEach
    void setup() throws Exception {
        fixture.setup();
    }

    @AfterAll
    static void cleanup() {
        DatabaseWorkflowTest.cleanup();
    }

    @Test
    void studentCanReportOwnHostelButCannotSpoofOtherBlocks() throws Exception {
        var data = fixture.reportData();
        assertTrue(fixture.service.report(fixture.student, data, List.of()) > 0);
        for (String block : List.of("N", "L")) {
            data.put("block", block);
            data.put("hostelBlock", block); // Client-supplied residence is never trusted.
            ApiException e = assertThrows(ApiException.class, () ->
                fixture.service.report(fixture.student, data, List.of())
            );
            assertEquals(403, e.status());
        }
        assertEquals(1, fixture.dao.list(fixture.admin).size());
    }

    @Test
    void unassignedStudentCannotReportHostelButCanReportAcademicIssue() throws Exception {
        User unassigned = new User(1, "Student", "student@vit.ac.in", "STUDENT");
        var data = fixture.reportData();
        assertEquals(
            403,
            assertThrows(ApiException.class, () ->
                fixture.service.report(unassigned, data, List.of())
            ).status()
        );
        data.put("type", "Academic");
        for (String block : List.of("PRP", "SJT", "TT", "SMV")) {
            data.put("block", block);
            assertTrue(fixture.service.report(unassigned, data, List.of()) > 0);
        }
    }

    @Test
    void facultyCanReportAcademicBuildingsButNotHostels() throws Exception {
        var data = fixture.reportData();
        data.put("block", "N");
        assertEquals(
            403,
            assertThrows(ApiException.class, () ->
                fixture.service.report(fixture.faculty, data, List.of())
            ).status()
        );
        data.put("type", "Academic");
        for (String block : List.of("PRP", "SJT", "TT", "SMV")) {
            data.put("block", block);
            assertTrue(fixture.service.report(fixture.faculty, data, List.of()) > 0);
        }
    }

    @Test
    void adminCanAssignResidenceAndOldSessionVersionIsRevoked() throws Exception {
        AdminService admin = new AdminService();
        UserDao users = new UserDao();
        int version = users.identity(1).version();
        admin.update(fixture.admin, 1, Map.of("hostelBlock", "L"));
        assertEquals("L", users.identity(1).user().hostelBlock());
        assertTrue(users.identity(1).version() > version);
        assertTrue(
            admin
                .users(fixture.admin)
                .stream()
                .anyMatch(u -> Objects.equals(u.get("id"), 1L) && "L".equals(u.get("hostelBlock")))
        );
        assertEquals(
            403,
            assertThrows(ApiException.class, () ->
                admin.update(fixture.student, 1, Map.of("hostelBlock", "N"))
            ).status()
        );
        assertEquals(
            400,
            assertThrows(ApiException.class, () ->
                admin.update(fixture.admin, 1, Map.of("hostelBlock", "UNKNOWN"))
            ).status()
        );
    }
}
