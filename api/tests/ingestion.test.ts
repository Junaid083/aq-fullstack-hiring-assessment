import { describe, it, expect } from "vitest";
import request from "supertest";
import { createHash } from "crypto";
import { createApp } from "../src/app.js";

const CSV_HEADER = "business_unit_id,activity_type,quantity,unit,activity_date,source_ref\n";

function makeChunk(rows: string[]): string {
  return CSV_HEADER + rows.join("\n");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("POST /ingestion/upload", () => {
  it("returns 400 when filename is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/ingestion/upload")
      .send({ content: "header,row" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/ingestion/upload")
      .send({ filename: "test.csv" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid single-chunk upload and returns accepted/rejected counts", async () => {
    const app = createApp();
    // Use a unique filename to avoid idempotency collision across test runs
    const run = Date.now();
    const row = `bu-1,electricity,100,kWh,2024-06-01,INV-TEST-${run}`;
    const content = makeChunk([row]);
    const fileHash = sha256(content);

    const res = await request(app)
      .post("/ingestion/upload")
      .send({ filename: `test-${run}.csv`, content, fileHash });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("batchId");
    expect(typeof res.body.totalAccepted).toBe("number");
    expect(typeof res.body.totalRejected).toBe("number");
    expect(res.body.totalAccepted).toBeGreaterThanOrEqual(1);
  });

  it("rejects a row with an unknown business_unit_id", async () => {
    const app = createApp();
    const run = Date.now();
    const row = `bu-999,electricity,100,kWh,2024-06-01,INV-BADBU-${run}`;
    const content = makeChunk([row]);
    const fileHash = sha256(content);

    const res = await request(app)
      .post("/ingestion/upload")
      .send({ filename: `bad-bu-${run}.csv`, content, fileHash });

    expect(res.status).toBe(200);
    expect(res.body.chunkRejected).toBeGreaterThanOrEqual(1);
    expect(res.body.chunkAccepted).toBe(0);
  });

  it("is idempotent — same file hash returns skipped:true", async () => {
    const app = createApp();
    const run = Date.now();
    const row = `bu-1,diesel,50,litres,2024-07-01,INV-IDEM-${run}`;
    const content = makeChunk([row]);
    const fileHash = sha256(content);
    const filename = `idem-${run}.csv`;

    const first  = await request(app).post("/ingestion/upload").send({ filename, content, fileHash });
    const second = await request(app).post("/ingestion/upload").send({ filename, content, fileHash });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.skipped).toBe(true);
    expect(second.body.batchId).toBe(first.body.batchId);
  });
});
