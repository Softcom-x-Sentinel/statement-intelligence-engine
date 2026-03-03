import { withClient } from "@db/pool";
import { ClaudeMatchResult } from "@llm/ClaudeRelationshipEngine";

export interface PairIndexEntry {
  txAId: string;
  txBId: string;
}

export type PairIndex = Map<string, PairIndexEntry>;

export const buildPairIndex = (
  pairs: { pairId: string; txAId: string; txBId: string }[]
): PairIndex => {
  const index: PairIndex = new Map();
  for (const p of pairs) {
    index.set(p.pairId, { txAId: p.txAId, txBId: p.txBId });
  }
  return index;
};

export const persistClaudeResults = async (
  matchRunId: string,
  results: ClaudeMatchResult[],
  pairIndex: PairIndex
): Promise<void> => {
  if (results.length === 0) return;

  await withClient(async (client) => {
    for (const r of results) {
      const mapping = pairIndex.get(r.pairId);
      if (!mapping) continue;

      await client.query(
        `INSERT INTO relationships
         (match_run_id, tx_a_id, tx_b_id, relationship_type, confidence, reason, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
        [
          matchRunId,
          mapping.txAId,
          mapping.txBId,
          r.relationshipType,
          r.confidence,
          r.reason
        ]
      );
    }
  });
};

