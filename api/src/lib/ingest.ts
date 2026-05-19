import { sql } from "../db.js";
import { sha256 } from "./hash.js";
import { parseCsv } from "./csv.js";
import { validateRows, type RawRow } from "./validate.js";
import { BATCH_STATUS, ISSUE_STATUS } from "./constants.js";

export type ChunkResult = {
  batchId:       string;
  chunkAccepted: number;
  chunkRejected: number;
  totalAccepted: number;
  totalRejected: number;
  skipped:       boolean;
};

export type IngestResult = {
  batchId:  string;
  accepted: number;
  rejected: number;
  skipped:  boolean;
};

// Core chunked ingestion — processes one chunk of CSV rows
// First chunk: pass fileHash for idempotency check, no batchId yet
// Subsequent chunks: pass batchId from first chunk response, no fileHash
export async function ingestChunk(params: {
  filename:  string;
  content:   string;
  batchId?:  string;
  fileHash?: string;
}): Promise<ChunkResult> {
  const { filename, content, fileHash } = params;
  let { batchId } = params;

  // Idempotency check on first chunk via full-file hash
  if (fileHash && !batchId) {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM upload_batches WHERE file_hash = ${fileHash}
    `;
    if (existing.length > 0) {
      batchId = existing[0]!.id;
      const totals = await sql<{ accepted: string; rejected: string }[]>`
        SELECT
          COALESCE(accepted_count, 0) AS accepted,
          COALESCE(rejected_count, 0) AS rejected
        FROM upload_batches WHERE id = ${batchId}
      `;
      return {
        batchId,
        chunkAccepted: 0,
        chunkRejected: 0,
        totalAccepted: Number(totals[0]?.accepted ?? 0),
        totalRejected: Number(totals[0]?.rejected ?? 0),
        skipped:       true,
      };
    }
  }

  // Create batch on first chunk
  if (!batchId) {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO upload_batches (filename, file_hash, status)
      VALUES (${filename}, ${fileHash ?? sha256(content)}, ${BATCH_STATUS.PENDING})
      RETURNING id
    `;
    batchId = rows[0]!.id;
  }

  try {
    let chunkAccepted = 0;
    let chunkRejected = 0;

    await sql.begin(async (tx) => {
      const rows   = parseCsv<RawRow>(content);
      const result = await validateRows(rows);

      // Batch insert valid activities — postgres.js row helper generates
      // a single multi-row INSERT instead of one query per row
      if (result.valid.length > 0) {
        const activityRows = result.valid.map((r) => ({
          business_unit_id: r.business_unit_id,
          region:           r.region,
          activity_type:    r.activity_type,
          quantity:         r.quantity,
          unit:             r.unit,
          activity_date:    r.activity_date,
          source_ref:       r.source_ref ?? null,
          upload_batch_id:  batchId!,
        }));
        await tx`INSERT INTO activities ${tx(activityRows)}`;
      }

      // Insert issues one by one (low volume — only bad rows)
      for (const issue of result.issues) {
        await tx`
          INSERT INTO ingestion_issues
            (upload_batch_id, raw_row, reason_code, reason_detail, status)
          VALUES
            (${batchId!}, ${JSON.stringify(issue.raw_row)},
             ${issue.reason_code}, ${issue.reason_detail}, ${issue.status})
        `;
      }

      chunkAccepted = result.valid.length;
      chunkRejected = result.issues.filter((i) => i.status === ISSUE_STATUS.REJECTED).length;

      // Accumulate running totals on batch record
      await tx`
        UPDATE upload_batches SET
          status         = ${BATCH_STATUS.PROCESSED},
          accepted_count = COALESCE(accepted_count, 0) + ${chunkAccepted},
          rejected_count = COALESCE(rejected_count, 0) + ${chunkRejected}
        WHERE id = ${batchId!}
      `;
    });

    const totals = await sql<{ accepted: string; rejected: string }[]>`
      SELECT
        COALESCE(accepted_count, 0) AS accepted,
        COALESCE(rejected_count, 0) AS rejected
      FROM upload_batches WHERE id = ${batchId}
    `;

    return {
      batchId,
      chunkAccepted,
      chunkRejected,
      totalAccepted: Number(totals[0]?.accepted ?? 0),
      totalRejected: Number(totals[0]?.rejected ?? 0),
      skipped:       false,
    };
  } catch (err) {
    await sql`
      UPDATE upload_batches
      SET status = ${BATCH_STATUS.FAILED}, error_message = ${String(err)}
      WHERE id = ${batchId}
    `;
    throw err;
  }
}

// Kept for seed script — wraps ingestChunk for single-file ingestion
export async function ingestActivitiesCsv(
  filename: string,
  content:  string
): Promise<IngestResult> {
  const fileHash = sha256(content);
  const result   = await ingestChunk({ filename, content, fileHash });
  return {
    batchId:  result.batchId,
    accepted: result.totalAccepted,
    rejected: result.totalRejected,
    skipped:  result.skipped,
  };
}
