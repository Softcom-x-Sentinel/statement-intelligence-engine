import { withClient } from "@db/pool";
import { runMatchQueue } from "@jobs/queues";
import { logger } from "@utils/logger";

export interface MatchRunConfigInput {
  relationshipTypes?: string[];
  dateWindowDays?: number;
  amountToleranceAbsolute?: number;
  amountToleranceRelative?: number;
  batchSize?: number;
  enableTextFilter?: boolean;
}

const DEFAULT_MATCH_RUN_CONFIG: Required<MatchRunConfigInput> = {
  relationshipTypes: [],
  dateWindowDays: 5,
  amountToleranceAbsolute: 0.01,
  amountToleranceRelative: 0.005,
  batchSize: 50,
  enableTextFilter: true
};

export class MatchRunsService {
  async createMatchRun(statementIds: string[], config: MatchRunConfigInput | undefined) {
    const normalizedConfig: MatchRunConfigInput = {
      relationshipTypes: config?.relationshipTypes ?? DEFAULT_MATCH_RUN_CONFIG.relationshipTypes,
      dateWindowDays: config?.dateWindowDays ?? DEFAULT_MATCH_RUN_CONFIG.dateWindowDays,
      amountToleranceAbsolute:
        config?.amountToleranceAbsolute ?? DEFAULT_MATCH_RUN_CONFIG.amountToleranceAbsolute,
      amountToleranceRelative:
        config?.amountToleranceRelative ?? DEFAULT_MATCH_RUN_CONFIG.amountToleranceRelative,
      batchSize: config?.batchSize ?? DEFAULT_MATCH_RUN_CONFIG.batchSize,
      enableTextFilter: config?.enableTextFilter ?? DEFAULT_MATCH_RUN_CONFIG.enableTextFilter
    };

    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO match_runs (statement_ids, config, status, created_at, updated_at)
         VALUES ($1, $2, 'pending', now(), now())
         RETURNING id, status`,
        [statementIds, normalizedConfig]
      );
      return rows[0];
    });

    const matchRunId: string = result.id;

    await runMatchQueue.add("run-match", { matchRunId });

    logger.info({ matchRunId, statementIds }, "Enqueued run-match job");

    return {
      id: matchRunId,
      status: result.status
    };
  }

  async getMatchRun(matchRunId: string) {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, status, error, claude_model, prompt_version, created_at, updated_at
         FROM match_runs
         WHERE id = $1`,
        [matchRunId]
      );

      if (rows.length === 0) return null;

      const matchRun = rows[0];

      const { rows: relationshipRows } = await client.query(
        `SELECT id, tx_a_id, tx_b_id, relationship_type, confidence, reason
         FROM relationships
         WHERE match_run_id = $1`,
        [matchRunId]
      );

      return { matchRun, relationships: relationshipRows };
    });

    return result;
  }
}

