CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES uploads(id),
  bank_name TEXT,
  account_identifier_hash TEXT,
  currency TEXT,
  date_range_start DATE,
  date_range_end DATE,
  raw_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID REFERENCES statements(id),
  posted_at TIMESTAMPTZ,
  value_date DATE,
  amount NUMERIC(18, 4) NOT NULL,
  currency TEXT NOT NULL,
  description_raw TEXT,
  description_norm TEXT,
  balance_after NUMERIC(18, 4),
  hash_signature TEXT,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_ids UUID[] NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  trigger_source TEXT,
  status TEXT NOT NULL,
  error TEXT,
  claude_model TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_run_id UUID REFERENCES match_runs(id),
  tx_a_id UUID REFERENCES transactions(id),
  tx_b_id UUID REFERENCES transactions(id),
  relationship_type TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL,
  reason TEXT,
  raw_claude_response JSONB,
  -- optional human labelling fields for future training
  label_type TEXT,
  label_source TEXT,
  labelled_by TEXT,
  label_confidence NUMERIC(4, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
