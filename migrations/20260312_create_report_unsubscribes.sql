-- Report unsubscribes: tracks emails that have opted out of lesson reports
-- Token = SHA-256 hash of lowercase email, used in unsubscribe links

CREATE TABLE IF NOT EXISTS report_unsubscribes (
  id SERIAL PRIMARY KEY,
  email TEXT,
  token TEXT NOT NULL UNIQUE,
  unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_unsubscribes_token ON report_unsubscribes (token);
