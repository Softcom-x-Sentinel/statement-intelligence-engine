"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatementsService = void 0;
const pool_1 = require("@db/pool");
class StatementsService {
    async listTransactions(statementId, pagination) {
        const { limit, offset } = pagination;
        const result = await (0, pool_1.withClient)(async (client) => {
            const { rows } = await client.query(`SELECT id, statement_id, posted_at, value_date, amount, currency,
                description_raw, description_norm, balance_after, extra
         FROM transactions
         WHERE statement_id = $1
         ORDER BY posted_at ASC
         LIMIT $2 OFFSET $3`, [statementId, limit, offset]);
            const { rows: countRows } = await client.query(`SELECT COUNT(*)::int AS total
         FROM transactions
         WHERE statement_id = $1`, [statementId]);
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
exports.StatementsService = StatementsService;
