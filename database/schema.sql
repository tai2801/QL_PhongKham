-- ============================================================
-- MediBook Clinic - Schema MySQL 8 (production)
-- Ban SQLite tuong ung nam trong backend/src/db.js (SCHEMA_SQL).
-- Luu y: MySQL khong co partial unique index, nen chong double-booking
-- dung cot GENERATED: slot_key chi co gia tri khi lich dang hoat dong.
-- ============================================================
CREATE DATABASE IF NOT EXISTS medibook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE medibook;

CREATE TABLE specialties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(500) DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  specialty_id INT NOT NULL,
  title VARCHAR(50) DEFAULT '',
  bio TEXT,
  consultation_fee INT NOT NULL DEFAULT 200000,
  slot_minutes INT NOT NULL DEFAULT 30,
  years_experience INT NOT NULL DEFAULT 1,
  room VARCHAR(20) DEFAULT '',
  CONSTRAINT fk_doctor_spec FOREIGN KEY (specialty_id) REFERENCES specialties(id),
  CONSTRAINT chk_slot_minutes CHECK (slot_minutes IN (15,20,30,45,60))
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('PATIENT','DOCTOR','ADMIN') NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  doctor_id INT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id)
) ENGINE=InnoDB;

CREATE TABLE doctor_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  weekday INT NOT NULL, -- 0=CN, 1=T2 ... 6=T7
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CONSTRAINT fk_sched_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  CONSTRAINT uq_sched UNIQUE (doctor_id, weekday, start_time),
  CONSTRAINT chk_weekday CHECK (weekday BETWEEN 0 AND 6)
) ENGINE=InnoDB;

CREATE TABLE doctor_time_off (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  date DATE NOT NULL,
  reason VARCHAR(255) DEFAULT '',
  CONSTRAINT fk_off_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  CONSTRAINT uq_off UNIQUE (doctor_id, date)
) ENGINE=InnoDB;

CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  slot_start DATETIME NOT NULL,
  slot_end DATETIME NOT NULL,
  reason VARCHAR(500) DEFAULT '',
  status ENUM('PENDING','CONFIRMED','ARRIVED','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'PENDING',
  cancel_reason VARCHAR(255) DEFAULT '',
  clinical_notes TEXT,
  instructions TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Khoa chong trung slot: NULL khi da huy (NULL khong bi UNIQUE rang buoc)
  slot_key VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN status <> 'CANCELLED' THEN CONCAT(doctor_id, '_', DATE_FORMAT(slot_start, '%Y%m%d%H%i')) ELSE NULL END
  ) STORED,
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES users(id),
  CONSTRAINT fk_appt_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  CONSTRAINT uq_appt_slot UNIQUE (slot_key),
  INDEX idx_appt_doctor_day (doctor_id, slot_start),
  INDEX idx_appt_patient (patient_id, slot_start)
) ENGINE=InnoDB;

CREATE TABLE slot_holds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  slot_start DATETIME NOT NULL,
  patient_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hold_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  CONSTRAINT fk_hold_patient FOREIGN KEY (patient_id) REFERENCES users(id),
  CONSTRAINT uq_hold UNIQUE (doctor_id, slot_start)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) DEFAULT '',
  is_read TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB;
