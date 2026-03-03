import { Request, Response } from "express";
import { StatementsService } from "@services/statementsService";

const statementsService = new StatementsService();

export async function listStatementTransactions(req: Request, res: Response) {
  const { statementId } = req.params;

  try {
    const { transactions, pagination } = await statementsService.listTransactions(statementId, {
      limit: Number(req.query.limit ?? 100),
      offset: Number(req.query.offset ?? 0)
    });

    return res.json({ transactions, pagination });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to list transactions", details: err?.message });
  }
}

