# Statement Intelligence Engine (SIE) — Backend Documentation

## Overview

The Statement Intelligence Engine is an Express.js backend that ingests bank statements (PDF/CSV), parses transactions using both deterministic and AI-powered extraction, normalizes the data, and matches related transactions across statements using Claude for relationship classification.

**Stack:** Node.js ≥20, Express 4, PostgreSQL, Redis + BullMQ, Anthropic Claude API, TypeScript (strict), Zod, Pino.

---

## Architecture

```
                         ┌────────────────────────────────┐
                         │         Express Server         │
                         │   (src/server.ts + app.ts)     │
                         └──────────┬─────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
     ┌──────────┐           ┌──────────┐           ┌──────────────┐
     │  Upload   │           │Statements│           │  Match Runs  │
     │  Routes   │           │  Routes  │           │   Routes     │
     └────┬─────┘           └────┬─────┘           └──────┬───────┘
          ▼                      ▼                        ▼
     ┌──────────┐           ┌──────────┐           ┌──────────────┐
     │Controller│           │Controller│           │  Controller  │
     └────┬─────┘           └────┬─────┘           └──────┬───────┘
          ▼                      ▼                        ▼
     ┌──────────┐           ┌──────────┐           ┌──────────────┐
     │ Service  │           │ Service  │           │   Service    │
     └────┬─────┘           └────┬─────┘           └──────┬───────┘
          │                      │                        │
          ▼                      ▼                        ▼
   ┌─────────────┐        ┌──────────┐         ┌──────────────────┐
   │ BullMQ Job  │        │PostgreSQL│         │   BullMQ Job     │
   │parse-upload │        │          │         │   run-match      │
   └──────┬──────┘        └──────────┘         └───────┬──────────┘
          ▼                                            ▼
   ┌─────────────┐                            ┌───────────────────┐
   │  Ingestion  │                            │  Matching Engine  │
   │ PDF / CSV   │                            │ Candidate Gen +   │
   │ + Claude AI │                            │ Claude Classify   │
   └─────────────┘                            └───────────────────┘
```

---

## API Endpoints

All endpoints require an `X-API-Key` header (unless no keys are configured, i.e. development mode).

### Upload a Statement

```
POST /v1/statements/upload
Content-Type: multipart/form-data
```

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | PDF or CSV bank statement |

**Response (202):**
```json
{ "uploadId": "uuid", "status": "pending" }
```

Enqueues a background `parse-upload` job. Poll the status endpoint to track progress.

---

### Get Upload Status

```
GET /v1/uploads/:uploadId
```

**Response (200):**
```json
{
  "uploadId": "uuid",
  "status": "pending | parsing | parsed | failed",
  "error": null,
  "filename": "statement.csv",
  "mimeType": "text/csv",
  "sourceType": "csv",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:35:00Z",
  "statementIds": ["uuid-1"]
}
```

---

### List Transactions

```
GET /v1/statements/:statementId/transactions?limit=100&offset=0
```

**Response (200):**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "statement_id": "uuid",
      "posted_at": "2025-01-15T00:00:00Z",
      "value_date": "2025-01-15",
      "amount": -150.50,
      "currency": "NGN",
      "description_raw": "POS PURCHASE ACME",
      "description_norm": "pos purchase acme",
      "balance_after": 25000.00,
      "extra": {}
    }
  ],
  "pagination": { "total": 127, "limit": 100, "offset": 0 }
}
```

---

### Create a Match Run

```
POST /v1/match-runs
Content-Type: application/json
```

**Body:**
```json
{
  "statementIds": ["uuid-1", "uuid-2"],
  "config": {
    "dateWindowDays": 5,
    "amountToleranceAbsolute": 0.01,
    "amountToleranceRelative": 0.005,
    "batchSize": 50,
    "enableTextFilter": true,
    "minConfidence": 0.7
  }
}
```

All config fields are optional and fall back to the defaults shown above.

**Response (202):**
```json
{ "matchRunId": "uuid", "status": "pending" }
```

---

### Get Match Run Results

```
GET /v1/match-runs/:matchRunId
```

**Response (200):**
```json
{
  "matchRun": {
    "id": "uuid",
    "status": "completed",
    "error": null,
    "claude_model": "claude-sonnet-4-6",
    "prompt_version": "PROMPT_VERSION_1",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:45:00Z"
  },
  "relationships": [
    {
      "id": "uuid",
      "tx_a_id": "uuid",
      "tx_b_id": "uuid",
      "relationship_type": "transfer",
      "confidence": 0.95,
      "reason": "Same amount, opposite signs, matching dates"
    }
  ]
}
```

---

## Data Flow

### 1. Upload & Parse

```
Client uploads file
  → POST /v1/statements/upload (202 Accepted)
  → File saved to data/uploads/{uploadId}
  → parse-upload job enqueued

parse-upload worker picks up job:
  → Determine bank config (by bankName or auto-detect)
  → Parse file:
      CSV → csv-parse with configured columns
      PDF → Line-mode regex OR block-mode assembly
      Fallback → Claude AI extraction (chunked, rate-limited)
  → Normalize each transaction (dates, amounts, descriptions)
  → Compute dedup hash (SHA256 of bank|date|amount|description)
  → INSERT statement + transactions into PostgreSQL
  → Upload status → "parsed"
```

### 2. Match Run

```
Client creates match run
  → POST /v1/match-runs (202 Accepted)
  → run-match job enqueued

run-match worker picks up job:
  → Fetch all transactions for the given statement IDs
  → Generate candidate pairs:
      Filter by date window (default ±5 days)
      Filter by amount tolerance (absolute + relative)
      Filter by description token overlap (optional)
      Cap at maxPairsPerRun (default 10,000)
  → Process candidates in batches (default 50 pairs):
      → Send to Claude for relationship classification
      → Claude returns: relationshipType, confidence, reason
      → Filter by minConfidence threshold
      → Persist to relationships table
  → Match run status → "completed"
```

---

## Database Schema

### `uploads`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Upload identifier |
| `filename` | TEXT | Original filename |
| `mime_type` | TEXT | File MIME type |
| `source_type` | TEXT | `"pdf"` or `"csv"` |
| `status` | TEXT | `pending → parsing → parsed` or `failed` |
| `error` | TEXT | Error message if failed |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `statements`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Statement identifier |
| `upload_id` | UUID (FK) | Parent upload |
| `bank_name` | TEXT | Bank identifier |
| `account_identifier_hash` | TEXT | Optional account hash |
| `currency` | TEXT | Statement currency |
| `date_range_start` | DATE | Earliest transaction date |
| `date_range_end` | DATE | Latest transaction date |
| `raw_metadata` | JSONB | Filename, row count, etc. |

### `transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Transaction identifier |
| `statement_id` | UUID (FK) | Parent statement |
| `posted_at` | TIMESTAMPTZ | Posting date |
| `value_date` | DATE | Value/effective date |
| `amount` | NUMERIC(18,4) | Signed amount |
| `currency` | TEXT | Currency code |
| `description_raw` | TEXT | Original description |
| `description_norm` | TEXT | Lowercased, trimmed |
| `balance_after` | NUMERIC(18,4) | Running balance |
| `hash_signature` | TEXT | SHA256 dedup hash |
| `extra` | JSONB | Bank-specific metadata |

### `match_runs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Match run identifier |
| `statement_ids` | UUID[] | Statements being matched |
| `config` | JSONB | Matching parameters |
| `status` | TEXT | `pending → running → completed` or `failed` |
| `error` | TEXT | Error message if failed |
| `claude_model` | TEXT | Model used for classification |
| `prompt_version` | TEXT | Prompt version used |

### `relationships`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Relationship identifier |
| `match_run_id` | UUID (FK) | Parent match run |
| `tx_a_id` | UUID (FK) | First transaction |
| `tx_b_id` | UUID (FK) | Second transaction |
| `relationship_type` | TEXT | `transfer`, `duplicate`, `refund`, `fee_link`, or `unrelated` |
| `confidence` | NUMERIC(4,3) | 0.000 – 1.000 |
| `reason` | TEXT | Claude's explanation |
| `raw_claude_response` | JSONB | Full API response |
| `label_type` | TEXT | Human-assigned label (optional) |
| `label_source` | TEXT | Label source (optional) |
| `labelled_by` | TEXT | Who labeled it (optional) |
| `label_confidence` | NUMERIC(4,3) | Human label confidence (optional) |

---

## Ingestion Pipeline

### Bank Configurations

Bank-specific parsing rules live in `src/ingestion/bankConfigs.ts`. Each config defines how to extract transactions from that bank's statement format.

| Bank | Source | Parse Mode | Notes |
|------|--------|------------|-------|
| `generic-csv` | CSV | Column mapping | Standard CSV with date/amount/description columns |
| `generic-pdf` | PDF | Line mode | Single regex per line |
| `access-bank` | PDF | Block mode | Multi-line transactions, DD-MMM-YY dates, NGN currency |

### Parsing Strategy

Both CSV and PDF parsers follow a two-tier approach:

1. **Deterministic parsing** — Fast, precise. Uses regexes (PDF) or column mapping (CSV) from the bank config.
2. **AI fallback** — If deterministic parsing fails or returns 0 rows, the raw text is sent to Claude Haiku in chunks for extraction.

PDF-specific features:
- **Block mode** assembles multi-line transactions before extracting fields.
- **Balance reconciliation** compares parsed closing balance against the value stated in the PDF. A mismatch triggers the AI fallback.
- **Chunking** splits large PDFs into 80-line chunks with 8-line overlap to avoid splitting mid-transaction.

### Normalization

Every raw transaction passes through `src/normalization/normalizeTransaction.ts`:

- **Dates** — Tries the configured format first, then a list of common formats (DD-MMM-YY, DD/MM/YYYY, YYYY-MM-DD, etc.).
- **Amounts** — Removes thousand separators, normalizes decimal separators, detects negatives via parentheses.
- **Descriptions** — Lowercased, trimmed, collapsed whitespace.
- **Hash signature** — SHA256 of `bankName|YYYY-MM-DD|amount|description[0:64]`, used for deduplication.

---

## Matching Engine

### Candidate Generation

`src/matching/candidateGenerator.ts` produces candidate transaction pairs for Claude to classify.

**Algorithm:**
1. Group transactions by currency.
2. Sort by `posted_at` ascending.
3. For each pair `(i, j)` where `i < j`:
   - **Date filter:** `|date_j - date_i|` ≤ `dateWindowDays`
   - **Amount filter:** `|amount_a - amount_b|` ≤ `amountToleranceAbsolute` OR relative difference ≤ `amountToleranceRelative`
   - **Text filter** (optional): At least one meaningful token shared between descriptions (after removing stop words like "payment", "pos", "card", etc.)
4. Stop at `maxPairsPerRun` (default 10,000).

Pair IDs are deterministic: `min(txA.id, txB.id):max(txA.id, txB.id)`.

### Relationship Classification

`src/llm/ClaudeRelationshipEngine.ts` sends candidate pairs to Claude in batches and parses structured JSON responses.

**Relationship types:**

| Type | Description |
|------|-------------|
| `transfer` | Same money moved between accounts of the same user |
| `duplicate` | Same transaction recorded twice |
| `refund` | A payment that was later refunded |
| `fee_link` | A fee clearly associated with another transaction |
| `unrelated` | No meaningful relationship |

**Resilience:**
- Exponential backoff on network errors (2s, 4s, 8s).
- Honors `Retry-After` header on 429 rate limits.
- Detects `stop_reason: "max_tokens"` truncation.
- Configurable `maxRetries` (default 2).

Results below `minConfidence` (default 0.7) are filtered out before persistence.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `CLAUDE_API_KEY` | Yes | — | Anthropic API key |
| `PORT` | No | `4000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `UPLOADS_DIR` | No | `data/uploads` | File storage directory |
| `API_KEYS` | No | — | Comma-separated valid API keys. If unset, auth is disabled. |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Model for relationship matching |
| `CLAUDE_PROMPT_VERSION` | No | `PROMPT_VERSION_1` | Prompt template version |

---

## Running the Engine

### Development

```bash
npm run dev
```

Starts `ts-node-dev` with auto-restart, transpile-only mode, and tsconfig path resolution. Both the HTTP server and job workers (parse-upload, run-match) run in the same process.

### Production

```bash
npm run build   # Compile TypeScript to dist/
npm start       # Run dist/server.js
```

### Prerequisites

- Node.js ≥ 20
- PostgreSQL instance
- Redis instance
- Anthropic API key

---

## Project Structure

```
src/
├── app.ts                          # Express app setup and routes
├── server.ts                       # Entry point, DB init, worker registration
├── config/
│   └── env.ts                      # Environment variable loading
├── middleware/
│   └── apiKeyAuth.ts               # X-API-Key authentication
├── routes/
│   ├── uploads.ts                  # POST /v1/statements/upload
│   ├── uploadsStatus.ts            # GET /v1/uploads/:uploadId
│   ├── statements.ts               # GET /v1/statements/:id/transactions
│   └── matchRuns.ts                # POST + GET /v1/match-runs
├── controllers/
│   ├── uploadsController.ts
│   ├── statementsController.ts
│   └── matchRunsController.ts
├── services/
│   ├── uploadService.ts
│   ├── statementsService.ts
│   └── matchRunsService.ts
├── db/
│   ├── pool.ts                     # PostgreSQL connection pool + withClient()
│   └── init.ts                     # Schema migration runner
├── ingestion/
│   ├── types.ts                    # RawTransactionRow, BankConfig, etc.
│   ├── bankConfigs.ts              # Bank-specific parsing configurations
│   ├── csvParser.ts                # CSV parsing (deterministic + AI fallback)
│   └── pdfParser.ts                # PDF parsing (line/block mode + AI fallback)
├── normalization/
│   └── normalizeTransaction.ts     # Date/amount/description normalization
├── matching/
│   ├── candidateGenerator.ts       # Candidate pair generation
│   └── relationshipPersister.ts    # Persist Claude results to DB
├── llm/
│   ├── claudeExtract.ts            # Claude extraction for PDF/CSV fallback
│   ├── ClaudeRelationshipEngine.ts # Claude relationship classification
│   └── prompts/
│       ├── pdfExtractionPrompt.ts  # System prompt for transaction extraction
│       └── relationshipPrompt.v1.ts# System prompt for relationship matching
├── jobs/
│   ├── queues.ts                   # BullMQ queue definitions
│   ├── parseUploadWorker.ts        # parse-upload job worker
│   └── runMatchWorker.ts           # run-match job worker
└── utils/
    ├── logger.ts                   # Pino logger configuration
    └── metrics.ts                  # Metrics stubs (recordDuration, incrementCounter)
```
