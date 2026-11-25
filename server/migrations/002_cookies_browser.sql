-- Optional: let yt-dlp read login cookies from a browser on this computer, for videos that need a signed-in account.
ALTER TABLE user_settings ADD COLUMN cookies_browser VARCHAR(12) NOT NULL DEFAULT '';
