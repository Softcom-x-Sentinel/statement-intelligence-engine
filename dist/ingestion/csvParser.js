"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsvFile = parseCsvFile;
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const logger_1 = require("../utils/logger");
const claudeExtract_1 = require("../llm/claudeExtract");
// ---------------------------------------------------------------------------
// Deterministic path — maps known column names from the bank config
// ---------------------------------------------------------------------------
const createCsvParser = (config) => {
    return (row) => {
        const rawDate = row[config.dateColumn];
        const rawAmount = row[config.amountColumn];
        const rawDescription = row[config.descriptionColumn];
        // Skip rows where required fields are missing (e.g. column name mismatch)
        if (!rawDate || !rawAmount || !rawDescription)
            return null;
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
const extractCsvWithClaude = async (text, bankConfig) => {
    logger_1.logger.info({ bankName: bankConfig.bankName }, "Falling back to Claude CSV extraction");
    // CSVs are compact; a single call is usually sufficient
    const transactions = await (0, claudeExtract_1.callClaudeChunk)(text);
    const deduplicated = (0, claudeExtract_1.deduplicateLLMTransactions)(transactions);
    return (0, claudeExtract_1.toLLMRawRows)(deduplicated, bankConfig, "csv");
};
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
async function parseCsvFile(options) {
    const { filePath, bankConfig } = options;
    const csvConfig = bankConfig.csv;
    if (!csvConfig) {
        throw new Error(`No CSV configuration found for bank: ${bankConfig.bankName}`);
    }
    const rows = [];
    const toRawRow = createCsvParser(csvConfig);
    try {
        const parser = fs_1.default
            .createReadStream(filePath)
            .pipe((0, csv_parse_1.parse)({
            columns: true,
            trim: true,
            skip_empty_lines: true
        }));
        for await (const record of parser) {
            const row = toRawRow(record);
            if (row)
                rows.push(row);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, bankName: bankConfig.bankName }, "Deterministic CSV parse failed, trying Claude");
        const text = await fs_1.default.promises.readFile(filePath, "utf-8");
        return extractCsvWithClaude(text, bankConfig);
    }
    if (rows.length === 0) {
        logger_1.logger.warn({ bankName: bankConfig.bankName }, "Deterministic CSV parse returned 0 valid rows — column names likely differ from config. Trying Claude.");
        const text = await fs_1.default.promises.readFile(filePath, "utf-8");
        return extractCsvWithClaude(text, bankConfig);
    }
    return rows;
}
