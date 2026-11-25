-- Storage quota/TTL plans, manual (bank transfer / Multicaixa) payment requests, a newsletter
-- list and a log of every email the app would send (see server/mailer.js).
ALTER TABLE subscriptions
  ADD COLUMN storage_addon_mb INT NOT NULL DEFAULT 0,
  ADD COLUMN storage_warned_at DATETIME(3) NULL;

ALTER TABLE user_settings
  ADD COLUMN notify_storage TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE payment_requests (
  id CHAR(12) NOT NULL PRIMARY KEY,
  user_id CHAR(12) NOT NULL,
  kind ENUM('plan','storage_addon') NOT NULL,
  item_id VARCHAR(20) NOT NULL,
  amount_kz INT NOT NULL,
  reference VARCHAR(20) NOT NULL,
  proof_url VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  INDEX (user_id, status), INDEX (status, created_at),
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE newsletter_subscribers (
  email VARCHAR(200) NOT NULL PRIMARY KEY,
  user_id CHAR(12) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  unsubscribed_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every email the app would send goes through here, whether or not a real SMTP/API is configured
-- (server/mailer.js), so nothing silently disappears before that is set up.
CREATE TABLE mail_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  to_email VARCHAR(200) NOT NULL,
  template VARCHAR(60) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  sent TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
