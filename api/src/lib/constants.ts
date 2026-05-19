export const BATCH_STATUS = {
  PENDING:   "pending",
  PROCESSED: "processed",
  FAILED:    "failed",
} as const;

export const ISSUE_STATUS = {
  REJECTED:  "rejected",
  CORRECTED: "corrected",
} as const;

export const REASON_CODE = {
  UNKNOWN_BUSINESS_UNIT:   "unknown_business_unit",
  NEGATIVE_QUANTITY:       "negative_quantity",
  MISSING_EMISSION_FACTOR: "missing_emission_factor",
  UNIT_MISMATCH:           "unit_mismatch",
  UNIT_CONVERTED:          "unit_converted",
} as const;

export const EXPECTED_UNITS: Record<string, string> = {
  electricity:                     "kWh",
  diesel:                          "litres",
  natural_gas:                     "m3",
  business_travel_air:             "km",
  purchased_goods_office_supplies: "GBP",
};

export const UNIT_CONVERSIONS: Record<string, { to: string; factor: number }> = {
  MWh: { to: "kWh", factor: 1000 },
};
