package edu.vit.campusfix;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.Gson;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.*;

class BootstrapAdminTest {

    final DatabaseWorkflowTest fixture = new DatabaseWorkflowTest();

    @BeforeEach
    void setup() throws Exception {
        fixture.setup();
    }

    @AfterAll
    static void cleanup() {
        DatabaseWorkflowTest.cleanup();
    }

    void provision(String email, String password) throws Exception {
        InputStream previous = System.in;
        try {
            System.setIn(
                new ByteArrayInputStream(
                    new Gson()
                        .toJson(
                            Map.of(
                                "name",
                                "Campus Administrator",
                                "email",
                                email,
                                "password",
                                password
                            )
                        )
                        .getBytes(StandardCharsets.UTF_8)
                )
            );
            BootstrapAdmin.main(new String[0]);
        } finally {
            System.setIn(previous);
        }
    }

    void removeFixtureAdmin() throws Exception {
        try (Connection c = Database.connect()) {
            Database.update(c, "UPDATE users SET role='FACULTY' WHERE id=3");
        }
    }

    @Test
    void existingAdminCannotBeReplaced() {
        assertThrows(IllegalStateException.class, () ->
            provision("new.admin@vit.ac.in", "Bootstrap-safe-password")
        );
    }

    @Test
    void firstAdminIsRealAndCanAuthenticate() throws Exception {
        removeFixtureAdmin();
        provision("new.admin@vit.ac.in", "Bootstrap-safe-password");
        User user = new UserDao().authenticate("new.admin@vit.ac.in", "Bootstrap-safe-password");
        assertNotNull(user);
        assertTrue(user.isAdmin());
        assertThrows(IllegalStateException.class, () ->
            provision("second.admin@vit.ac.in", "Bootstrap-safe-password")
        );
    }

    @Test
    void invalidDetailsDoNotCreateAnAccount() throws Exception {
        removeFixtureAdmin();
        assertThrows(IllegalArgumentException.class, () ->
            provision("admin@example.com", "Bootstrap-safe-password")
        );
        assertNull(new UserDao().authenticate("admin@example.com", "Bootstrap-safe-password"));
    }

    @Test
    void shortPasswordsAreRejected() throws Exception {
        removeFixtureAdmin();
        assertThrows(ApiException.class, () -> provision("new.admin@vit.ac.in", "short"));
    }
}
