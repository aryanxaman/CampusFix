package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.*;

class RegistrationTest {

    private final DatabaseWorkflowTest fixture = new DatabaseWorkflowTest();
    private final RegistrationService registration = new RegistrationService();

    @BeforeEach
    void setup() throws Exception {
        fixture.setup();
    }

    @AfterAll
    static void cleanup() {
        DatabaseWorkflowTest.cleanup();
    }

    private Map<String, String> data() {
        return new HashMap<>(
            Map.of(
                "name",
                "New Student",
                "email",
                "new.student@vitstudent.ac.in",
                "password",
                "Student-password-123",
                "hostelBlock",
                "K"
            )
        );
    }

    @Test
    void signupPersistsStudentResidenceAndHashedPassword() throws Exception {
        var d = data();
        long id = registration.register(d);
        var identity = new UserDao().authenticateIdentity(d.get("email"), d.get("password"));
        assertEquals(id, identity.user().id());
        assertEquals("STUDENT", identity.user().role());
        assertEquals("K", identity.user().hostelBlock());
        assertEquals(
            409,
            assertThrows(ApiException.class, () -> registration.register(d)).status()
        );
        var complaint = fixture.reportData();
        complaint.put("block", "N");
        assertEquals(
            403,
            assertThrows(ApiException.class, () ->
                fixture.service.report(identity.user(), complaint, List.of())
            ).status()
        );
    }

    @Test
    void signupCannotCreatePrivilegedAccounts() {
        for (String role : List.of("ADMIN", "FACULTY", "STAFF")) {
            var d = data();
            d.put("role", role);
            assertEquals(
                400,
                assertThrows(ApiException.class, () -> registration.register(d)).status()
            );
        }
    }

    @Test
    void signupRequiresValidResidenceCampusEmailAndPassword() {
        for (String block : List.of("", "UNKNOWN")) {
            var d = data();
            d.put("hostelBlock", block);
            assertEquals(
                400,
                assertThrows(ApiException.class, () -> registration.register(d)).status()
            );
        }
        var invalidEmail = data();
        invalidEmail.put("email", "student@example.com");
        assertEquals(
            400,
            assertThrows(ApiException.class, () -> registration.register(invalidEmail)).status()
        );
        var invalid = data();
        invalid.put("password", "short");
        assertEquals(
            400,
            assertThrows(ApiException.class, () -> registration.register(invalid)).status()
        );
    }
}
