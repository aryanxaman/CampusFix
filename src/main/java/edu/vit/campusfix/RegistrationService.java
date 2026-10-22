package edu.vit.campusfix;

import java.sql.SQLException;
import java.util.*;
import org.mindrot.jbcrypt.BCrypt;

/** Student self-registration cannot grant staff or administrator access. */
public final class RegistrationService {

    public long register(Map<String, String> data) throws SQLException {
        if (data.containsKey("role") && !"STUDENT".equals(data.get("role"))) throw new ApiException(
            400,
            "Self-registration is available for students only."
        );
        String name = ComplaintService.text(data, "name", 2, 100);
        String email = ComplaintService.text(data, "email", 3, 190).toLowerCase(Locale.ROOT);
        if (
            !email.matches("[^@\\s]+@(?:(?:[a-zA-Z0-9-]+\\.)?vit\\.ac\\.in|vitstudent\\.ac\\.in)")
        ) throw new ApiException(400, "Use your VIT campus email address.");
        AdminService.validatePassword(data.get("password"));
        String block = ComplaintService.text(data, "hostelBlock", 1, 10);
        if (!new SettingsDao().get().hostelBlocks.contains(block)) throw new ApiException(
            400,
            "Choose a valid hostel block."
        );
        return new UserDao().registerStudent(
            name,
            email,
            BCrypt.hashpw(data.get("password"), BCrypt.gensalt(12)),
            block
        );
    }
}
