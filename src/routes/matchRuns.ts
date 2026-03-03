import { Router } from "express";
import { createMatchRun, getMatchRun } from "@controllers/matchRunsController";

export const matchRunsRouter = Router();

matchRunsRouter.post("/", createMatchRun);
matchRunsRouter.get("/:matchRunId", getMatchRun);

