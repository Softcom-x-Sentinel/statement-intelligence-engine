"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMatchRun = createMatchRun;
exports.getMatchRun = getMatchRun;
const matchRunsService_1 = require("@services/matchRunsService");
const matchRunsService = new matchRunsService_1.MatchRunsService();
async function createMatchRun(req, res) {
    try {
        const { statementIds, config } = req.body ?? {};
        if (!Array.isArray(statementIds) || statementIds.length === 0) {
            return res.status(400).json({ error: "statementIds must be a non-empty array" });
        }
        const matchRun = await matchRunsService.createMatchRun(statementIds, config);
        return res.status(202).json({ matchRunId: matchRun.id, status: matchRun.status });
    }
    catch (err) {
        return res.status(500).json({ error: "Failed to create match run", details: err?.message });
    }
}
async function getMatchRun(req, res) {
    try {
        const { matchRunId } = req.params;
        const result = await matchRunsService.getMatchRun(matchRunId);
        if (!result) {
            return res.status(404).json({ error: "Match run not found" });
        }
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: "Failed to get match run", details: err?.message });
    }
}
