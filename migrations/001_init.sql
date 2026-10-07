-- Initial schema: spec §6. utf8mb4_unicode_ci makes the unique keys on names and emails case-insensitive.

CREATE TABLE departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NULL,
  role ENUM('staff','reception','security','it','admin') NOT NULL,
  department_id INT UNSIGNED NULL,
  password_hash VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE visits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visitor_name VARCHAR(120) NOT NULL,
  visitor_phone VARCHAR(30) NOT NULL,
  visitor_email VARCHAR(190) NULL,
  visitor_company VARCHAR(120) NULL,
  visitor_type ENUM('client','vendor','interviewee','contractor','guest') NOT NULL,
  host_user_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NULL,
  booked_by_user_id INT UNSIGNED NOT NULL,
  channel ENUM('staff','reception') NOT NULL,
  visit_date DATE NOT NULL,
  expected_arrival TIME NOT NULL,
  expected_departure TIME NULL,
  purpose VARCHAR(255) NOT NULL,
  party_size TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('booked','checked_in','checked_out','cancelled','no_show') NOT NULL DEFAULT 'booked',
  checked_in_at DATETIME NULL,
  checked_in_by INT UNSIGNED NULL,
  checked_out_at DATETIME NULL,
  checked_out_by INT UNSIGNED NULL,
  badge_number VARCHAR(30) NULL,
  id_type VARCHAR(40) NULL,
  id_number VARCHAR(40) NULL,
  cancelled_at DATETIME NULL,
  cancelled_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_visits_date_status (visit_date, status),
  KEY idx_visits_host (host_user_id),
  KEY idx_visits_department (department_id),
  CONSTRAINT fk_visits_host FOREIGN KEY (host_user_id) REFERENCES users (id),
  CONSTRAINT fk_visits_department FOREIGN KEY (department_id) REFERENCES departments (id),
  CONSTRAINT fk_visits_booked_by FOREIGN KEY (booked_by_user_id) REFERENCES users (id),
  CONSTRAINT fk_visits_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES users (id),
  CONSTRAINT fk_visits_checked_out_by FOREIGN KEY (checked_out_by) REFERENCES users (id),
  CONSTRAINT fk_visits_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose ENUM('invite','reset') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_tokens_hash (token_hash),
  KEY idx_auth_tokens_user (user_id, purpose),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No foreign key on user_id: audit rows must outlive anything they mention.
CREATE TABLE audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NULL,
  details TEXT NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_attempts_lookup (email, ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
