# CampusFix visual redesign

Updated 22 October 2026.

The shared campus-tech theme is in `src/main/webapp/assets/campus-theme.css` (also visible through `Frontend/assets/campus-theme.css` in VS Code). It loads last in the JSP shell and optional HTML preview, keeping the original styles and application structure available.

The design uses pale blue surfaces, deep indigo navigation, consistent rounded cards, readable hierarchy, refined tables, role dashboards, colour-coded statuses, polished fields, glass modal backdrops and subtle hover effects. Dark mode has its own surface and status palette. Responsive rules support mobile navigation, single-column complaint cards, scrollable tabs and tables, and stacked forms. Keyboard focus and reduced-motion preferences are supported.

The logo accent and charts match the new palette. JavaScript edits are limited to literal chart/legend colours and a versioned logo URL. Java code, JDBC/DAO logic, schema, routes, permissions and complaint workflows were not changed.

Validation:

- Five existing frontend regression checks passed.
- JavaScript syntax check passed.
- Maven WAR packaging passed; the packaged theme was compared with source.
- Source comparison confirmed no non-presentation changes to app.js and no changes to Java, database or deployment routing files.
- The running MySQL/Tomcat app was checked through Admin, Student and Staff sign-in; login, dashboard, complaints, report form, settings and analytics were inspected.
- Mobile was checked at 390 × 844, including opening the navigation drawer and navigating to complaints. Document width stayed within the viewport. Desktop viewport was restored afterward.
- Dark mode was inspected on the Staff dashboard.

Visual previews: `indigo-admin.png`, `indigo-student.png`, `indigo-staff-dark.png`, and `indigo-mobile.png` in this docs folder.

Open http://127.0.0.1:8080/campusfix/ and refresh with Ctrl+F5. The updated source is saved in the existing Desktop CampusFix project. Future deployments should build and deploy the updated WAR normally.
