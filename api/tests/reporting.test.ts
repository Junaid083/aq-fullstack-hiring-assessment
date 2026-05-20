import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import expected from "../../tests/fixtures/expected_totals.json" with { type: "json" };

describe("GET /reports/totals", () => {
  it("returns 400 when query params are missing", async () => {
    const app = createApp();
    const res = await request(app).get("/reports/totals");
    expect(res.status).toBe(400);
  });

  it("matches expected totals within 0.5%", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/reports/totals")
      .query({ from: expected.range.from, to: expected.range.to });

    expect(res.status).toBe(200);
    expect(res.body.org).toBe("acme");

    const tol = expected.tolerance_pct / 100;

    for (const exp of expected.by_business_unit) {
      const actual = (res.body.by_business_unit as typeof expected.by_business_unit).find(
        (b) => b.business_unit_id === exp.business_unit_id
      );
      expect(actual, `missing ${exp.business_unit_id}`).toBeDefined();
      const diff = Math.abs(actual!.total_kg_co2e - exp.total_kg_co2e) / exp.total_kg_co2e;
      expect(diff, `${exp.name} off by ${(diff * 100).toFixed(2)}%`).toBeLessThanOrEqual(tol);
    }

    for (const exp of expected.by_activity_type) {
      const actual = (res.body.by_activity_type as typeof expected.by_activity_type).find(
        (a) => a.activity_type === exp.activity_type
      );
      expect(actual, `missing ${exp.activity_type}`).toBeDefined();
      const diff = Math.abs(actual!.total_kg_co2e - exp.total_kg_co2e) / exp.total_kg_co2e;
      expect(diff, `${exp.activity_type} off by ${(diff * 100).toFixed(2)}%`).toBeLessThanOrEqual(tol);
    }
  });
});
