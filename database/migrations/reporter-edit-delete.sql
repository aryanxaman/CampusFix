-- Run once against an existing CampusFix database, or use MigrationTool for an idempotent migration.
USE campusfix;
ALTER TABLE complaints ADD COLUMN deleted_at TIMESTAMP NULL;
