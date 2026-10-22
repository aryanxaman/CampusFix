CREATE DATABASE IF NOT EXISTS campusfix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campusfix;

CREATE TABLE IF NOT EXISTS users (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(100) NOT NULL,
 role ENUM('STUDENT','FACULTY','ADMIN','STAFF') NOT NULL,
 phone VARCHAR(25),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 auth_version INT NOT NULL DEFAULT 1,
 hostel_block VARCHAR(10),
 deleted_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS maintenance_staff (
 user_id BIGINT PRIMARY KEY,
 specialization VARCHAR(150) NOT NULL,
 available BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS categories (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS locations (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 type ENUM('Hostel','Academic') NOT NULL,
 block VARCHAR(10) NOT NULL,
 floor VARCHAR(3) NOT NULL,
 room VARCHAR(80) NOT NULL,
 UNIQUE KEY location_unique(type,block,floor,room)
);
CREATE TABLE IF NOT EXISTS complaints (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 user_id BIGINT NOT NULL,
 category_id BIGINT NOT NULL,
 location_id BIGINT NOT NULL,
 title VARCHAR(150) NOT NULL,
 description TEXT NOT NULL,
 priority ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
 status ENUM('REPORTED','REVIEW','ASSIGNED','IN_PROGRESS','PENDING_CONFIRMATION','RESOLVED','CLOSED') NOT NULL DEFAULT 'REPORTED',
 assigned_staff_id BIGINT,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at TIMESTAMP NULL,
 deleted_at TIMESTAMP NULL,
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(category_id) REFERENCES categories(id),
 FOREIGN KEY(location_id) REFERENCES locations(id),
 FOREIGN KEY(assigned_staff_id) REFERENCES maintenance_staff(user_id),
 INDEX complaint_owner(user_id,created_at),
 INDEX complaint_staff(assigned_staff_id,status),
 INDEX complaint_recurring(category_id,location_id,created_at),
 INDEX complaint_status(status,created_at)
);
CREATE TABLE IF NOT EXISTS complaint_updates (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 complaint_id BIGINT NOT NULL,
 actor_id BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL,
 remarks VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(complaint_id) REFERENCES complaints(id),
 FOREIGN KEY(actor_id) REFERENCES users(id),
 INDEX update_complaint(complaint_id,created_at)
);
CREATE TABLE IF NOT EXISTS attachments (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 complaint_id BIGINT NOT NULL,
 uploaded_by BIGINT NOT NULL,
 file_path VARCHAR(100) NOT NULL,
 file_type VARCHAR(30) NOT NULL,
 file_size BIGINT NOT NULL,
 original_name VARCHAR(255) NOT NULL,
 FOREIGN KEY(complaint_id) REFERENCES complaints(id),
 FOREIGN KEY(uploaded_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS feedback (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 complaint_id BIGINT NOT NULL UNIQUE,
 user_id BIGINT NOT NULL,
 rating INT NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment VARCHAR(1000) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(complaint_id) REFERENCES complaints(id),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notifications (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 user_id BIGINT NOT NULL,
 complaint_id BIGINT NOT NULL,
 message VARCHAR(1200) NOT NULL,
 is_read BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(complaint_id) REFERENCES complaints(id),
 INDEX notification_user(user_id,is_read,created_at)
);
INSERT IGNORE INTO categories(name) VALUES ('Electrical'),('Plumbing'),('Internet & Wi-Fi'),('Furniture'),('Housekeeping'),('Air Conditioning'),('Infrastructure'),('Other');

-- Provision accounts with scripts/create-user.ps1 after applying this schema.
-- No hardcoded production passwords or demo users are added to this database.

CREATE TABLE IF NOT EXISTS app_settings (
 id INT PRIMARY KEY,
 config_json TEXT NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_audit (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 actor_id BIGINT NOT NULL,
 action VARCHAR(80) NOT NULL,
 target_user_id BIGINT,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(actor_id) REFERENCES users(id),
 FOREIGN KEY(target_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS complaint_escalations (
 complaint_id BIGINT PRIMARY KEY,
 escalated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(complaint_id) REFERENCES complaints(id)
);
CREATE TABLE IF NOT EXISTS escalation_recipients (
 complaint_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL,
 PRIMARY KEY(complaint_id,user_id),
 FOREIGN KEY(complaint_id) REFERENCES complaints(id),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
