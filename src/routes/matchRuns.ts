import { Router } from "express";
import { listMatchRuns, createMatchRun, getMatchRun, deleteMatchRun } from "@controllers/matchRunsController";

export const matchRunsRouter = Router();

matchRunsRouter.get("/", listMatchRuns);
matchRunsRouter.post("/", createMatchRun);
matchRunsRouter.get("/:matchRunId", getMatchRun);
matchRunsRouter.delete("/:matchRunId", deleteMatchRun);

