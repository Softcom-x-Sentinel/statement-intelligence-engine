"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsvFile = parseCsvFile;
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const createCsvParser = (config) => {
    return (row) => {
        const rawDate = row[config.dateColumn];
        const rawAmount = row[config.amountColumn];
        const rawDescription = row[config.descriptionColumn];
        const rawBalance = config.balanceColumn ? row[config.balanceColumn] : undefined;
        const currency = config.currencyColumn ? row[config.currencyColumn] : config.currency;
        const extra = { ...row };
        return {
            bankName: config.type,
            sourceType: "csv",
            rawDate,
            rawAmount,
            rawDescription,
            rawBalance,
            currency,
            extra
        };
    };
};
async function parseCsvFile(options) {
    const { filePath, bankConfig } = options;
    const csvConfig = bankConfig.csv;
    if (!csvConfig) {
        throw new Error(`No CSV configuration found for bank: ${bankConfig.bankName}`);
    }
    const rows = [];
    const parser = fs_1.default
        .createReadStream(filePath)
        .pipe((0, csv_parse_1.parse)({
        columns: true,
        trim: true,
        skip_empty_lines: true
    }));
    const toRawRow = createCsvParser(csvConfig);
    for await (const record of parser) {
        rows.push(toRawRow(record));
    }
    return rows;
}
