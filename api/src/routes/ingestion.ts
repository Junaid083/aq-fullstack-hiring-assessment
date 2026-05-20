import { Router } from "express";
import { ingestChunk } from "../lib/ingest.js";

export const ingestionRouter = Router();

// POST /ingestion/upload
// Body: { filename, content, batchId?, fileHash? }
// First chunk: send fileHash (SHA-256 of full file), no batchId
// Subsequent chunks: send batchId from first response, no fileHash
ingestionRouter.post("/ingestion/upload", async (req, res) => {
  const { filename, content, batchId, fileHash } = req.body as {
    filename:  string;
    content:   string;
    batchId?:  string;
    fileHash?: string;
  };

  if (!filename || !content) {
    res.status(400).json({ error: "filename and content are required" });
    return;
  }

  try {
    const result = await ingestChunk({ filename, content, batchId, fileHash });
    res.json(result);
  } catch (err) {
    console.error("ingestion error:", err);
    res.status(500).json({ error: "ingestion failed" });
  }
});
