"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTransaction = exports.computeHashSignature = exports.normalizeDescription = exports.parseAmount = void 0;
const crypto_1 = __importDefault(require("crypto"));
const dayjs_1 = __importDefault(require("dayjs"));
const customParseFormat_1 = __importDefault(require("dayjs/plugin/customParseFormat"));
dayjs_1.default.extend(customParseFormat_1.default);
/**
 * Normalise a raw date string so dayjs can parse it regardless of the
 * case the bank chose for month names or abbreviations.
 *
 * Converts any alphabetic sequence of 3+ characters to title case so that
 * both full month names and abbreviations are handled uniformly.
 *
 * Examples:
 *   "13-DEC-25"        → "13-Dec-25"       (abbreviated, uppercase)
 *   "13-dec-25"        → "13-Dec-25"       (abbreviated, lowercase)
 *   "12/MARCH/2026"    → "12/March/2026"   (full name, uppercase)
 *   "12/march/2026"    → "12/March/2026"   (full name, lowercase)
 *   "01/13/2024"       → "01/13/2024"      (numeric only, unchanged)
 *   "2025-12-13"       → "2025-12-13"      (ISO format, unchanged)
 */
const normalizeDateString = (raw) => raw.replace(/[A-Za-z]{3,}/g, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
const FALLBACK_DATE_FORMATS = [
    // Abbreviated month — hyphen
    "DD-MMM-YY", "DD-MMM-YYYY", "D-MMM-YY", "D-MMM-YYYY",
    // Abbreviated month — slash
    "DD/MMM/YY", "DD/MMM/YYYY", "D/MMM/YY", "D/MMM/YYYY",
    // Full month name
    "DD-MMMM-YYYY", "DD/MMMM/YYYY", "DD MMMM YYYY", "D MMMM YYYY",
    "MMMM DD, YYYY", "MMMM D, YYYY",
    // Numeric European (DD/MM or DD-MM)
    "DD/MM/YYYY", "D/M/YYYY", "DD-MM-YYYY", "DD.MM.YYYY",
    // Numeric US (MM/DD)
    "MM/DD/YYYY", "M/D/YYYY",
    // ISO
    "YYYY-MM-DD",
];
/**
 * Parse a raw bank date string to a dayjs instance, regardless of input format.
 * 1. Normalise month-name casing ("JAN" → "Jan").
 * 2. Try the bank-configured format (strict).
 * 3. Try every format in FALLBACK_DATE_FORMATS (strict).
 * 4. Non-strict native parse as last resort (handles ISO strings from LLMs).
 */
const parseDate = (raw, configuredFormat) => {
    const s = normalizeDateString(raw.trim());
    if (configuredFormat) {
        const d = (0, dayjs_1.default)(s, configuredFormat, true);
        if (d.isValid())
            return d;
    }
    for (const fmt of FALLBACK_DATE_FORMATS) {
        if (fmt === configuredFormat)
            continue;
        const d = (0, dayjs_1.default)(s, fmt, true);
        if (d.isValid())
            return d;
    }
    return (0, dayjs_1.default)(s); // non-strict fallback
};
const sanitizeNumber = (raw, decimalSeparator = ".", thousandSeparator = ",") => {
    let value = raw.trim();
    // Remove thousands separator
    const thousandRegex = new RegExp(`\\${thousandSeparator}`, "g");
    value = value.replace(thousandRegex, "");
    // Normalize decimal separator to dot
    if (decimalSeparator === ",") {
        value = value.replace(",", ".");
    }
    // Remove spaces
    value = value.replace(/\s+/g, "");
    return value;
};
const parseAmount = (rawAmount, cfg) => {
    const decimalSeparator = cfg.decimalSeparator ?? ".";
    const thousandSeparator = cfg.thousandSeparator ?? ",";
    let numeric = sanitizeNumber(rawAmount, decimalSeparator, thousandSeparator);
    let sign = 1;
    // Parentheses indicate negative
    if (numeric.startsWith("(") && numeric.endsWith(")")) {
        sign = -1;
        numeric = numeric.slice(1, -1);
    }
    const parsed = Number(numeric);
    if (Number.isNaN(parsed)) {
        throw new Error(`Unable to parse amount: ${rawAmount}`);
    }
    return sign * parsed;
};
exports.parseAmount = parseAmount;
const normalizeDescription = (raw) => {
    return raw.toLowerCase().trim().replace(/\s+/g, " ");
};
exports.normalizeDescription = normalizeDescription;
const computeHashSignature = (args) => {
    const base = [
        args.bankName,
        args.postedAt.toISOString().slice(0, 10),
        args.amount.toFixed(4),
        args.descriptionNorm.slice(0, 64)
    ].join("|");
    return crypto_1.default.createHash("sha256").update(base).digest("hex");
};
exports.computeHashSignature = computeHashSignature;
const normalizeTransaction = (raw, bankConfig) => {
    const cfg = bankConfig.csv ?? bankConfig.pdf;
    if (!cfg) {
        throw new Error(`No bank configuration found for bank: ${bankConfig.bankName}`);
    }
    const dateFormat = cfg.dateFormat;
    const postedAt = parseDate(raw.rawDate, dateFormat);
    if (!postedAt.isValid()) {
        throw new Error(`Invalid posted_at date: ${raw.rawDate}`);
    }
    const postedAtDate = postedAt.toDate();
    let valueDateDate = postedAtDate;
    if (raw.rawValueDate) {
        const parsedValueDate = parseDate(raw.rawValueDate, dateFormat);
        if (parsedValueDate.isValid()) {
            valueDateDate = parsedValueDate.toDate();
        }
    }
    const amount = (0, exports.parseAmount)(raw.rawAmount, cfg);
    const descriptionRaw = raw.rawDescription;
    const descriptionNorm = (0, exports.normalizeDescription)(descriptionRaw);
    let balanceAfter;
    if (raw.rawBalance) {
        try {
            balanceAfter = (0, exports.parseAmount)(raw.rawBalance, cfg);
        }
        catch {
            balanceAfter = undefined;
        }
    }
    const hashSignature = (0, exports.computeHashSignature)({
        bankName: bankConfig.bankName,
        postedAt: postedAtDate,
        amount,
        descriptionNorm
    });
    return {
        statementId: "", // to be filled by caller
        postedAt: postedAtDate,
        valueDate: valueDateDate,
        amount,
        currency: raw.currency ?? bankConfig.currency ?? "UNKNOWN",
        descriptionRaw,
        descriptionNorm,
        balanceAfter,
        hashSignature,
        extra: raw.extra
    };
};
exports.normalizeTransaction = normalizeTransaction;
