package edu.vit.campusfix;

import java.io.Serializable;

/** An immutable session principal; never contains a password hash. */
public record User(
    long id,
    String name,
    String email,
    String role,
    String hostelBlock
) implements Serializable {
    public User(long id, String name, String email, String role) {
        this(id, name, email, role, null);
    }

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    public boolean isStaff() {
        return "STAFF".equals(role);
    }

    public boolean canReport() {
        return "STUDENT".equals(role) || "FACULTY".equals(role);
    }

    public boolean canRead(long ownerId, Long staffId) {
        return isAdmin() || (isStaff() ? staffId != null && id == staffId : id == ownerId);
    }
}
