import { Router } from "express";
import { listStatements, listStatementTransactions } from "@controllers/statementsController";

export const statementsRouter = Router();

statementsRouter.get("/", listStatements);
statementsRouter.get("/:statementId/transactions", listStatementTransactions);

