"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchRunsService = void 0;
const pool_1 = require("@db/pool");
const queues_1 = require("@jobs/queues");
const logger_1 = require("@utils/logger");
const DEFAULT_MATCH_RUN_CONFIG = {
    relationshipTypes: [],
    dateWindowDays: 5,
    amountToleranceAbsolute: 0.01,
    amountToleranceRelative: 0.005,
    batchSize: 50,
    enableTextFilter: true
};
class MatchRunsService {
    async listMatchRuns(pagination) {
        const { limit, offset } = pagination;
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`SELECT m.id, m.statement_ids, m.config, m.status, m.error,
                m.claude_model, m.prompt_version, m.created_at, m.updated_at,
                COUNT(r.id)::int AS relationship_count
         FROM match_runs m
         LEFT JOIN relationships r ON r.match_run_id = m.id
         GROUP BY m.id
         ORDER BY m.created_at DESC
         LIMIT $1 OFFSET $2`, [limit, offset]);
            const { rows: countRows } = await client.query(`SELECT COUNT(*)::int AS total FROM match_runs`);
            return {
                matchRuns: rows,
                total: countRows[0]?.total ?? 0
            };
        });
        return {
            matchRuns: result.matchRuns,
            pagination: {
                total: result.total,
                limit,
                offset
            }
        };
    }
    async createMatchRun(statementIds, config) {
        const normalizedConfig = {
            relationshipTypes: config?.relationshipTypes ?? DEFAULT_MATCH_RUN_CONFIG.relationshipTypes,
            dateWindowDays: config?.dateWindowDays ?? DEFAULT_MATCH_RUN_CONFIG.dateWindowDays,
            amountToleranceAbsolute: config?.amountToleranceAbsolute ?? DEFAULT_MATCH_RUN_CONFIG.amountToleranceAbsolute,
            amountToleranceRelative: config?.amountToleranceRelative ?? DEFAULT_MATCH_RUN_CONFIG.amountToleranceRelative,
            batchSize: config?.batchSize ?? DEFAULT_MATCH_RUN_CONFIG.batchSize,
            enableTextFilter: config?.enableTextFilter ?? DEFAULT_MATCH_RUN_CONFIG.enableTextFilter
        };
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`INSERT INTO match_runs (statement_ids, config, status, created_at, updated_at)
         VALUES ($1, $2, 'pending', now(), now())
         RETURNING id, status`, [statementIds, normalizedConfig]);
            return rows[0];
        });
        const matchRunId = result.id;
        await queues_1.runMatchQueue.add("run-match", { matchRunId });
        logger_1.logger.info({ matchRunId, statementIds }, "Enqueued run-match job");
        return {
            id: matchRunId,
            status: result.status
        };
    }
    async getMatchRun(matchRunId) {
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`SELECT id, status, error, claude_model, prompt_version, created_at, updated_at
         FROM match_runs
         WHERE id = $1`, [matchRunId]);
            if (rows.length === 0)
                return null;
            const matchRun = rows[0];
            const { rows: relationshipRows } = await client.query(`SELECT id, tx_a_id, tx_b_id, relationship_type, confidence, reason
         FROM relationships
         WHERE match_run_id = $1`, [matchRunId]);
            return { matchRun, relationships: relationshipRows };
        });
        return result;
    }
    async deleteMatchRun(matchRunId) {
        const client = await pool_1.pool.connect();
        try {
            await client.query("BEGIN");
            const { rows } = await client.query(`SELECT id FROM match_runs WHERE id = $1`, [matchRunId]);
            if (rows.length === 0) {
                await client.query("ROLLBACK");
                return null;
            }
            await client.query(`DELETE FROM relationships WHERE match_run_id = $1`, [matchRunId]);
            await client.query(`DELETE FROM match_runs WHERE id = $1`, [matchRunId]);
            await client.query("COMMIT");
            logger_1.logger.info({ matchRunId }, "Deleted match run and associated relationships");
            return { deleted: true };
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
}
exports.MatchRunsService = MatchRunsService;
