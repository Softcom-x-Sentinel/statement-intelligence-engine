import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "@config/env";
import { logger } from "@utils/logger";
import { withClient } from "@db/pool";
import { generateCandidatePairs, MatchableTransaction, CandidatePair } from "@matching/candidateGenerator";
import { claudeRelationshipEngine } from "@llm/ClaudeRelationshipEngine";
import { buildPairIndex, persistClaudeResults } from "@matching/relationshipPersister";
import { recordDuration, incrementCounter } from "@utils/metrics";

interface RunMatchJobData {
  matchRunId: string;
}

const processJob = async (job: Job<RunMatchJobData>) => {
  const { matchRunId } = job.data;
  const start = Date.now();
  logger.info({ matchRunId, jobId: job.id }, "Starting run-match job");

  await withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, statement_ids, config, status
       FROM match_runs
       WHERE id = $1`,
      [matchRunId]
    );

    if (rows.length === 0) {
      throw new Error(`Match run not found for id ${matchRunId}`);
    }

    const matchRun = rows[0] as {
      id: string;
      statement_ids: string[];
      config: any;
      status: string;
    };

    await client.query(
      `UPDATE match_runs
       SET status = 'running', updated_at = now()
       WHERE id = $1`,
      [matchRunId]
    );

    const statementIds: string[] = matchRun.statement_ids ?? [];
    if (statementIds.length === 0) {
      throw new Error("Match run has no statement_ids");
    }

    const { rows: txRows } = await client.query(
      `SELECT id, statement_id, posted_at, amount, currency, description_norm
       FROM transactions
       WHERE statement_id = ANY($1::uuid[])
       ORDER BY posted_at ASC`,
      [statementIds]
    );

    const transactions: MatchableTransaction[] = txRows.map((row: any) => ({
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

    const candidates: CandidatePair[] = generateCandidatePairs(transactions, candidateConfig);

    logger.info(
      { matchRunId, candidateCount: candidates.length },
      "Generated candidate pairs for match run"
    );

    const pairIndex = buildPairIndex(
      candidates.map((c) => ({ pairId: c.pairId, txAId: c.txAId, txBId: c.txBId }))
    );

    const batchSize: number = matchRun.config?.batchSize ?? 50;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);

      const results = await claudeRelationshipEngine.matchPairs(batch, {
        model: env.claudeModel,
        promptVersion: env.claudePromptVersion,
        minConfidence: matchRun.config?.minConfidence ?? 0.7,
        maxRetries: 2
      });

      await persistClaudeResults(matchRunId, results, pairIndex);
    }

    await client.query(
      `UPDATE match_runs
       SET status = 'completed',
           claude_model = $1,
           prompt_version = $2,
           updated_at = now()
       WHERE id = $3`,
      [env.claudeModel, env.claudePromptVersion, matchRunId]
    );

    const durationMs = Date.now() - start;
    recordDuration("run_match_duration_ms", durationMs, { matchRunId });
    incrementCounter("run_match_success_total");

    logger.info({ matchRunId, durationMs }, "Completed run-match job");
  });
};

export const runMatchWorker = new Worker<RunMatchJobData>("run-match", processJob, {
  connection: new IORedis(env.redisUrl, { maxRetriesPerRequest: null })
});

