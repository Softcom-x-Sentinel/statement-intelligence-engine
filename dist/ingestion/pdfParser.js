"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePdfFile = parsePdfFile;
const fs_1 = __importDefault(require("fs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const createPdfLineParser = (config) => {
    return (line) => {
        const match = config.lineRegex.exec(line);
        if (!match)
            return null;
        const rawDate = match[config.dateGroupIndex] ?? "";
        const rawDescription = match[config.descriptionGroupIndex] ?? "";
        const rawAmount = match[config.amountGroupIndex] ?? "";
        const rawBalance = config.balanceGroupIndex ? match[config.balanceGroupIndex] : undefined;
        return {
            bankName: config.type,
            sourceType: "pdf",
            rawDate,
            rawAmount,
            rawDescription,
            rawBalance,
            currency: config.currency,
            extra: {
                line
            }
        };
    };
};
async function parsePdfFile(options) {
    const { filePath, bankConfig } = options;
    const pdfConfig = bankConfig.pdf;
    if (!pdfConfig) {
        throw new Error(`No PDF configuration found for bank: ${bankConfig.bankName}`);
    }
    const buffer = await fs_1.default.promises.readFile(filePath);
    const parsed = await (0, pdf_parse_1.default)(buffer);
    const text = parsed.text ?? "";
    const lines = text.split("\n");
    const toRawRow = createPdfLineParser(pdfConfig);
    const rows = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const maybeRow = toRawRow(trimmed);
        if (maybeRow) {
            rows.push(maybeRow);
        }
    }
    return rows;
}
