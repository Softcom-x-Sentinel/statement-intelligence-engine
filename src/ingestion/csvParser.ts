import fs from "fs";
import { parse } from "csv-parse";
import { RawTransactionRow } from "@ingestion/types";
import { BankConfig, BankCsvConfig } from "@ingestion/types";
import { logger } from "@utils/logger";
import {
  callClaudeChunk,
  deduplicateLLMTransactions,
  toLLMRawRows
} from "@llm/claudeExtract";

interface CsvParseOptions {
  filePath: string;
  bankConfig: BankConfig;
}

// ---------------------------------------------------------------------------
// Deterministic path — maps known column names from the bank config
// ---------------------------------------------------------------------------

const createCsvParser = (config: BankCsvConfig) => {
  return (row: Record<string, string>): RawTransactionRow | null => {
    const rawDate = row[config.dateColumn];
    const rawAmount = row[config.amountColumn];
    const rawDescription = row[config.descriptionColumn];

    // Skip rows where required fields are missing (e.g. column name mismatch)
    if (!rawDate || !rawAmount || !rawDescription) return null;

    const rawBalance = config.balanceColumn ? row[config.balanceColumn] : undefined;
    const currency = config.currencyColumn ? row[config.currencyColumn] : undefined;

    return {
      bankName: config.type,
      sourceType: "csv",
      rawDate,
      rawAmount,
      rawDescription,
      rawBalance,
      currency,
      extra: { ...row }
    };
  };
};

// ---------------------------------------------------------------------------
// AI fallback — for CSVs with unknown or mismatched column names
// ---------------------------------------------------------------------------

const extractCsvWithClaude = async (
  text: string,
  bankConfig: BankConfig
): Promise<RawTransactionRow[]> => {
  logger.info({ bankName: bankConfig.bankName }, "Falling back to Claude CSV extraction");

  // CSVs are compact; a single call is usually sufficient
  const transactions = await callClaudeChunk(text);
  const deduplicated = deduplicateLLMTransactions(transactions);
  return toLLMRawRows(deduplicated, bankConfig, "csv");
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseCsvFile(options: CsvParseOptions): Promise<RawTransactionRow[]> {
  const { filePath, bankConfig } = options;
  const csvConfig = bankConfig.csv;

  if (!csvConfig) {
    throw new Error(`No CSV configuration found for bank: ${bankConfig.bankName}`);
  }

  const rows: RawTransactionRow[] = [];
  const toRawRow = createCsvParser(csvConfig);

  try {
    const parser = fs
      .createReadStream(filePath)
      .pipe(
        parse({
          columns: true,
          trim: true,
          skip_empty_lines: true
        })
      );

    for await (const record of parser) {
      const row = toRawRow(record as Record<string, string>);
      if (row) rows.push(row);
    }
  } catch (err) {
    logger.warn({ err, bankName: bankConfig.bankName }, "Deterministic CSV parse failed, trying Claude");
    const text = await fs.promises.readFile(filePath, "utf-8");
    return extractCsvWithClaude(text, bankConfig);
  }

  if (rows.length === 0) {
    logger.warn(
      { bankName: bankConfig.bankName },
      "Deterministic CSV parse returned 0 valid rows — column names likely differ from config. Trying Claude."
    );
    const text = await fs.promises.readFile(filePath, "utf-8");
    return extractCsvWithClaude(text, bankConfig);
  }

  return rows;
}
