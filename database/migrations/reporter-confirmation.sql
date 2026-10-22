-- Run once as a migration administrator against an existing CampusFix database.
-- Existing complaint records and enum positions are preserved.
USE campusfix;
ALTER TABLE complaints MODIFY COLUMN status
ENUM('REPORTED','REVIEW','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','PENDING_CONFIRMATION')
NOT NULL DEFAULT 'REPORTED';
