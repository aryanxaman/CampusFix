package edu.vit.campusfix;

import java.time.*;
import java.util.*;

/** Server-generated analytics shared by the admin workspace and deployment tests. */
public final class AnalyticsService {

    private static boolean done(Map<String, Object> t) {
        return Set.of("RESOLVED", "CLOSED").contains(t.get("status"));
    }

    private static Instant instant(Object value) {
        return value == null ? null : Instant.parse(value.toString());
    }

    private static Double duration(Map<String, Object> t) {
        Instant resolved = instant(t.get("resolvedAt"));
        return resolved == null
            ? null
            : Math.max(
                  0,
                  Duration.between(instant(t.get("createdAt")), resolved).toMillis() / 3600000d
              );
    }

    private static Double average(List<Double> values) {
        return values.isEmpty()
            ? null
            : values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    public static Map<String, Object> metrics(List<Map<String, Object>> tickets) {
        List<Map<String, Object>> completed = tickets
            .stream()
            .filter(AnalyticsService::done)
            .toList();
        List<Double> durations = completed
            .stream()
            .map(AnalyticsService::duration)
            .filter(Objects::nonNull)
            .toList();
        List<Double> ratings = tickets
            .stream()
            .map(t -> t.get("rating"))
            .filter(Objects::nonNull)
            .map(r -> ((Number) r).doubleValue())
            .toList();
        long onTime = completed
            .stream()
            .filter(t -> t.get("sla") instanceof Map<?, ?> sla && "MET".equals(sla.get("state")))
            .count();
        long overdue = tickets
            .stream()
            .filter(
                t ->
                    t.get("sla") instanceof Map<?, ?> sla &&
                    Boolean.TRUE.equals(sla.get("escalationRequired"))
            )
            .count();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", tickets.size());
        m.put("activeAssignments", tickets.size() - completed.size());
        m.put("resolved", completed.size());
        m.put("overdue", overdue);
        m.put("averageResolutionHours", average(durations));
        m.put("averageRating", average(ratings));
        m.put(
            "completionPercent",
            tickets.isEmpty() ? 0 : (100d * completed.size()) / tickets.size()
        );
        m.put("withinSlaPercent", completed.isEmpty() ? null : (100d * onTime) / completed.size());
        return m;
    }

    public static List<Map<String, Object>> staff(
        List<Map<String, Object>> users,
        List<Map<String, Object>> tickets
    ) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> user : users)
            if ("STAFF".equals(user.get("role"))) {
                long id = ((Number) user.get("id")).longValue();
                Map<String, Object> row = new LinkedHashMap<>(user);
                row.putAll(
                    metrics(
                        tickets
                            .stream()
                            .filter(
                                t ->
                                    t.get("assignedStaffId") instanceof Number n &&
                                    n.longValue() == id
                            )
                            .toList()
                    )
                );
                result.add(row);
            }
        return result;
    }

    public static Map<String, Object> report(
        List<Map<String, Object>> tickets,
        List<Map<String, Object>> staff,
        AppSettings config,
        Instant now
    ) {
        List<Map<String, Object>> byBlock = new ArrayList<>();
        for (String type : List.of("Hostel", "Academic")) {
            Set<String> names = new LinkedHashSet<>(
                type.equals("Hostel") ? config.hostelBlocks : config.academicBlocks
            );
            tickets
                .stream()
                .filter(t -> type.equals(t.get("type")))
                .forEach(t -> names.add(t.get("block").toString()));
            for (String block : names) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("type", type);
                row.put("block", block);
                row.putAll(
                    metrics(
                        tickets
                            .stream()
                            .filter(t -> type.equals(t.get("type")) && block.equals(t.get("block")))
                            .toList()
                    )
                );
                byBlock.add(row);
            }
        }
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (Map<String, Object> t : tickets)
            if (!instant(t.get("createdAt")).isBefore(now.minus(Duration.ofDays(30)))) {
                String key =
                    t.get("category") +
                    "|" +
                    t.get("type") +
                    "|" +
                    t.get("block") +
                    "|" +
                    t.get("floor");
                groups.computeIfAbsent(key, k -> new ArrayList<>()).add(t);
            }
        List<Map<String, Object>> recurring = new ArrayList<>();
        for (List<Map<String, Object>> group : groups.values())
            if (group.size() >= 2) {
                group.sort(Comparator.comparing(t -> instant(t.get("createdAt"))));
                Map<String, Object> first = group.get(0),
                    last = group.get(group.size() - 1);
                Map<String, Object> row = new LinkedHashMap<>();
                for (String key : List.of("category", "type", "block", "floor"))
                    row.put(key, first.get(key));
                row.put("count", group.size());
                row.put("firstAt", first.get("createdAt"));
                row.put("lastAt", last.get("createdAt"));
                row.put("averageResolutionHours", metrics(group).get("averageResolutionHours"));
                row.put(
                    "latestComplaint",
                    Map.of("id", last.get("id"), "title", last.get("title"))
                );
                row.put(
                    "relatedIds",
                    group
                        .stream()
                        .map(t -> t.get("id"))
                        .toList()
                );
                recurring.add(row);
            }
        recurring.sort((a, b) ->
            Integer.compare((Integer) b.get("count"), (Integer) a.get("count"))
        );
        return Map.of(
            "summary",
            metrics(tickets),
            "staff",
            staff,
            "blocks",
            byBlock,
            "recurring",
            recurring
        );
    }
}
