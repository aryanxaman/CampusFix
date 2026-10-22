# Simpler CampusFix interface

Updated 22 October 2026.

- Short page titles replace promotional dashboard headings.
- Complaint cards show title, location, priority, status, assignee and overdue warnings.
- Full descriptions, timelines and actions remain in the complaint details dialog.
- Extra filters expand on demand and display the active filter count.
- The dashboard workflow guide is collapsed initially.
- Recent activity shows the latest update for each complaint without repeating the same complaint.
- Workflow columns avoid repeating their status on every card.
- Duplicate search fields and decorative help copy are removed from the main workspace.

Validation: five frontend regression tests passed; Maven WAR packaging passed. Verified the running Tomcat application through administrator login, dashboard, complaint cards, category filtering, clearing filters, full complaint details and workflow board. Existing backend data and permissions were preserved.

Open http://127.0.0.1:8080/campusfix/ and press Ctrl+F5 if an existing browser tab still shows the previous interface.
