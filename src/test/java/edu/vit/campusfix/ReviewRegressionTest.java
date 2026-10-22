package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class ReviewRegressionTest {

    @Test
    void missingAdminPriorityReturnsValidationErrorInsteadOfNullPointer() {
        User admin = new User(3, "Admin", "admin@vit.ac.in", "ADMIN");
        Map<String, String> update = new HashMap<>(
            Map.of("status", "REVIEW", "remarks", "Reviewed by campus administration.")
        );
        for (String priority : Arrays.asList(null, "INVALID")) {
            update.put("priority", priority);
            ApiException error = assertThrows(ApiException.class, () ->
                new ComplaintService().update(admin, 1, update)
            );
            assertEquals(400, error.status());
        }
    }
}
