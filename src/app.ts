import express from "express";
import { json } from "express";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { env } from "@config/env";
import { logger } from "@utils/logger";
import { uploadsRouter } from "@routes/uploads";
import { uploadsStatusRouter } from "@routes/uploadsStatus";
import { statementsRouter } from "@routes/statements";
import { matchRunsRouter } from "@routes/matchRuns";

export const createApp = () => {
  const app = express();
  const allowedOrigins = new Set(env.corsOrigins);

  app.use(json({ limit: "10mb" }));

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;

    if (requestOrigin && allowedOrigins.has(requestOrigin)) {
      res.header("Access-Control-Allow-Origin", requestOrigin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type,X-API-Key");
    }

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return next();
  });

  // Health check (no auth required — used by Render/Docker health checks)
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(apiKeyAuth);

  // v1 routes
  app.use("/v1/statements/upload", uploadsRouter); // POST /v1/statements/upload
  app.use("/v1/uploads", uploadsStatusRouter); // GET /v1/uploads/:uploadId
  app.use("/v1/statements", statementsRouter);
  app.use("/v1/match-runs", matchRunsRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
};

