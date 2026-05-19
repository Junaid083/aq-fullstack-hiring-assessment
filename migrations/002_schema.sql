BEGIN;

-- Org hierarchy: EMEA → UK/NL/DE Region → Offices
CREATE TABLE business_units (
  id        TEXT     PRIMARY KEY,
  name      TEXT     NOT NULL,
  parent_id TEXT     REFERENCES business_units(id),
  region    TEXT     NOT NULL,
  depth     SMALLINT NOT NULL DEFAULT 0
);

-- Time-bounded, region-scoped CO2 conversion rates
-- Overlapping periods resolved at query time: narrower range wins
CREATE TABLE emission_factors (
  id               SERIAL        PRIMARY KEY,
  activity_type    TEXT          NOT NULL,
  region           TEXT          NOT NULL,
  valid_from       DATE          NOT NULL,
  valid_to         DATE          NOT NULL,
  kg_co2e_per_unit NUMERIC(14,6) NOT NULL,
  unit             TEXT          NOT NULL,
  source           TEXT,
  UNIQUE (activity_type, region, valid_from, valid_to),
  CHECK  (valid_from < valid_to),
  CHECK  (kg_co2e_per_unit > 0)
);

-- Tracks every CSV upload; file_hash ensures same file uploaded twice is a no-op
CREATE TABLE upload_batches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       TEXT        NOT NULL,
  file_hash      TEXT        NOT NULL UNIQUE,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         TEXT        NOT NULL DEFAULT 'pending', -- pending | processed | failed
  accepted_count INTEGER,
  rejected_count INTEGER,
  error_message  TEXT,
  CHECK (status IN ('pending', 'processed', 'failed'))
);

-- Validated activity records only; region denormalized from BU to avoid subquery in LATERAL join
CREATE TABLE activities (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id TEXT          NOT NULL REFERENCES business_units(id),
  region           TEXT          NOT NULL,
  activity_type    TEXT          NOT NULL,
  quantity         NUMERIC(14,6) NOT NULL,
  unit             TEXT          NOT NULL,
  activity_date    DATE          NOT NULL,
  source_ref       TEXT,
  upload_batch_id  UUID          REFERENCES upload_batches(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (quantity >= 0)
);

-- Bad rows land here instead of being silently dropped; status=corrected for unit conversions
CREATE TABLE ingestion_issues (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_batch_id UUID        REFERENCES upload_batches(id),
  raw_row         JSONB       NOT NULL,
  reason_code     TEXT        NOT NULL,
  reason_detail   TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'rejected', -- rejected | corrected
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('rejected', 'corrected'))
);

-- Compound index covers date range + BU join + activity_type in one seek
CREATE INDEX ON activities (activity_date, business_unit_id, activity_type);
CREATE INDEX ON activities (activity_type, region);
CREATE INDEX ON emission_factors (activity_type, region, valid_from, valid_to);
CREATE INDEX ON business_units (parent_id);
CREATE INDEX ON ingestion_issues (upload_batch_id);
CREATE INDEX ON activities (upload_batch_id);

COMMIT;
