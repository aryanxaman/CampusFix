# Code review and fixes — 19 October 2026

Fixed missing-priority validation for admin workflow updates (HTTP 400 instead of 500), inconsistent complaint snapshots during concurrent changes, CSV data loss and formula handling, navigation during delayed user searches, and empty modal focus handling.

Updated VS Code task resolution for both folder and workspace usage. Added JDK discovery through PATH to local launch and removed the verification script's hardcoded JDK version. Added safe local restart and consistent loopback HTTP access. Formatted Python scripts.

Validation: 52 Java tests, 2 frontend regression tests, 54 HTTP checks against isolated MySQL/Tomcat, JSP compilation and Maven WAR packaging passed. Local records and uploads were not used by regression tests.

This review covers the inspected code and tested flows; it is not a guarantee that every possible defect is absent.
