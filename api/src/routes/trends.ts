import { Router } from "express";
import { sql } from "../db.js";

export const trendsRouter = Router();

trendsRouter.get("/reports/monthly-trend", async (req, res) => {
  const from = (req.query.from as string) ?? "2024-01-01";
  const to   = (req.query.to   as string) ?? "2025-01-01";

  try {
    const rows = await sql<{
      month:         string;
      activity_type: string;
      total_kg_co2e: string;
    }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', a.activity_date), 'YYYY-MM') AS month,
        a.activity_type,
        ROUND(SUM(a.quantity * ef.kg_co2e_per_unit)::numeric, 2) AS total_kg_co2e
      FROM activities a
      LEFT JOIN LATERAL (
        SELECT kg_co2e_per_unit
        FROM emission_factors ef
        WHERE ef.activity_type = a.activity_type
          AND ef.region        = a.region
          AND ef.valid_from   <= a.activity_date
          AND ef.valid_to      > a.activity_date
        ORDER BY (ef.valid_to - ef.valid_from) ASC
        LIMIT 1
      ) ef ON true
      WHERE a.activity_date >= ${from}::date
        AND a.activity_date <  ${to}::date
        AND ef.kg_co2e_per_unit IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    res.json(rows);
  } catch (err) {
    console.error("trends error:", err);
    res.status(500).json({ error: "failed to generate trend" });
  }
});
