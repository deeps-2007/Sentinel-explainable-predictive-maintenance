-- ---------------------------------------------------------------------------
-- Explainable Predictive Maintenance and Recommendation System
-- MySQL schema for the Node.js/Express backend.
--
-- Usage:
--   mysql -u root -p < setup.sql          (creates DB + app user)
--   mysql -u root -p predictive_maintenance < schema.sql   (creates tables)
-- Or simply let the backend run `npm run migrate` (src/scripts/migrate.js),
-- which executes this file automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS uploaded_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    row_count INT DEFAULT 0,
    valid_row_count INT DEFAULT 0,
    duplicate_row_count INT DEFAULT 0,
    invalid_row_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'processed',
    is_simulated BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS machine_readings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(100) NOT NULL,
    UDI INT NULL,
    Product_ID VARCHAR(50) NULL,
    machine_type VARCHAR(10) NOT NULL,
    air_temperature FLOAT NOT NULL,
    process_temperature FLOAT NOT NULL,
    rotational_speed FLOAT NOT NULL,
    torque FLOAT NOT NULL,
    tool_wear FLOAT NOT NULL,
    reading_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_filename VARCHAR(255) NULL,
    uploaded_file_id INT NULL,
    is_simulated BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_machine_id (machine_id),
    FOREIGN KEY (uploaded_file_id) REFERENCES uploaded_files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS predictions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reading_id INT NOT NULL,
    failure_probability FLOAT NOT NULL,
    status VARCHAR(20) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    prediction_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reading_id) REFERENCES machine_readings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS failure_mode_predictions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prediction_id INT NOT NULL,
    failure_mode VARCHAR(10) NOT NULL,
    probability FLOAT NOT NULL,
    FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shap_explanations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prediction_id INT NOT NULL,
    feature_name VARCHAR(100) NOT NULL,
    feature_value FLOAT NULL,
    shap_value FLOAT NOT NULL,
    contribution_direction VARCHAR(20) NOT NULL,
    FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recommendations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prediction_id INT NOT NULL,
    failure_mode VARCHAR(10) NOT NULL,
    recommendation_text TEXT NOT NULL,
    urgency VARCHAR(20) NOT NULL,
    confidence FLOAT NOT NULL,
    supporting_features TEXT NULL,
    recommendation_status VARCHAR(20) DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(100) NOT NULL,
    prediction_id INT NULL,
    recommendation_id INT NULL,
    failure_mode VARCHAR(10) NULL,
    recommended_action TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'Medium',
    assigned_to VARCHAR(100) NULL,
    status VARCHAR(20) DEFAULT 'Open',
    approved_by VARCHAR(100) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    -- SLA / alerting: the Engineer sets how many hours the Technician has to
    -- act; due_at is the computed deadline. When a Technician marks a task
    -- Completed, verification_due_at is stamped 24h out for the Manager.
    deadline_hours INT NULL,
    due_at DATETIME NULL,
    verification_due_at DATETIME NULL,
    verified_at DATETIME NULL,
    -- Which fleet upload (uploaded_files.id) was active when this task was
    -- created. Tasks are never deleted on a fleet-replace upload, so this
    -- lets the analytics dashboard split "currently done" (latest batch)
    -- from "previously done" (historical batches) without a separate table.
    upload_batch_id INT NULL,
    FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE SET NULL,
    FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE SET NULL,
    FOREIGN KEY (upload_batch_id) REFERENCES uploaded_files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prediction_id INT NULL,
    maintenance_task_id INT NULL,
    actual_failure_mode VARCHAR(10) NULL,
    action_performed TEXT NULL,
    recommendation_was_useful BOOLEAN NULL,
    feedback_text TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE SET NULL,
    FOREIGN KEY (maintenance_task_id) REFERENCES maintenance_tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Upgrade path: if maintenance_tasks already existed from an earlier version
-- of this schema (CREATE TABLE IF NOT EXISTS above is a no-op on an existing
-- table), add the SLA/analytics columns here. Requires MySQL 8.0.29+ /
-- MariaDB 10.5+ for "ADD COLUMN IF NOT EXISTS"; safe to re-run.
-- ---------------------------------------------------------------------------
ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS deadline_hours INT NULL;
ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS due_at DATETIME NULL;
ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS verification_due_at DATETIME NULL;
ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL;
ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS upload_batch_id INT NULL;
