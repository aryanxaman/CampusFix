-- Apply once to an existing database before deploying the updated WAR.
-- MigrationTool performs this check automatically for the local launcher.
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL;
