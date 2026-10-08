-- ---------------------------------------------------------------------------
-- Explainable Predictive Maintenance and Recommendation System
-- MySQL setup script.
--
-- Run as a MySQL admin user, e.g.:
--   mysql -u root -p < setup.sql
--
-- This only creates the database and an application user with the right
-- privileges. The actual TABLES are created automatically by SQLAlchemy
-- when the app starts (src.database.init_db()), or by running:
--   python -c "from src.database import init_db; init_db()"
-- ---------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS predictive_maintenance
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Create an application-specific user (edit the password, then match it in .env)
CREATE USER IF NOT EXISTS 'pdm_user'@'localhost' IDENTIFIED BY 'change_me';

GRANT ALL PRIVILEGES ON predictive_maintenance.* TO 'pdm_user'@'localhost';

FLUSH PRIVILEGES;
