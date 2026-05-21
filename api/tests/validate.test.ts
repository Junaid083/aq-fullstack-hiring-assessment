import { describe, it, expect } from "vitest";
import { validateRowsSync } from "../src/lib/validate.js";
import { REASON_CODE, ISSUE_STATUS } from "../src/lib/constants.js";

const buMap = new Map([
  ["bu-1", "EMEA"],
  ["bu-2", "UK"],
]);

const validTypes = new Set(["electricity", "diesel", "natural_gas", "business_travel_air"]);

function row(overrides: Record<string, string> = {}) {
  return {
    business_unit_id: "bu-1",
    activity_type:    "electricity",
    quantity:         "100",
    unit:             "kWh",
    activity_date:    "2024-06-01",
    source_ref:       "INV-001",
    ...overrides,
  };
}

describe("validateRowsSync", () => {
  it("accepts a valid row", () => {
    const { valid, issues } = validateRowsSync([row()], buMap, validTypes);
    expect(valid).toHaveLength(1);
    expect(issues).toHaveLength(0);
    expect(valid[0].region).toBe("EMEA");
    expect(valid[0].quantity).toBe(100);
  });

  it("rejects unknown business_unit_id", () => {
    const { valid, issues } = validateRowsSync([row({ business_unit_id: "bu-99" })], buMap, validTypes);
    expect(valid).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason_code).toBe(REASON_CODE.UNKNOWN_BUSINESS_UNIT);
    expect(issues[0].status).toBe(ISSUE_STATUS.REJECTED);
  });

  it("rejects negative quantity", () => {
    const { valid, issues } = validateRowsSync([row({ quantity: "-5" })], buMap, validTypes);
    expect(valid).toHaveLength(0);
    expect(issues[0].reason_code).toBe(REASON_CODE.NEGATIVE_QUANTITY);
  });

  it("rejects NaN quantity", () => {
    const { valid, issues } = validateRowsSync([row({ quantity: "abc" })], buMap, validTypes);
    expect(valid).toHaveLength(0);
    expect(issues[0].reason_code).toBe(REASON_CODE.NEGATIVE_QUANTITY);
  });

  it("accepts zero quantity", () => {
    const { valid } = validateRowsSync([row({ quantity: "0" })], buMap, validTypes);
    expect(valid).toHaveLength(1);
    expect(valid[0].quantity).toBe(0);
  });

  it("rejects unknown activity type", () => {
    const { valid, issues } = validateRowsSync([row({ activity_type: "rocket_fuel" })], buMap, validTypes);
    expect(valid).toHaveLength(0);
    expect(issues[0].reason_code).toBe(REASON_CODE.MISSING_EMISSION_FACTOR);
  });

  it("rejects unit mismatch with no known conversion", () => {
    // electricity expects kWh — litres has no conversion path to kWh
    const { valid, issues } = validateRowsSync([row({ unit: "litres" })], buMap, validTypes);
    expect(valid).toHaveLength(0);
    expect(issues[0].reason_code).toBe(REASON_CODE.UNIT_MISMATCH);
    expect(issues[0].status).toBe(ISSUE_STATUS.REJECTED);
  });

  it("flags MWh as corrected and excludes from valid rows", () => {
    const { valid, issues } = validateRowsSync([row({ unit: "MWh" })], buMap, validTypes);
    expect(valid).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason_code).toBe(REASON_CODE.UNIT_CONVERTED);
    expect(issues[0].status).toBe(ISSUE_STATUS.CORRECTED);
  });

  it("preserves raw_row verbatim on issues", () => {
    const r = row({ business_unit_id: "bu-99" });
    const { issues } = validateRowsSync([r], buMap, validTypes);
    expect(issues[0].raw_row).toEqual(r);
  });

  it("handles mixed batch — valid and invalid rows", () => {
    const rows = [
      row(),
      row({ business_unit_id: "bu-99" }),
      row({ quantity: "-1" }),
      row({ business_unit_id: "bu-2" }),
    ];
    const { valid, issues } = validateRowsSync(rows, buMap, validTypes);
    expect(valid).toHaveLength(2);
    expect(issues).toHaveLength(2);
  });

  it("validates checks in order — unknown BU is caught before negative qty", () => {
    const { issues } = validateRowsSync(
      [row({ business_unit_id: "bu-99", quantity: "-1" })],
      buMap,
      validTypes,
    );
    expect(issues[0].reason_code).toBe(REASON_CODE.UNKNOWN_BUSINESS_UNIT);
  });
});
