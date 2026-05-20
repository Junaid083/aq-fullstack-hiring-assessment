import { Router } from "express";
import { sql } from "../db.js";

export const issuesRouter = Router();

issuesRouter.get("/ingestion/issues", async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
    res.status(400).json({ error: "invalid limit or offset" });
    return;
  }

  try {
    const countResult = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM ingestion_issues
    `;
    const count = countResult[0]?.count ?? "0";

    const items = await sql<{
      id:              string;
      upload_batch_id: string;
      raw_row:         Record<string, string>;
      reason_code:     string;
      reason_detail:   string;
      status:          string;
      created_at:      string;
    }[]>`
      SELECT id, upload_batch_id, raw_row, reason_code, reason_detail, status, created_at
      FROM ingestion_issues
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    `;

    res.json({ total: Number(count), limit, offset, items });

  } catch (err) {
    console.error("issues error:", err);
    res.status(500).json({ error: "failed to fetch issues" });
  }
});
