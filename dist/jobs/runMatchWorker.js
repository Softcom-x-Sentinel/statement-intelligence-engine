"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMatchWorker = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("@config/env");
const logger_1 = require("@utils/logger");
const pool_1 = require("@db/pool");
const candidateGenerator_1 = require("@matching/candidateGenerator");
const ClaudeRelationshipEngine_1 = require("@llm/ClaudeRelationshipEngine");
const relationshipPersister_1 = require("@matching/relationshipPersister");
const metrics_1 = require("@utils/metrics");
const processJob = async (job) => {
    const { matchRunId } = job.data;
    const start = Date.now();
    logger_1.logger.info({ matchRunId, jobId: job.id }, "Starting run-match job");
    await (0, pool_1.withClient)(async (client) => {
        const { rows } = await client.query(`SELECT id, statement_ids, config, status
       FROM match_runs
       WHERE id = $1`, [matchRunId]);
        if (rows.length === 0) {
            throw new Error(`Match run not found for id ${matchRunId}`);
        }
        const matchRun = rows[0];
        await client.query(`UPDATE match_runs
       SET status = 'running', updated_at = now()
       WHERE id = $1`, [matchRunId]);
        const statementIds = matchRun.statement_ids ?? [];
        if (statementIds.length === 0) {
            throw new Error("Match run has no statement_ids");
        }
        const { rows: txRows } = await client.query(`SELECT id, statement_id, posted_at, amount, currency, description_norm
       FROM transactions
       WHERE statement_id = ANY($1::uuid[])
       ORDER BY posted_at ASC`, [statementIds]);
        const transactions = txRows.map((row) => ({
            id: row.id,
            statementId: row.statement_id,
            postedAt: new Date(row.posted_at),
            amount: Number(row.amount),
            currency: row.currency,
            descriptionNorm: row.description_norm ?? ""
        }));
        const candidateConfig = {
            dateWindowDays: matchRun.config?.dateWindowDays,
            amountToleranceAbsolute: matchRun.config?.amountToleranceAbsolute,
            amountToleranceRelative: matchRun.config?.amountToleranceRelative,
            maxPairsPerRun: matchRun.config?.maxPairsPerRun,
            enableTextFilter: matchRun.config?.enableTextFilter
        };
        const candidates = (0, candidateGenerator_1.generateCandidatePairs)(transactions, candidateConfig);
        logger_1.logger.info({ matchRunId, candidateCount: candidates.length }, "Generated candidate pairs for match run");
        const pairIndex = (0, relationshipPersister_1.buildPairIndex)(candidates.map((c) => ({ pairId: c.pairId, txAId: c.txAId, txBId: c.txBId })));
        const batchSize = matchRun.config?.batchSize ?? 50;
        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);
            const results = await ClaudeRelationshipEngine_1.claudeRelationshipEngine.matchPairs(batch, {
                model: env_1.env.claudeModel,
                promptVersion: env_1.env.claudePromptVersion,
                minConfidence: matchRun.config?.minConfidence ?? 0.7,
                maxRetries: 2
            });
            await (0, relationshipPersister_1.persistClaudeResults)(matchRunId, results, pairIndex);
        }
        await client.query(`UPDATE match_runs
       SET status = 'completed',
           claude_model = $1,
           prompt_version = $2,
           updated_at = now()
       WHERE id = $3`, [env_1.env.claudeModel, env_1.env.claudePromptVersion, matchRunId]);
        const durationMs = Date.now() - start;
        (0, metrics_1.recordDuration)("run_match_duration_ms", durationMs, { matchRunId });
        (0, metrics_1.incrementCounter)("run_match_success_total");
        logger_1.logger.info({ matchRunId, durationMs }, "Completed run-match job");
    });
};
exports.runMatchWorker = new bullmq_1.Worker("run-match", processJob, {
    connection: new ioredis_1.default(env_1.env.redisUrl, { maxRetriesPerRequest: null })
});
