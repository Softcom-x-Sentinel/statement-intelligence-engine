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
            max_tokens: 1024,
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
        let attempt = 0;
        let lastError;
        while (attempt <= maxRetries) {
            try {
                const res = await (0, node_fetch_1.default)("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-api-key": env_1.env.claudeApiKey,
                        "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Claude API error: ${res.status} ${res.statusText} - ${text}`);
                }
                const json = await res.json();
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
            catch (err) {
                lastError = err;
                attempt += 1;
                logger_1.logger.error({ err, attempt, maxRetries, pairCount: pairs.length }, "Claude matchPairs call failed");
                if (attempt > maxRetries) {
                    throw err;
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error("Unknown Claude error");
    }
}
exports.ClaudeRelationshipEngine = ClaudeRelationshipEngine;
exports.claudeRelationshipEngine = new ClaudeRelationshipEngine();
