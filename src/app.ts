import express from "express";
import { json } from "express";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { logger } from "@utils/logger";
import { uploadsRouter } from "@routes/uploads";
import { uploadsStatusRouter } from "@routes/uploadsStatus";
import { statementsRouter } from "@routes/statements";
import { matchRunsRouter } from "@routes/matchRuns";

export const createApp = () => {
  const app = express();

  app.use(json({ limit: "10mb" }));
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

