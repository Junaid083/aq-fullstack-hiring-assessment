import express, { type Express } from "express";
import { healthRouter } from "./routes/health.js";
import { ingestionRouter } from "./routes/ingestion.js";
import { reportsRouter } from "./routes/reports.js";
import { issuesRouter } from "./routes/issues.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(healthRouter);
  app.use(ingestionRouter);
  app.use(reportsRouter);
  app.use(issuesRouter);
  return app;
}
