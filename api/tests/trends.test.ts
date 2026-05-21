import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /reports/monthly-trend", () => {
  it("returns a flat array", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/reports/monthly-trend")
      .query({ from: "2024-01-01", to: "2025-01-01" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("each row has month, activity_type, total_kg_co2e", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/reports/monthly-trend")
      .query({ from: "2024-01-01", to: "2025-01-01" });
    expect(res.body.length).toBeGreaterThan(0);
    for (const row of res.body) {
      expect(row).toHaveProperty("month");
      expect(row).toHaveProperty("activity_type");
      expect(row).toHaveProperty("total_kg_co2e");
      // month format YYYY-MM
      expect(row.month).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("months are within the requested range", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/reports/monthly-trend")
      .query({ from: "2024-01-01", to: "2025-01-01" });
    for (const row of res.body) {
      expect(row.month >= "2024-01").toBe(true);
      expect(row.month <  "2025-01").toBe(true);
    }
  });

  it("all totals are positive numbers", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/reports/monthly-trend")
      .query({ from: "2024-01-01", to: "2025-01-01" });
    for (const row of res.body) {
      expect(Number(row.total_kg_co2e)).toBeGreaterThan(0);
    }
  });

  it("returns empty array for out-of-range dates", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/reports/monthly-trend")
      .query({ from: "2000-01-01", to: "2000-12-31" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("uses defaults when no query params given", async () => {
    const app = createApp();
    const res = await request(app).get("/reports/monthly-trend");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
