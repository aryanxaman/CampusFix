package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;

class SlaSettingsTest {

    final Instant created = Instant.parse("2026-10-01T00:00:00Z");

    Map<String, Object> sla(String status, int minutes) {
        return SlaService.evaluate(
            "URGENT",
            status,
            created,
            null,
            new AppSettings(),
            created.plusSeconds(minutes * 60L)
        );
    }

    @Test
    void requiredDefaultsAreCorrect() {
        assertEquals(
            Map.of("URGENT", 4, "HIGH", 24, "MEDIUM", 48, "LOW", 72),
            new AppSettings().slaHours
        );
    }

    @Test
    void beforeFinalFifthIsWithinSla() {
        assertEquals("WITHIN", sla("REPORTED", 180).get("state"));
        assertEquals(false, sla("REPORTED", 180).get("escalationRequired"));
    }

    @Test
    void finalFifthApproachesDeadline() {
        assertEquals("APPROACHING", sla("ASSIGNED", 200).get("state"));
    }

    @Test
    void exceedingDeadlineRequiresEscalation() {
        assertEquals("OVERDUE", sla("IN_PROGRESS", 241).get("state"));
        assertEquals(true, sla("IN_PROGRESS", 241).get("escalationRequired"));
    }

    @Test
    void resolvedClockStopsAndNeverEscalates() {
        var result = SlaService.evaluate(
            "URGENT",
            "RESOLVED",
            created,
            created.plusSeconds(3600),
            new AppSettings(),
            created.plusSeconds(999999)
        );
        assertEquals("MET", result.get("state"));
        assertEquals(false, result.get("escalationRequired"));
        assertEquals(1d, result.get("elapsedHours"));
    }

    @Test
    void lateResolutionRetainsBreachWithoutActiveEscalation() {
        var result = SlaService.evaluate(
            "URGENT",
            "CLOSED",
            created,
            created.plusSeconds(5 * 3600),
            new AppSettings(),
            created.plusSeconds(999999)
        );
        assertEquals("BREACHED", result.get("state"));
        assertEquals(false, result.get("escalationRequired"));
    }

    @Test
    void configuredTargetsApply() {
        AppSettings c = new AppSettings();
        c.slaHours.put("URGENT", 8);
        assertEquals(
            "WITHIN",
            SlaService.evaluate(
                "URGENT",
                "REPORTED",
                created,
                null,
                c,
                created.plusSeconds(5 * 3600)
            ).get("state")
        );
    }

    @Test
    void allPrioritiesAreRequired() {
        AppSettings c = new AppSettings();
        c.slaHours.remove("LOW");
        assertThrows(ApiException.class, c::validate);
    }

    @Test
    void zeroAndExcessiveSlaTargetsAreRejected() {
        AppSettings c = new AppSettings();
        c.slaHours.put("HIGH", 0);
        assertThrows(ApiException.class, c::validate);
        c.slaHours.put("HIGH", 8761);
        assertThrows(ApiException.class, c::validate);
    }

    @Test
    void uploadLimitsHaveSafeBounds() {
        AppSettings c = new AppSettings();
        c.maxPhotos = 11;
        assertThrows(ApiException.class, c::validate);
        c.maxPhotos = 5;
        c.uploadSizeMb = 11;
        assertThrows(ApiException.class, c::validate);
    }

    @Test
    void duplicateChoicesAreRejectedIgnoringCase() {
        AppSettings c = new AppSettings();
        c.categories = List.of("Electrical", "electrical");
        assertThrows(ApiException.class, c::validate);
    }

    @Test
    void blankAndOversizedBlocksAreRejected() {
        AppSettings c = new AppSettings();
        c.hostelBlocks = List.of("");
        assertThrows(ApiException.class, c::validate);
        c.hostelBlocks = List.of("A-BLOCK-NAME-TOO-LONG");
        assertThrows(ApiException.class, c::validate);
    }

    @Test
    void passwordByteLimitIsEnforced() {
        assertDoesNotThrow(() -> AdminService.validatePassword("a secure password"));
        assertThrows(ApiException.class, () -> AdminService.validatePassword("short"));
        assertThrows(ApiException.class, () -> AdminService.validatePassword("界".repeat(25)));
    }

    @Test
    void reportChoicesCanBeExtendedWithoutChangingCode() {
        var d = new DatabaseWorkflowTest().reportData();
        AppSettings c = new AppSettings();
        c.categories = List.of("Custom maintenance");
        c.hostelBlocks = List.of("NEW");
        d.put("category", "Custom maintenance");
        d.put("block", "NEW");
        assertDoesNotThrow(() ->
            ComplaintService.validateReport(
                new User(1, "Student", "s@vit.ac.in", "STUDENT", "NEW"),
                d,
                c
            )
        );
    }
}
