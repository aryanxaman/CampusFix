package edu.vit.campusfix;

import java.util.*;

/** Persistent reporting policy. Existing complaints retain their original category/location. */
public final class AppSettings {

    public Map<String, Integer> slaHours = new LinkedHashMap<>(
        Map.of("URGENT", 4, "HIGH", 24, "MEDIUM", 48, "LOW", 72)
    );
    public int maxPhotos = 5;
    public int uploadSizeMb = 5;
    public List<String> categories = new ArrayList<>(
        List.of(
            "Electrical",
            "Plumbing",
            "Internet & Wi-Fi",
            "Furniture",
            "Housekeeping",
            "Air Conditioning",
            "Infrastructure",
            "Other"
        )
    );
    public List<String> hostelBlocks = new ArrayList<>(
        List.of("K", "L", "M", "N", "Q", "R", "S", "T")
    );
    public List<String> academicBlocks = new ArrayList<>(List.of("PRP", "SJT", "TT", "SMV"));
    public boolean notifyReporter = true;
    public boolean notifyStaff = true;
    public boolean notifyAdmins = true;
    public boolean notifyEscalations = true;

    public void validate() {
        if (
            slaHours == null ||
            !slaHours.keySet().equals(ComplaintService.PRIORITIES) ||
            slaHours
                .values()
                .stream()
                .anyMatch(v -> v == null || v < 1 || v > 8760)
        ) throw new ApiException(400, "Set each SLA target between 1 and 8760 hours.");
        if (maxPhotos < 1 || maxPhotos > 10) throw new ApiException(
            400,
            "Maximum photos must be between 1 and 10."
        );
        if (uploadSizeMb < 1 || uploadSizeMb > 10) throw new ApiException(
            400,
            "Upload size must be between 1 and 10 MB per photo."
        );
        categories = clean(categories, 80, "categories");
        hostelBlocks = clean(hostelBlocks, 10, "hostel blocks");
        academicBlocks = clean(academicBlocks, 10, "academic blocks");
        for (String block : java.util.stream.Stream.concat(
            hostelBlocks.stream(),
            academicBlocks.stream()
        ).toList())
            if (!block.matches("[A-Za-z0-9][A-Za-z0-9 _-]{0,9}")) throw new ApiException(
                400,
                "Block names can contain letters, numbers, spaces, underscores and hyphens."
            );
    }

    private static List<String> clean(List<String> items, int max, String label) {
        if (items == null || items.isEmpty() || items.size() > 50) throw new ApiException(
            400,
            "Provide 1–50 " + label + "."
        );
        LinkedHashMap<String, String> unique = new LinkedHashMap<>();
        for (String item : items) {
            if (
                item == null ||
                item.trim().isEmpty() ||
                item.trim().length() > max ||
                item.chars().anyMatch(Character::isISOControl)
            ) throw new ApiException(400, "Invalid " + label + " value.");
            String value = item.trim();
            if (
                unique.putIfAbsent(value.toLowerCase(Locale.ROOT), value) != null
            ) throw new ApiException(400, "Remove duplicate " + label + ".");
        }
        return new ArrayList<>(unique.values());
    }
}
