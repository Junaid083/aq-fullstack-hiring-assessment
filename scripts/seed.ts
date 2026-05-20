import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { parse } from "csv-parse/sync";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env"), quiet: true });

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

function readCsv<T>(filename: string): T[] {
  const content = readFileSync(join(__dirname, "..", "seed", filename), "utf8");
  return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

async function seedBusinessUnits() {
  const rows = readCsv<{ id: string; name: string; parent_id: string; region: string }>(
    "business_units.csv"
  );

  // Insert root nodes first (no parent), then children — avoids FK violation
  const roots    = rows.filter((r) => !r.parent_id);
  const children = rows.filter((r) => !!r.parent_id);

  for (const row of [...roots, ...children]) {
    await sql`
      INSERT INTO business_units (id, name, parent_id, region, depth)
      VALUES (
        ${row.id},
        ${row.name},
        ${row.parent_id || null},
        ${row.region},
        ${row.parent_id ? (roots.find((r) => r.id === row.parent_id) ? 1 : 2) : 0}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  console.log(`seeded ${rows.length} business units`);
}

async function seedEmissionFactors() {
  const rows = readCsv<{
    activity_type:    string;
    region:           string;
    valid_from:       string;
    valid_to:         string;
    kg_co2e_per_unit: string;
    unit:             string;
    source:           string;
  }>("emission_factors.csv");

  for (const row of rows) {
    await sql`
      INSERT INTO emission_factors
        (activity_type, region, valid_from, valid_to, kg_co2e_per_unit, unit, source)
      VALUES (
        ${row.activity_type}, ${row.region},
        ${row.valid_from}::date, ${row.valid_to}::date,
        ${row.kg_co2e_per_unit}, ${row.unit}, ${row.source}
      )
      ON CONFLICT (activity_type, region, valid_from, valid_to) DO NOTHING
    `;
  }

  console.log(`seeded ${rows.length} emission factors`);
}

async function seedActivities() {
  const { ingestActivitiesCsv } = await import("../api/src/lib/ingest.js");
  const content = readFileSync(join(__dirname, "..", "seed", "activities.csv"), "utf8");
  const result  = await ingestActivitiesCsv("activities.csv", content);

  if (result.skipped) {
    console.log(`activities already seeded (batch ${result.batchId}) — skipped`);
  } else {
    console.log(`seeded activities — accepted: ${result.accepted}, rejected: ${result.rejected}`);
  }
}

async function run() {
  await seedBusinessUnits();
  await seedEmissionFactors();
  await seedActivities();
}

try {
  await run();
} catch (err) {
  console.error("seed failed:", err);
  process.exitCode = 1;
} finally {
  const { sql: apiSql } = await import("../api/src/db.js");
  await apiSql.end({ timeout: 5 });
  await sql.end({ timeout: 5 });
}
