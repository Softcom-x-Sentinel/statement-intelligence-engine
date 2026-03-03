import fetch from "node-fetch";
import { z } from "zod";
import { env } from "@config/env";
import { logger } from "@utils/logger";
import { CandidatePair } from "@matching/candidateGenerator";
import { RELATIONSHIP_PROMPT_V1 } from "./prompts/relationshipPrompt.v1";

export interface ClaudeMatchResult {
  pairId: string;
  relationshipType: "transfer" | "duplicate" | "refund" | "fee_link" | "unrelated";
  confidence: number;
  reason: string;
}

export interface MatchBatchConfig {
  model: string;
  promptVersion: string;
  minConfidence: number;
  maxRetries?: number;
}

const ResultSchema = z.object({
  pairId: z.string(),
  relationshipType: z.enum(["transfer", "duplicate", "refund", "fee_link", "unrelated"]),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

const ResponseSchema = z.object({
  results: z.array(ResultSchema)
});

const getSystemPrompt = (promptVersion: string): string => {
  switch (promptVersion) {
    case "PROMPT_VERSION_1":
    default:
      return RELATIONSHIP_PROMPT_V1.system;
  }
};

const extractJson = (text: string): any => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Unable to locate JSON object in Claude response");
  }
  const jsonSlice = text.slice(start, end + 1);
  return JSON.parse(jsonSlice);
};

export class ClaudeRelationshipEngine {
  async matchPairs(
    pairs: CandidatePair[],
    config: MatchBatchConfig
  ): Promise<ClaudeMatchResult[]> {
    if (pairs.length === 0) return [];

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
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.claudeApiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Claude API error: ${res.status} ${res.statusText} - ${text}`);
        }

        const json: any = await res.json();
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
      } catch (err) {
        lastError = err;
        attempt += 1;
        logger.error(
          { err, attempt, maxRetries, pairCount: pairs.length },
          "Claude matchPairs call failed"
        );
        if (attempt > maxRetries) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unknown Claude error");
  }
}

export const claudeRelationshipEngine = new ClaudeRelationshipEngine();

