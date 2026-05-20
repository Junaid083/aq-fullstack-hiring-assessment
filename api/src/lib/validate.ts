import { sql } from "../db.js";
import {
  EXPECTED_UNITS,
  UNIT_CONVERSIONS,
  ISSUE_STATUS,
  REASON_CODE,
} from "./constants.js";

export type RawRow = {
  business_unit_id: string;
  activity_type:    string;
  quantity:         string;
  unit:             string;
  activity_date:    string;
  source_ref:       string;
};

export type ValidRow = {
  business_unit_id: string;
  region:           string;
  activity_type:    string;
  quantity:         number;
  unit:             string;
  activity_date:    string;
  source_ref:       string;
};

export type IssueRow = {
  raw_row:       RawRow;
  reason_code:   string;
  reason_detail: string;
  status:        "rejected" | "corrected";
};

export async function validateRows(rows: RawRow[]): Promise<{
  valid:  ValidRow[];
  issues: IssueRow[];
}> {
  const buRows = await sql<{ id: string; region: string }[]>`
    SELECT id, region FROM business_units
  `;
  const buMap = new Map(buRows.map((r) => [r.id, r.region]));

  const factorRows = await sql<{ activity_type: string }[]>`
    SELECT DISTINCT activity_type FROM emission_factors
  `;
  const validActivityTypes = new Set(factorRows.map((r) => r.activity_type));

  const valid:  ValidRow[] = [];
  const issues: IssueRow[] = [];

  for (const row of rows) {
    // 1. Unknown business unit
    const region = buMap.get(row.business_unit_id);
    if (!region) {
      issues.push({
        raw_row:       row,
        reason_code:   REASON_CODE.UNKNOWN_BUSINESS_UNIT,
        reason_detail: `${row.business_unit_id} not found in business_units`,
        status:        ISSUE_STATUS.REJECTED,
      });
      continue;
    }

    // 2. Negative or invalid quantity
    const qty = Number(row.quantity);
    if (isNaN(qty) || qty < 0) {
      issues.push({
        raw_row:       row,
        reason_code:   REASON_CODE.NEGATIVE_QUANTITY,
        reason_detail: `quantity ${row.quantity} must be >= 0`,
        status:        ISSUE_STATUS.REJECTED,
      });
      continue;
    }

    // 3. No emission factor for this activity type
    if (!validActivityTypes.has(row.activity_type)) {
      issues.push({
        raw_row:       row,
        reason_code:   REASON_CODE.MISSING_EMISSION_FACTOR,
        reason_detail: `no emission factor found for activity type: ${row.activity_type}`,
        status:        ISSUE_STATUS.REJECTED,
      });
      continue;
    }

    // 4. Unit mismatch — try conversion first, reject if not recoverable
    const expectedUnit = EXPECTED_UNITS[row.activity_type];
    let finalQty  = qty;
    let finalUnit = row.unit;

    if (expectedUnit && row.unit !== expectedUnit) {
      const conversion = UNIT_CONVERSIONS[row.unit];
      if (conversion && conversion.to === expectedUnit) {
        finalQty  = qty * conversion.factor;
        finalUnit = conversion.to;
        issues.push({
          raw_row:       row,
          reason_code:   REASON_CODE.UNIT_CONVERTED,
          reason_detail: `${row.unit} converted to ${conversion.to} (×${conversion.factor}), original quantity: ${qty}`,
          status:        ISSUE_STATUS.CORRECTED,
        });
      } else {
        issues.push({
          raw_row:       row,
          reason_code:   REASON_CODE.UNIT_MISMATCH,
          reason_detail: `expected unit ${expectedUnit} for ${row.activity_type}, got ${row.unit}`,
          status:        ISSUE_STATUS.REJECTED,
        });
        continue;
      }
    }

    valid.push({
      business_unit_id: row.business_unit_id,
      region,
      activity_type:    row.activity_type,
      quantity:         finalQty,
      unit:             finalUnit,
      activity_date:    row.activity_date,
      source_ref:       row.source_ref,
    });
  }

  return { valid, issues };
}
