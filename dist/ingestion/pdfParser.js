"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePdfFile = parsePdfFile;
const fs_1 = __importDefault(require("fs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const logger_1 = require("@utils/logger");
const claudeExtract_1 = require("@llm/claudeExtract");
// ---------------------------------------------------------------------------
// Line mode — one regex match per trimmed line
// ---------------------------------------------------------------------------
const createPdfLineParser = (config, bankName) => {
    if (!config.lineRegex ||
        config.dateGroupIndex == null ||
        config.descriptionGroupIndex == null ||
        config.amountGroupIndex == null) {
        throw new Error("BankPdfConfig is missing required line-mode fields: lineRegex, dateGroupIndex, descriptionGroupIndex, amountGroupIndex");
    }
    return (line) => {
        const match = config.lineRegex.exec(line);
        if (!match)
            return null;
        const rawDate = match[config.dateGroupIndex] ?? "";
        const rawDescription = match[config.descriptionGroupIndex] ?? "";
        const rawAmount = match[config.amountGroupIndex] ?? "";
        const rawBalance = config.balanceGroupIndex != null
            ? match[config.balanceGroupIndex]
            : undefined;
        return {
            bankName,
            sourceType: "pdf",
            rawDate,
            rawAmount,
            rawDescription,
            rawBalance,
            currency: config.currency,
            extra: { line }
        };
    };
};
// ---------------------------------------------------------------------------
// Block mode — assembles multi-line transaction blocks then extracts fields
// ---------------------------------------------------------------------------
const parsePdfBlocks = (text, config, bankName) => {
    const { blockStartRegex, amountsTailRegex, blockSkipRegex, currency } = config;
    if (!blockStartRegex || !amountsTailRegex) {
        throw new Error("BankPdfConfig is missing required block-mode fields: blockStartRegex, amountsTailRegex");
    }
    const blocks = [];
    let current = null;
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (blockSkipRegex?.test(trimmed))
            continue;
        const startMatch = blockStartRegex.exec(trimmed);
        if (startMatch) {
            if (current)
                blocks.push(current);
            current = {
                postedDate: startMatch[1],
                valueDate: startMatch[2],
                body: startMatch[3]?.trim() ?? ""
            };
        }
        else if (current) {
            current.body += (current.body ? " " : "") + trimmed;
        }
    }
    if (current)
        blocks.push(current);
    const rows = [];
    for (const block of blocks) {
        const amountMatch = amountsTailRegex.exec(block.body);
        if (!amountMatch)
            continue;
        const rawDebit = amountMatch[1];
        const rawCredit = amountMatch[2];
        const rawBalance = amountMatch[3];
        const description = block.body.slice(0, amountMatch.index).trim();
        if (!description)
            continue;
        let rawAmount;
        if (rawDebit !== "-") {
            rawAmount = `-${rawDebit}`;
        }
        else if (rawCredit !== "-") {
            rawAmount = rawCredit;
        }
        else {
            rawAmount = "0";
        }
        rows.push({
            bankName,
            sourceType: "pdf",
            rawDate: block.postedDate,
            rawValueDate: block.valueDate,
            rawAmount,
            rawDescription: description,
            rawBalance,
            currency: currency ?? "NGN",
            extra: { postedDate: block.postedDate, valueDate: block.valueDate, rawDebit, rawCredit }
        });
    }
    return rows;
};
// ---------------------------------------------------------------------------
// Balance reconciliation — detect when deterministic parse needs AI help
// ---------------------------------------------------------------------------
const extractExpectedClosingBalance = (text) => {
    const match = /Closing Balance[:\s]*([\d,]+\.\d{2})/i.exec(text);
    if (!match)
        return null;
    const parsed = Number(match[1].replace(/,/g, ""));
    return Number.isNaN(parsed) ? null : parsed;
};
const lastParsedBalance = (rows) => {
    if (rows.length === 0)
        return null;
    const raw = rows[rows.length - 1].rawBalance;
    if (!raw)
        return null;
    const parsed = Number(raw.replace(/,/g, "").trim());
    return Number.isNaN(parsed) ? null : parsed;
};
// ---------------------------------------------------------------------------
// AI fallback — sequential chunked calls for any statement length
// ---------------------------------------------------------------------------
// 80 lines per chunk with 8-line overlap to avoid splitting mid-transaction
const CHUNK_LINES = 80;
const CHUNK_OVERLAP = 8;
// Free-tier API limit: 5 requests per minute across all models
const RATE_LIMIT_RPM = 5;
const RATE_LIMIT_WINDOW_MS = 62000; // 62 s gives a 2 s safety margin
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const splitTextIntoChunks = (text) => {
    const lines = text.split("\n");
    if (lines.length <= CHUNK_LINES)
        return [text];
    const chunks = [];
    const step = CHUNK_LINES - CHUNK_OVERLAP;
    for (let i = 0; i < lines.length; i += step) {
        const slice = lines.slice(i, i + CHUNK_LINES).join("\n");
        if (slice.trim())
            chunks.push(slice);
        if (i + CHUNK_LINES >= lines.length)
            break;
    }
    return chunks;
};
const extractWithClaude = async (text, bankConfig) => {
    const chunks = splitTextIntoChunks(text);
    logger_1.logger.info({ bankName: bankConfig.bankName, chunkCount: chunks.length }, "Falling back to Claude PDF extraction");
    const chunkResults = [];
    for (let i = 0; i < chunks.length; i++) {
        // Before starting each new batch of RATE_LIMIT_RPM requests, wait out
        // the remainder of the rate-limit window so we never exceed 5 RPM.
        if (i > 0 && i % RATE_LIMIT_RPM === 0) {
            logger_1.logger.info({ chunk: i, total: chunks.length }, `Rate-limit pause: waiting ${RATE_LIMIT_WINDOW_MS / 1000}s before next batch.`);
            await sleep(RATE_LIMIT_WINDOW_MS);
        }
        chunkResults.push(await (0, claudeExtract_1.callClaudeChunk)(chunks[i]));
    }
    const allTransactions = (0, claudeExtract_1.deduplicateLLMTransactions)(chunkResults.flat());
    return (0, claudeExtract_1.toLLMRawRows)(allTransactions, bankConfig, "pdf");
};
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
async function parsePdfFile(options) {
    const { filePath, bankConfig } = options;
    const pdfConfig = bankConfig.pdf;
    if (!pdfConfig) {
        throw new Error(`No PDF configuration found for bank: ${bankConfig.bankName}`);
    }
    const buffer = await fs_1.default.promises.readFile(filePath);
    const parsed = await (0, pdf_parse_1.default)(buffer);
    const text = parsed.text ?? "";
    logger_1.logger.debug({ bankName: bankConfig.bankName }, "PDF text extracted");
    let rows = [];
    try {
        if (pdfConfig.parseMode === "block") {
            rows = parsePdfBlocks(text, pdfConfig, bankConfig.bankName);
        }
        else {
            const toRawRow = createPdfLineParser(pdfConfig, bankConfig.bankName);
            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                const maybeRow = toRawRow(trimmed);
                if (maybeRow)
                    rows.push(maybeRow);
            }
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, bankName: bankConfig.bankName }, "Deterministic PDF parse failed, trying Claude");
        return extractWithClaude(text, bankConfig);
    }
    if (rows.length === 0) {
        logger_1.logger.warn({ bankName: bankConfig.bankName }, "Deterministic parse returned 0 rows, trying Claude");
        return extractWithClaude(text, bankConfig);
    }
    const expectedBalance = extractExpectedClosingBalance(text);
    if (expectedBalance !== null) {
        const actualBalance = lastParsedBalance(rows);
        if (actualBalance !== null && Math.abs(actualBalance - expectedBalance) > 1) {
            logger_1.logger.warn({ actualBalance, expectedBalance, bankName: bankConfig.bankName }, "Closing balance mismatch, trying Claude");
            return extractWithClaude(text, bankConfig);
        }
    }
    return rows;
}
