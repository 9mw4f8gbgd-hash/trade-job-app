ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
UPDATE users SET role = 'tech' WHERE lower(email) IN ('tech@demo.test', 'office@demo.test');
