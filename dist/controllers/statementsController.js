"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStatements = listStatements;
exports.listStatementTransactions = listStatementTransactions;
const statementsService_1 = require("@services/statementsService");
const statementsService = new statementsService_1.StatementsService();
async function listStatements(req, res) {
    try {
        const { statements, pagination } = await statementsService.listStatements({
            limit: Number(req.query.limit ?? 100),
            offset: Number(req.query.offset ?? 0)
        });
        return res.json({ statements, pagination });
    }
    catch (err) {
        return res.status(500).json({ error: "Failed to list statements", details: err?.message });
    }
}
async function listStatementTransactions(req, res) {
    const { statementId } = req.params;
    try {
        const { transactions, pagination } = await statementsService.listTransactions(statementId, {
            limit: Number(req.query.limit ?? 100),
            offset: Number(req.query.offset ?? 0)
        });
        return res.json({ transactions, pagination });
    }
    catch (err) {
        return res.status(500).json({ error: "Failed to list transactions", details: err?.message });
    }
}
