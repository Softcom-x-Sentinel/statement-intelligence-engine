import { BankConfig } from "@ingestion/types";

// Initial, conservative example configurations.
// These can be extended with real-bank specific layouts over time.

export const bankConfigs: BankConfig[] = [
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
      parseMode: "line",
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
  },
  {
    bankName: "access-bank",
    currency: "NGN",
    pdf: {
      type: "pdf",
      parseMode: "block",
      dateFormat: "DD-MMM-YY",
      currency: "NGN",
      decimalSeparator: ".",
      thousandSeparator: ",",
      // Each transaction block starts with two consecutive DD-MMM-YY dates (posted + value)
      blockStartRegex: /^(\d{2}-[A-Z]{3}-\d{2})(\d{2}-[A-Z]{3}-\d{2})(.*)/,
      // Tail of each assembled block: {debit_or_hyphen}{credit_or_hyphen}{balance}
      amountsTailRegex: /(-|\d[\d,]*\.\d{2})(-|\d[\d,]*\.\d{2})(-?\d[\d,]*\.\d{2})$/,
      // Discard repeated column-header rows that appear on page breaks
      blockSkipRegex: /^Posted\s*Date/
    }
  }
];

export const getBankConfig = (bankName: string | undefined, sourceType: "csv" | "pdf"): BankConfig | undefined => {
  if (!bankName) return bankConfigs.find((b) => !!b[sourceType]);
  return bankConfigs.find((b) => b.bankName === bankName && !!b[sourceType]) ??
    bankConfigs.find((b) => !!b[sourceType]);
};

