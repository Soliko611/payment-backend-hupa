ALTER TABLE users
  ALTER COLUMN username TYPE VARCHAR(254);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_username_format;

ALTER TABLE users
  ADD CONSTRAINT users_username_format CHECK (
    username ~ '^[a-zA-Z0-9_]{3,50}$'
    OR username ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );
