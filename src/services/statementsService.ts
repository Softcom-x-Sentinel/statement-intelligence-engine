import { withClient } from "@db/pool";

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export class StatementsService {
  async listStatements(pagination: PaginationOptions) {
    const { limit, offset } = pagination;

    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT s.id, s.upload_id, s.bank_name, s.currency,
                s.date_range_start, s.date_range_end, s.raw_metadata,
                u.filename, u.source_type,
                COUNT(t.id)::int AS transaction_count
         FROM statements s
         LEFT JOIN uploads u ON u.id = s.upload_id
         LEFT JOIN transactions t ON t.statement_id = s.id
         GROUP BY s.id, u.filename, u.source_type
         ORDER BY s.date_range_start DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS total FROM statements`
      );

      return {
        statements: rows,
        total: countRows[0]?.total ?? 0
      };
    });

    return {
      statements: result.statements,
      pagination: {
        total: result.total,
        limit,
        offset
      }
    };
  }

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

