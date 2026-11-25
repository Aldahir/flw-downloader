-- Optional profile fields the user can fill in (shown anonymised/aggregated in admin stats).
ALTER TABLE users
  ADD COLUMN gender VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN birth_year SMALLINT NULL,
  ADD COLUMN location VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT '';
