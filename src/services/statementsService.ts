import { withClient } from "@db/pool";

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export class StatementsService {
  async listTransactions(statementId: string, pagination: PaginationOptions) {
    const { limit, offset } = pagination;

    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, statement_id, posted_at, value_date, amount, currency,
                description_raw, description_norm, balance_after, extra
         FROM transactions
         WHERE statement_id = $1
         ORDER BY posted_at ASC
         LIMIT $2 OFFSET $3`,
        [statementId, limit, offset]
      );

      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM transactions
         WHERE statement_id = $1`,
        [statementId]
      );

      return {
        transactions: rows,
        total: countRows[0]?.total ?? 0
      };
    });

    return {
      transactions: result.transactions,
      pagination: {
        total: result.total,
        limit,
        offset
      }
    };
  }
}

