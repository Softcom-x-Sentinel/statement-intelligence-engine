import { Router } from "express";
import { listStatementTransactions } from "@controllers/statementsController";

export const statementsRouter = Router();

statementsRouter.get("/:statementId/transactions", listStatementTransactions);

