import fetch from "node-fetch";
import { z } from "zod";
import { env } from "@config/env";
import { logger } from "@utils/logger";
import { BankConfig, RawTransactionRow, SourceType } from "@ingestion/types";
import { STATEMENT_EXTRACTION_PROMPT } from "@llm/prompts/pdfExtractionPrompt";

// ---------------------------------------------------------------------------
// Shared schema — used by both PDF and CSV extraction paths
// ---------------------------------------------------------------------------

export const LLMTransactionSchema = z.object({
  postedDate: z.string(),
  valueDate: z.string(),
  description: z.string(),
  debit: z.string(),
  credit: z.string(),
  balance: z.string(),
  currency: z.string().default("NGN")
});

export type LLMTransaction = z.infer<typeof LLMTransactionSchema>;
export const LLMResponseSchema = z.array(LLMTransactionSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const extractJsonArray = (text: string): unknown => {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Unable to locate JSON array in Claude response");
  }
  return JSON.parse(text.slice(start, end + 1));
};

export const deduplicateLLMTransactions = (txs: LLMTransaction[]): LLMTransaction[] => {
  const seen = new Set<string>();
  return txs.filter((tx) => {
    const amount = tx.debit !== "-" ? tx.debit : tx.credit;
    const key = `${tx.postedDate}|${tx.description.trim().slice(0, 60)}|${amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ---------------------------------------------------------------------------
// Single chunk API call
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Network errors that are safe to retry (transient TLS/connection blips)
const RETRIABLE_CODES = new Set(["EPROTO", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"]);

export const callClaudeChunk = async (
  chunk: string,
  maxRetries = 3
): Promise<LLMTransaction[]> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Awaited<ReturnType<typeof fetch>>;

    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.claudeApiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          temperature: 0,
          system: STATEMENT_EXTRACTION_PROMPT.system,
          messages: [{ role: "user", content: chunk }]
        })
      });
    } catch (networkErr: any) {
      if (attempt === maxRetries || !RETRIABLE_CODES.has(networkErr.code)) {
        throw networkErr;
      }
      const waitMs = Math.pow(2, attempt) * 2000; // 2 s, 4 s, 8 s
      logger.warn(
        { attempt, waitMs, code: networkErr.code, message: networkErr.message },
        `Network error calling Claude (${networkErr.code}). Retrying in ${waitMs / 1000}s.`
      );
      await sleep(waitMs);
      continue;
    }

    if (res.status === 429) {
      if (attempt === maxRetries) {
        const errText = await res.text();
        throw new Error(`Claude API error: 429 Too Many Requests - ${errText}`);
      }
      // Honour the Retry-After header; default to 60 s if absent
      const retryAfterSec = Number(res.headers.get("retry-after") ?? "60");
      const waitMs = retryAfterSec * 1000;
      logger.warn(
        { attempt, waitMs },
        `Claude rate-limited (429). Waiting ${retryAfterSec}s before retry.`
      );
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API error: ${res.status} ${res.statusText} - ${errText}`);
    }

    const json: any = await res.json();

    if (json.stop_reason === "max_tokens") {
      throw new Error(
        "A Claude extraction chunk was truncated at 8192 tokens. Reduce chunk size or split the file."
      );
    }

    const content: string =
      Array.isArray(json.content) && json.content[0]?.text
        ? json.content[0].text
        : JSON.stringify(json);

    try {
      return LLMResponseSchema.parse(extractJsonArray(content));
    } catch {
      // Chunk had no parseable transactions (headers/footers only)
      return [];
    }
  }

  // Unreachable, but satisfies TypeScript
  return [];
};

// ---------------------------------------------------------------------------
// Convert Claude output to RawTransactionRow[]
// ---------------------------------------------------------------------------

export const toLLMRawRows = (
  txs: LLMTransaction[],
  bankConfig: BankConfig,
  sourceType: SourceType
): RawTransactionRow[] => {
  const fallbackCurrency = bankConfig.pdf?.currency ?? bankConfig.currency;

  return txs.map((tx) => {
    let rawAmount: string;
    if (tx.debit !== "-") {
      rawAmount = `-${tx.debit}`;
    } else if (tx.credit !== "-") {
      rawAmount = tx.credit;
    } else {
      rawAmount = "0";
    }

    return {
      bankName: bankConfig.bankName,
      sourceType,
      rawDate: tx.postedDate,
      rawValueDate: tx.valueDate,
      rawAmount,
      rawDescription: tx.description,
      rawBalance: tx.balance,
      currency: tx.currency ?? fallbackCurrency,
      extra: {
        source: "ai-fallback",
        rawDebit: tx.debit,
        rawCredit: tx.credit
      }
    };
  });
};
