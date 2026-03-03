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
    const postedAt = (0, dayjs_1.default)(raw.rawDate, dateFormat, true);
    if (!postedAt.isValid()) {
        throw new Error(`Invalid posted_at date: ${raw.rawDate}`);
    }
    const postedAtDate = postedAt.toDate();
    const valueDate = postedAt.toDate();
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
        valueDate,
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
