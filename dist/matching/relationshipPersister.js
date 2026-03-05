"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistClaudeResults = exports.buildPairIndex = void 0;
const pool_1 = require("../db/pool");
const buildPairIndex = (pairs) => {
    const index = new Map();
    for (const p of pairs) {
        index.set(p.pairId, { txAId: p.txAId, txBId: p.txBId });
    }
    return index;
};
exports.buildPairIndex = buildPairIndex;
const persistClaudeResults = async (matchRunId, results, pairIndex) => {
    if (results.length === 0)
        return;
    await (0, pool_1.withClient)(async (client) => {
        for (const r of results) {
            const mapping = pairIndex.get(r.pairId);
            if (!mapping)
                continue;
            await client.query(`INSERT INTO relationships
         (match_run_id, tx_a_id, tx_b_id, relationship_type, confidence, reason, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`, [
                matchRunId,
                mapping.txAId,
                mapping.txBId,
                r.relationshipType,
                r.confidence,
                r.reason
            ]);
        }
    });
};
exports.persistClaudeResults = persistClaudeResults;
