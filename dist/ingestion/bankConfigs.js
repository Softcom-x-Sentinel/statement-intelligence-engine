"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBankConfig = exports.bankConfigs = void 0;
// Initial, conservative example configurations.
// These can be extended with real-bank specific layouts over time.
exports.bankConfigs = [
    {
        bankName: "generic-csv",
        csv: {
            type: "csv",
            dateColumn: "date",
            amountColumn: "amount",
            descriptionColumn: "description",
            balanceColumn: "balance",
            dateFormat: "YYYY-MM-DD",
            decimalSeparator: ".",
            thousandSeparator: ",",
            creditIsPositive: true
        }
    },
    {
        bankName: "generic-pdf",
        pdf: {
            type: "pdf",
            // Example: 2024-01-31  SOME MERCHANT    -123.45    1000.00
            lineRegex: /^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-0-9,().]+)\s+([-0-9,().]+)$/,
            dateGroupIndex: 1,
            descriptionGroupIndex: 2,
            amountGroupIndex: 3,
            balanceGroupIndex: 4,
            dateFormat: "YYYY-MM-DD",
            decimalSeparator: ".",
            thousandSeparator: ",",
            creditIsPositive: true
        }
    }
];
const getBankConfig = (bankName, sourceType) => {
    if (!bankName)
        return exports.bankConfigs.find((b) => !!b[sourceType]);
    return exports.bankConfigs.find((b) => b.bankName === bankName && !!b[sourceType]) ??
        exports.bankConfigs.find((b) => !!b[sourceType]);
};
exports.getBankConfig = getBankConfig;
