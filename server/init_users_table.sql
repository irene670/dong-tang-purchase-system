CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  roles text[] NOT NULL DEFAULT '{dealer}',
  full_name text,
  company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure there is a foreign key/reference constraint or matching identity_user_id in dealers
-- We will handle linking dynamically, or users can be queried.
