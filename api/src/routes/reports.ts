import { Router } from "express";
import { sql } from "../db.js";

export const reportsRouter = Router();

reportsRouter.get("/reports/totals", async (req, res) => {
  const from = req.query.from as string;
  const to   = req.query.to   as string;

  if (!from || !to) {
    res.status(400).json({ error: "from and to query params are required (YYYY-MM-DD)" });
    return;
  }

  try {
    const byBu = await sql<{
      business_unit_id: string;
      name:             string;
      total_kg_co2e:    number;
      is_rollup:        boolean;
    }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id AS root_id, id AS node_id FROM business_units
        UNION ALL
        SELECT d.root_id, bu.id
        FROM descendants d
        JOIN business_units bu ON bu.parent_id = d.node_id
      ),
      activity_emissions AS (
        SELECT
          a.business_unit_id,
          a.quantity * ef.kg_co2e_per_unit AS kg_co2e
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
      ),
      bu_totals AS (
        SELECT
          d.root_id          AS business_unit_id,
          SUM(ae.kg_co2e)    AS total_kg_co2e
        FROM descendants d
        JOIN activity_emissions ae ON ae.business_unit_id = d.node_id
        GROUP BY d.root_id
      )
      SELECT
        bu.id                                              AS business_unit_id,
        bu.name,
        ROUND(COALESCE(bt.total_kg_co2e, 0)::numeric, 2)  AS total_kg_co2e,
        EXISTS (
          SELECT 1 FROM business_units c WHERE c.parent_id = bu.id
        )                                                  AS is_rollup
      FROM business_units bu
      LEFT JOIN bu_totals bt ON bt.business_unit_id = bu.id
      ORDER BY bu.id
    `;

    const byActivity = await sql<{
      activity_type:  string;
      total_kg_co2e:  number;
    }[]>`
      SELECT
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
      GROUP BY a.activity_type
      ORDER BY total_kg_co2e DESC
    `;

    res.json({
      org:              "acme",
      range:            { from, to },
      by_business_unit: byBu,
      by_activity_type: byActivity,
    });
  } catch (err) {
    console.error("reports error:", err);
    res.status(500).json({ error: "failed to generate report" });
  }
});
