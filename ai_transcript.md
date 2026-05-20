# AI Prompt Transcript

---

## PR 1 — Schema Design (`feat/schema-design`)

### Prompt 1

> "yo walk me through this repo, what are we working with here"

Got a solid lay of the land — what's wired, what's stubbed, what's missing entirely.

---

### Prompt 2

> "here's the brief, give me the tldr and what they actually care about"

Pulled out the key deliverables, flagged the 4 hard questions as the real evaluation criteria, and noted the PR-per-feature workflow they want to see.

---

### Prompt 3

> "before we touch any sql, walk me through all 3 seed files. what's the shape of the data, any gotchas"

Good catch here — AI spotted the 4 dodgy rows in activities.csv, the overlapping emission factor ranges for UK air travel, and the full BU tree. Glad I didn't skip this step.

---

### Prompt 4

> "alright design the schema, but match the actual csv column names don't invent stuff"

First draft was off — UUIDs everywhere, wrong column names, made up abstractions. Had to reel it back:

- `organizations` → `business_units`, TEXT ids to match the CSV directly
- `period_start / period_end` → single `activity_date`, that's all the CSV has
- `country` → `region`, literally what the column is called

---

### Prompt 5

> "what db level constraints should we slap on here, don't rely on app code alone"

Solid output — CHECK constraints on quantities, date ordering, status enums, UNIQUE on emission factors for safe re-seeding.

---

### Prompt 6

> "think about the rollup query we'll need to run — recursive cte, lateral join for factors. anything in this schema that's gonna hurt us at query time"

This one was worth asking. Two things came up I'd have missed:

- There was a correlated subquery hiding inside the LATERAL, firing once per row — killed it by denormalizing `region` onto activities
- Had three loose single-column indexes — collapsed into one compound index that covers the full reporting query in a single seek

### Schema — What I'd revisit with more time

- `depth` is computed manually during seed — with more time I'd use a trigger or a recursive CTE on insert so it's always consistent regardless of insert order
- The `UNIQUE (activity_type, region, valid_from, valid_to)` constraint on emission factors assumes non-overlapping ranges, but it doesn't enforce it at the DB level — a CHECK constraint can't do cross-row validation, so I'd add a exclusion constraint or a trigger to catch overlaps before they silently break the narrowest-range resolution logic

---

## PR 2 — CSV Ingestion (`feat/ingestion`)

### Ingestion — Prompt 1

> "walk me through what ingestion actually needs to handle end to end"

Got the full picture — parse CSV, validate rows against BUs + emission factors, batch insert valids, log issues for bad rows, track the batch state. Also flagged the idempotency requirement: same file uploaded twice should not double-count.

---

### Ingestion — Prompt 2

> "how do we handle large files without the request timing out or the server eating too much memory"

Chunked upload — split on the client, 200 rows per chunk, header re-attached to each chunk. First chunk carries a SHA-256 hash of the full file for idempotency. Subsequent chunks carry the `batchId` from the first response. Server never holds the whole file in memory.

---

### Ingestion — Prompt 3

> "what's the idempotency check look like — how do we know if this file's already been processed"

SHA-256 of the raw file content, stored as `file_hash` on `upload_batches` with a UNIQUE constraint. First chunk queries for existing hash — if hit, short-circuit the whole upload and return the previous result with `skipped: true`. No re-processing, no duplicate rows.

---

### Ingestion — Prompt 4

> "what validations do we need on each row before we insert it"

Four checks in order:

1. `business_unit_id` exists in our BU table — reject if not found
2. `quantity` is a non-negative number — reject if NaN or negative
3. `activity_type` has an emission factor — reject if no matching factor exists
4. `unit` matches expected unit for that activity type — try conversion first (e.g. MWh → kWh × 1000), corrected if recoverable, rejected if not

Corrected rows still go to `ingestion_issues` with `status = 'corrected'` so the issue is visible but the row is kept.

---

### Ingestion — Prompt 5

> "should we wrap each chunk in a transaction — what happens if it half-inserts"

Yeah, full transaction per chunk — activities insert + issues insert + batch counter update all commit together or all roll back. Batch flips to `failed` status in the catch block so we always have a recoverable audit trail.

---

### Ingestion — Prompt 6

> "we keep repeating these string literals everywhere — status enums, reason codes, unit names. what do we do about that"

Pulled everything into `api/src/lib/constants.ts` — `BATCH_STATUS`, `ISSUE_STATUS`, `REASON_CODE`, `EXPECTED_UNITS`, `UNIT_CONVERSIONS`. Same pattern on the frontend: `web/src/constants.ts` for `CHUNK_SIZE`. Single source of truth, one place to update if anything changes.

---

### Ingestion — Prompt 7

> "is the batch insert actually efficient — are we firing one INSERT per row"

postgres.js row helper `tx(activityRows)` generates a single multi-row INSERT for all valid rows in the chunk. Not `tx.array()` — that doesn't exist. Not a loop of individual inserts. One round trip for potentially 200 rows.

---

### Ingestion — Prompt 8

> "what does the progress bar on the frontend need to track"

Chunk index vs total chunks — `progress.current / progress.total` maps directly to a percentage. Show it while uploading, hide it on done/error. Handle the `skipped` case separately — show "same file already uploaded" banner instead of counts from this run.

### Ingestion — What I'd revisit with more time

- The MWh → kWh conversion is a judgment call — with more time I'd surface it as a warning in the UI rather than silently correcting, so the data submitter knows their file had unit mismatches
- Chunk size of 200 rows is hardcoded in `web/src/constants.ts` — should be configurable per client or at least an env var, since a client with 10-column wide rows has a very different payload size than one with 6
- No retry logic on failed chunks — if chunk 3 of 10 fails mid-upload the whole batch is in a `failed` state with no way to resume from chunk 3; a real implementation would need resumable upload support
