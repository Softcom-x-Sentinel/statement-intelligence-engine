"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeRelationshipEngine = exports.ClaudeRelationshipEngine = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const zod_1 = require("zod");
const env_1 = require("@config/env");
const logger_1 = require("@utils/logger");
const relationshipPrompt_v1_1 = require("./prompts/relationshipPrompt.v1");
const ResultSchema = zod_1.z.object({
    pairId: zod_1.z.string(),
    relationshipType: zod_1.z.enum(["transfer", "duplicate", "refund", "fee_link", "unrelated"]),
    confidence: zod_1.z.number().min(0).max(1),
    reason: zod_1.z.string()
});
const ResponseSchema = zod_1.z.object({
    results: zod_1.z.array(ResultSchema)
});
const getSystemPrompt = (promptVersion) => {
    switch (promptVersion) {
        case "PROMPT_VERSION_1":
        default:
            return relationshipPrompt_v1_1.RELATIONSHIP_PROMPT_V1.system;
    }
};
const extractJson = (text) => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        throw new Error("Unable to locate JSON object in Claude response");
    }
    const jsonSlice = text.slice(start, end + 1);
    return JSON.parse(jsonSlice);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Network errors that are safe to retry (transient TLS/connection blips)
const RETRIABLE_CODES = new Set(["EPROTO", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"]);
class ClaudeRelationshipEngine {
    async matchPairs(pairs, config) {
        if (pairs.length === 0)
            return [];
        const systemPrompt = getSystemPrompt(config.promptVersion);
        const payload = {
            pairs: pairs.map((p) => ({
                pairId: p.pairId,
                amountA: p.amountA,
                amountB: p.amountB,
                currency: p.currency,
                postedAtA: p.postedAtA,
                postedAtB: p.postedAtB,
                descriptionA: p.descriptionNormA,
                descriptionB: p.descriptionNormB
            }))
        };
        const body = {
            model: config.model,
            max_tokens: 8192,
            temperature: 0,
            system: systemPrompt,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(payload)
                        }
                    ]
                }
            ]
        };
        const maxRetries = config.maxRetries ?? 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let res;
            try {
                res = await (0, node_fetch_1.default)("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-api-key": env_1.env.claudeApiKey,
                        "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify(body)
                });
            }
            catch (networkErr) {
                if (attempt === maxRetries || !RETRIABLE_CODES.has(networkErr.code)) {
                    throw networkErr;
                }
                const waitMs = Math.pow(2, attempt) * 2000;
                logger_1.logger.warn({ attempt, waitMs, code: networkErr.code, message: networkErr.message, pairCount: pairs.length }, `Network error calling Claude (${networkErr.code}). Retrying in ${waitMs / 1000}s.`);
                await sleep(waitMs);
                continue;
            }
            if (res.status === 429) {
                if (attempt === maxRetries) {
                    const errText = await res.text();
                    throw new Error(`Claude API error: 429 Too Many Requests - ${errText}`);
                }
                const retryAfterSec = Number(res.headers.get("retry-after") ?? "60");
                const waitMs = retryAfterSec * 1000;
                logger_1.logger.warn({ attempt, waitMs, pairCount: pairs.length }, `Claude rate-limited (429). Waiting ${retryAfterSec}s before retry.`);
                await sleep(waitMs);
                continue;
            }
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Claude API error: ${res.status} ${res.statusText} - ${errText}`);
            }
            const json = await res.json();
            if (json.stop_reason === "max_tokens") {
                throw new Error("Claude matchPairs response was truncated at max_tokens. Reduce batch size or increase max_tokens.");
            }
            const content = Array.isArray(json.content) && json.content[0]?.text
                ? json.content[0].text
                : typeof json.content === "string"
                    ? json.content
                    : JSON.stringify(json);
            const parsedRaw = extractJson(content);
            const parsed = ResponseSchema.parse(parsedRaw);
            return parsed.results
                .filter((r) => r.confidence >= config.minConfidence)
                .map((r) => ({
                pairId: r.pairId,
                relationshipType: r.relationshipType,
                confidence: r.confidence,
                reason: r.reason
            }));
        }
        // Unreachable, but satisfies TypeScript
        throw new Error("Unknown Claude error");
    }
}
exports.ClaudeRelationshipEngine = ClaudeRelationshipEngine;
exports.claudeRelationshipEngine = new ClaudeRelationshipEngine();
