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
