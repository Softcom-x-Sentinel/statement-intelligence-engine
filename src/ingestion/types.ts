export type SourceType = "csv" | "pdf";

export interface RawTransactionRow {
  bankName: string;
  sourceType: SourceType;
  rawDate: string;
  rawValueDate?: string;
  rawAmount: string;
  rawDescription: string;
  rawBalance?: string;
  currency?: string;
  extra?: Record<string, unknown>;
}

export interface TransactionInput {
  statementId: string;
  postedAt: Date;
  valueDate: Date;
  amount: number;
  currency: string;
  descriptionRaw: string;
  descriptionNorm: string;
  balanceAfter?: number;
  hashSignature: string;
  extra?: Record<string, unknown>;
}

export interface BankCsvConfig {
  type: "csv";
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  balanceColumn?: string;
  currencyColumn?: string;
  dateFormat: string;
  decimalSeparator?: "," | ".";
  thousandSeparator?: "," | ".";
  creditIsPositive?: boolean;
  drIndicators?: string[];
  crIndicators?: string[];
}

export interface BankPdfConfig {
  type: "pdf";
  dateFormat: string;
  currency?: string;
  decimalSeparator?: "," | ".";
  thousandSeparator?: "," | ".";
  creditIsPositive?: boolean;
  drIndicators?: string[];
  crIndicators?: string[];
  // Line mode (default) — single regex per trimmed line
  parseMode?: "line" | "block";
  lineRegex?: RegExp;
  dateGroupIndex?: number;
  descriptionGroupIndex?: number;
  amountGroupIndex?: number;
  balanceGroupIndex?: number;
  // Block mode — for multi-line transactions (e.g. Access Bank)
  blockStartRegex?: RegExp;   // matches a line that starts a new transaction block
  amountsTailRegex?: RegExp;  // extracts debit, credit, balance from the end of a block
  blockSkipRegex?: RegExp;    // lines matching this are discarded (e.g. repeated column headers)
}

export interface BankConfig {
  bankName: string;
  currency?: string;
  csv?: BankCsvConfig;
  pdf?: BankPdfConfig;
}

