import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /ingestion/issues", () => {
  it("returns 200 with expected shape", async () => {
    const app = createApp();
    const res = await request(app).get("/ingestion/issues");
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.limit).toBe("number");
    expect(typeof res.body.offset).toBe("number");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("returns items with required fields", async () => {
    const app = createApp();
    const res = await request(app).get("/ingestion/issues");
    if (res.body.items.length > 0) {
      const item = res.body.items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("reason_code");
      expect(item).toHaveProperty("reason_detail");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("raw_row");
      expect(["rejected", "corrected"]).toContain(item.status);
    }
  });

  it("respects limit param", async () => {
    const app = createApp();
    const res = await request(app).get("/ingestion/issues").query({ limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(2);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
  });

  it("clamps limit to 500", async () => {
    const app = createApp();
    const res = await request(app).get("/ingestion/issues").query({ limit: 9999 });
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(500);
  });

  it("respects offset param", async () => {
    const app = createApp();
    const full   = await request(app).get("/ingestion/issues").query({ limit: 100, offset: 0 });
    const offset = await request(app).get("/ingestion/issues").query({ limit: 100, offset: 1 });
    expect(full.body.total).toBe(offset.body.total);
    if (full.body.items.length > 1) {
      expect(offset.body.items[0].id).toBe(full.body.items[1].id);
    }
  });

  it("returns 400 for negative offset", async () => {
    const app = createApp();
    const res = await request(app).get("/ingestion/issues").query({ offset: -1 });
    expect(res.status).toBe(400);
  });

  it("raw_row contains original CSV fields", async () => {
    const app = createApp();
    const res = await request(app).get("/ingestion/issues");
    if (res.body.items.length > 0) {
      // raw_row may be returned as a JSONB string or parsed object depending on driver version
      const rawRaw = res.body.items[0].raw_row;
      const raw = typeof rawRaw === "string" ? JSON.parse(rawRaw) : rawRaw;
      expect(raw).toHaveProperty("business_unit_id");
      expect(raw).toHaveProperty("activity_type");
      expect(raw).toHaveProperty("quantity");
      expect(raw).toHaveProperty("unit");
    }
  });
});
