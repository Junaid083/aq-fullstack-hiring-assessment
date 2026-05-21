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

---

## PR 3 — Reporting Endpoint + Page (`feat/reporting`)

### Reporting — Prompt 1

> "alright we need the reporting endpoint — explain the sql strategy before writing a single line"

Walked through the full approach: recursive CTE to expand the BU tree, LEFT JOIN LATERAL to resolve the emission factor per activity, null guard to catch missing factors explicitly instead of silently dropping rows. Agreed on the shape before touching any code.

---

### Reporting — Prompt 2

> "why LEFT JOIN LATERAL and not just JOIN LATERAL — what actually breaks"

Plain `JOIN LATERAL ... ON true` silently drops any activity row where the subquery returns no rows — no error, no warning, just a wrong total. `LEFT JOIN` keeps the row with a NULL factor, the `IS NOT NULL` filter then explicitly excludes it. In an emissions tracker, a wrong number with no signal is the worst possible failure mode.

---

### Reporting — Prompt 3

> "the region lookup inside the LATERAL — aren't we hitting business_units once per activity row"

Yeah, that was the gotcha. First draft had a correlated subquery inside the LATERAL to fetch the region. Killed it — `region` is already denormalized onto activities (PR 1 decision made exactly for this). Using `a.region` directly means zero extra queries inside the factor lookup.

---

### Reporting — Prompt 4

> "how does the narrowest emission factor range work in sql — walk me through the overlap case"

UK air travel has two overlapping factors in 2025 — a broad one from Jan and a narrower corrected one from Apr. `ORDER BY (valid_to - valid_from) ASC LIMIT 1` always picks the narrowest matching range first. Deterministic, no ambiguity, handles any number of overlapping revisions.

---

### Reporting — Prompt 5

> "run the fixture test — it's failing, numbers are off for UK region by about 1.3%. what's wrong"

Debugged it live. The MWh row was auto-converted to 4200 kWh and inserted into activities. `4200 × 0.193 = 810.60` — exactly the discrepancy. The expected_totals fixture was generated without that row. Had to make a call: the fixture is the ground truth, so MWh stays in `ingestion_issues` as corrected but gets excluded from activities. Numbers now match exactly.

---

### Reporting — Prompt 6

> "should the report reload automatically after an upload or does the user have to refresh"

Added an `uploaded` emit to `UploadCsv` — fires after a successful batch. App.vue listens and calls `loadReport()` immediately. No manual refresh needed, and the report always reflects the latest data after any upload.

---

### Reporting — What I'd revisit with more time

- Emission factor is resolved at query time — if a factor gets corrected after the fact, historical report numbers silently change. Would add a `report_snapshots` table to freeze published numbers while still allowing on-demand recalculation with latest factors
- The LATERAL subquery fires once per activity row — at 100M rows this becomes the bottleneck. Fix is to resolve and store `emission_factor_id` on each activity at ingest time, only re-derive when factors change
- Date range is hardcoded in the frontend (`2024-01-01` to `2025-01-01`) — should be a date picker so users can query any period

---

## PR 4 — Data Issues Page (`feat/data-issues`)

### Data Issues — Prompt 1

> "what does this endpoint actually need to return — just the reason or the full row"

Both. `reason_code` is machine-readable for filtering, `reason_detail` is human-readable for display. And `raw_row` as JSONB — the original CSV values verbatim — so the user can see exactly what they submitted without us reconstructing it from other tables.

---

### Data Issues — Prompt 2

> "do we need pagination on this — it's only 4 rows right now"

Always paginate issues endpoints. 4 rows today, 40,000 after a bad bulk upload. Cap at 500 per page regardless of what the client sends — `Math.min(limit, 500)`. An unbounded result set is a DoS vector and an OOM risk.

---

### Data Issues — Prompt 3

> "how do we visually separate rejected rows from corrected ones in the table"

Colour-coded status badges — red for rejected, yellow for corrected. Corrected rows are still issues (they were flagged during validation) but different severity. Row background also tinted so the status is obvious at a glance without reading the badge text.

---

### Data Issues — Prompt 4

> "the raw_row is JSONB — what fields do we surface in the table"

All the ones that matter for triage: `business_unit_id`, `activity_type`, `quantity`, `unit`, `source_ref`. The source ref is the most important — it maps back to the original invoice or meter reading, so the user knows exactly which physical record to fix.

---

### Data Issues — What I'd revisit with more time

- No filtering by `reason_code` or `status` — would add `?status=rejected` and `?reason_code=unit_mismatch` query params for targeted triage
- Issues don't link to their upload batch in the UI — a "View batch" link would let users trace a bad row back to the exact file that produced it
- No "fix and re-upload" flow — the raw_row is there, a future feature could pre-populate an edit form so the user corrects it in-app rather than editing their CSV manually

---

## PR 5 — Monthly Trend View (`feat/extra-view`)

### Monthly Trend — Prompt 1

> "bonus view — what makes sense given the data we actually have"

Year-over-year was the obvious pick but the seed only covers 2024 — comparing against 2023 returns empty columns. Monthly trend within 2024 is better: real data, shows seasonal patterns, directly relevant to what Altruistiq's product does.

---

### Monthly Trend — Prompt 2

> "should the api return a pivot table or a flat array"

Flat array — one row per (month, activity_type) pair. Simple, generic, reusable. The Vue component pivots it client-side using computed sets for months and types. Keeps the endpoint clean and a future chart library can consume the same shape without us changing anything.

---

### Monthly Trend — Prompt 3

> "what's the sql — is it just the reporting query with a different group by"

Exactly. Same LEFT JOIN LATERAL pattern, same narrowest-range factor resolution, same null guard. Only difference is `GROUP BY DATE_TRUNC('month', activity_date), activity_type` instead of grouping by BU. No recursive CTE needed — we're not rolling up the hierarchy here.

---

### Monthly Trend — Prompt 4

> "zero cells in the pivot — show 0 or a dash"

Dash. Zero means something was measured and came out zero. A dash means nothing was recorded that month for that activity type. Semantically different in an emissions context — showing `0` would be misleading.

---

### Monthly Trend — What I'd revisit with more time

- No chart — a stacked bar per month would make seasonal patterns immediately obvious; the flat API response is already the right shape for Chart.js or Recharts
- Date range hardcoded in frontend — should be a picker, same issue as the main report
- No column totals footer — summing each activity type across all 12 months would complete the pivot table properly
