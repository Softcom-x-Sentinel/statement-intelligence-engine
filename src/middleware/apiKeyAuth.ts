import { Request, Response, NextFunction } from "express";
import { env } from "@config/env";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  if (env.apiKeys.length === 0) {
    return next();
  }

  const headerKey = req.header("X-API-Key");
  if (!headerKey || !env.apiKeys.includes(headerKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

