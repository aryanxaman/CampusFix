package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.*;

class WorkflowTest {

    final User student = new User(1, "Student", "s@vit.ac.in", "STUDENT", "K"),
        admin = new User(3, "Admin", "a@vit.ac.in", "ADMIN"),
        staff = new User(4, "Staff", "m@vit.ac.in", "STAFF");

    Map<String, String> valid() {
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

    @Test
    void everyRequestedBlockIsAccepted() {
        for (String b : List.of("K", "L", "M", "N", "Q", "R", "S", "T")) {
            var d = valid();
            d.put("block", b);
            assertDoesNotThrow(() ->
                ComplaintService.validateReport(
                    new User(1, "Student", "s@vit.ac.in", "STUDENT", b),
                    d
                )
            );
        }
        for (String b : List.of("PRP", "SJT", "TT", "SMV")) {
            var d = valid();
            d.put("type", "Academic");
            d.put("block", b);
            assertDoesNotThrow(() -> ComplaintService.validateReport(student, d));
        }
    }

    @Test
    void invalidLocationHierarchyIsRejected() {
        var d = valid();
        d.put("block", "PRP");
        assertThrows(ApiException.class, () -> ComplaintService.validateReport(student, d));
    }

    @Test
    void invalidFloorAndCategoryAreRejected() {
        var d = valid();
        d.put("floor", "-1");
        assertThrows(ApiException.class, () -> ComplaintService.validateReport(student, d));
        d.put("floor", "3");
        d.put("category", "invented");
        assertThrows(ApiException.class, () -> ComplaintService.validateReport(student, d));
    }

    @Test
    void adminCannotReportOrSkipStaffWorkflow() {
        assertThrows(ApiException.class, () -> ComplaintService.validateReport(admin, valid()));
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(admin, "ASSIGNED", "RESOLVED", 4L, 4L)
        );
    }

    @Test
    void assignmentNeedsStaff() {
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(admin, "REVIEW", "ASSIGNED", null, null)
        );
        assertDoesNotThrow(() ->
            ComplaintService.validateTransition(admin, "REVIEW", "ASSIGNED", 4L, null)
        );
    }

    @Test
    void staffCannotAccessOthersWork() {
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(staff, "ASSIGNED", "IN_PROGRESS", 5L, 5L)
        );
    }

    @Test
    void assignedStaffMustStartBeforeResolution() {
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(staff, "ASSIGNED", "RESOLVED", 4L, 4L)
        );
        assertDoesNotThrow(() ->
            ComplaintService.validateTransition(staff, "ASSIGNED", "IN_PROGRESS", 4L, 4L)
        );
        assertDoesNotThrow(() ->
            ComplaintService.validateTransition(staff, "IN_PROGRESS", "RESOLVED", 4L, 4L)
        );
    }

    @Test
    void reportersCannotUpdateWorkflow() {
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(student, "REPORTED", "REVIEW", null, null)
        );
    }

    @Test
    void closedComplaintsAreImmutable() {
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(admin, "CLOSED", "REVIEW", 4L, 4L)
        );
        assertThrows(ApiException.class, () ->
            ComplaintService.validateTransition(staff, "CLOSED", "IN_PROGRESS", 4L, 4L)
        );
    }

    @Test
    void readPermissionsStayScoped() {
        assertTrue(student.canRead(1, null));
        assertFalse(student.canRead(2, 1L));
        assertTrue(staff.canRead(2, 4L));
        assertFalse(staff.canRead(1, 5L));
        assertTrue(admin.canRead(1, null));
    }

    @Test
    void uploadedFilesNeedImageSignatures() {
        assertNull(ApiServlet.imageType("<script>alert(1)</script>".getBytes()));
        assertNull(ApiServlet.imageType(new byte[0]));
        assertEquals(
            "image/png",
            ApiServlet.imageType(new byte[] { (byte) 137, 80, 78, 71, 13, 10, 26, 10 })
        );
        assertEquals(
            "image/jpeg",
            ApiServlet.imageType(new byte[] { (byte) 255, (byte) 216, (byte) 255 })
        );
    }
}
