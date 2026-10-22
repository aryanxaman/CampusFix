package edu.vit.campusfix;

import java.sql.*;
import java.util.*;

/** Central validation and authorization rules, independent of HTTP and the UI. */
public final class ComplaintService {

    public static final Set<String> CATEGORIES = Set.of(
        "Electrical",
        "Plumbing",
        "Internet & Wi-Fi",
        "Furniture",
        "Housekeeping",
        "Air Conditioning",
        "Infrastructure",
        "Other"
    );
    public static final Set<String> PRIORITIES = Set.of("LOW", "MEDIUM", "HIGH", "URGENT");
    private static final Map<String, Set<String>> BLOCKS = Map.of(
        "Hostel",
        Set.of("K", "L", "M", "N", "Q", "R", "S", "T"),
        "Academic",
        Set.of("PRP", "SJT", "TT", "SMV")
    );
    private final ComplaintDao dao = new ComplaintDao();

    public static String text(Map<String, String> data, String key, int min, int max) {
        String value = Optional.ofNullable(data.get(key)).orElse("").trim();
        if (value.length() < min || value.length() > max) throw new ApiException(
            400,
            "Please provide a valid " + key + " (" + min + "–" + max + " characters)."
        );
        return value;
    }

    public static void validateReport(User u, Map<String, String> d) {
        validateReport(u, d, new AppSettings());
    }

    public static void validateReport(User u, Map<String, String> d, AppSettings config) {
        if (!u.canReport()) throw new ApiException(
            403,
            "Only students and faculty can report issues."
        );
        if ("FACULTY".equals(u.role()) && !"Academic".equals(d.get("type"))) throw new ApiException(
            403,
            "Faculty can report issues only in academic buildings."
        );
        if ("STUDENT".equals(u.role()) && "Hostel".equals(d.get("type"))) {
            if (u.hostelBlock() == null || u.hostelBlock().isBlank()) throw new ApiException(
                403,
                "Ask your administrator to assign your hostel block before reporting a hostel issue."
            );
            if (!u.hostelBlock().equals(d.get("block"))) throw new ApiException(
                403,
                "You can report hostel issues only in your assigned " + u.hostelBlock() + " Block."
            );
        }
        text(d, "title", 5, 150);
        text(d, "description", 15, 3000);
        text(d, "room", 1, 80);
        if (!config.categories.contains(d.get("category"))) throw new ApiException(
            400,
            "Choose a valid category."
        );
        if (
            d.get("priority") == null || !PRIORITIES.contains(d.get("priority"))
        ) throw new ApiException(400, "Choose a valid priority.");
        if (
            !("Hostel".equals(d.get("type")) || "Academic".equals(d.get("type"))) ||
            !(
                "Hostel".equals(d.get("type")) ? config.hostelBlocks : config.academicBlocks
            ).contains(d.get("block"))
        ) throw new ApiException(400, "Choose a valid VIT location.");
        try {
            int floor = Integer.parseInt(d.get("floor"));
            if (
                floor < 0 || floor > ("Hostel".equals(d.get("type")) ? 15 : 8)
            ) throw new NumberFormatException();
        } catch (Exception e) {
            throw new ApiException(400, "Choose a valid floor.");
        }
    }

    public long report(User u, Map<String, String> d, List<ComplaintDao.Upload> photos)
        throws SQLException {
        AppSettings config = new SettingsDao().get();
        validateReport(u, d, config);
        if (photos.size() > config.maxPhotos) throw new ApiException(
            400,
            "Too many photos. The current limit is " + config.maxPhotos + "."
        );
        if (
            photos.stream().anyMatch(p -> p.fileSize() > config.uploadSizeMb * 1024L * 1024L)
        ) throw new ApiException(400, "A photo exceeds the configured upload size.");
        return dao.create(u, d, photos);
    }

    public static void validateTransition(
        User u,
        String oldStatus,
        String nextStatus,
        Long staffId,
        Long assignedId
    ) {
        if (u.isAdmin()) {
            boolean valid =
                (oldStatus.equals(nextStatus) &&
                    !Set.of("RESOLVED", "CLOSED").contains(oldStatus)) ||
                (oldStatus.equals("REPORTED") &&
                    Set.of("REVIEW", "ASSIGNED").contains(nextStatus)) ||
                (oldStatus.equals("REVIEW") && nextStatus.equals("ASSIGNED"));
            if (!valid) throw new ApiException(400, "That workflow transition is not allowed.");
            if (
                nextStatus.equals("ASSIGNED") && staffId == null && assignedId == null
            ) throw new ApiException(400, "Assign a staff member first.");
        } else if (u.isStaff()) {
            if (assignedId == null || assignedId != u.id()) throw new ApiException(
                403,
                "This complaint is not assigned to you."
            );
            boolean valid =
                (oldStatus.equals("ASSIGNED") && nextStatus.equals("IN_PROGRESS")) ||
                (oldStatus.equals("IN_PROGRESS") &&
                    Set.of("IN_PROGRESS", "RESOLVED").contains(nextStatus));
            if (!valid) throw new ApiException(400, "Start the work before marking it resolved.");
        } else throw new ApiException(403, "You cannot update this workflow.");
    }

    public void update(User u, long id, Map<String, String> d) throws SQLException {
        text(d, "remarks", 5, 1000);
        text(d, "status", 3, 20);
        if (
            u.isAdmin() && (d.get("priority") == null || !PRIORITIES.contains(d.get("priority")))
        ) throw new ApiException(400, "Choose a valid priority.");
        dao.updateWorkflow(u, id, d);
    }

    public void feedback(User u, long id, Map<String, String> d) throws SQLException {
        text(d, "comment", 3, 1000);
        int rating;
        try {
            rating = Integer.parseInt(d.get("rating"));
        } catch (Exception e) {
            throw new ApiException(400, "Choose a rating from 1 to 5.");
        }
        if (rating < 1 || rating > 5) throw new ApiException(400, "Choose a rating from 1 to 5.");
        dao.feedback(u, id, rating, d.get("comment").trim());
    }
}
