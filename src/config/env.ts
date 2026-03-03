import dotenv from "dotenv";

dotenv.config();

const required = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(process.env.DATABASE_URL, "DATABASE_URL"),
  redisUrl: required(process.env.REDIS_URL, "REDIS_URL"),
  uploadsDir: process.env.UPLOADS_DIR ?? "data/uploads",
  apiKeys: (process.env.API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean),
  claudeApiKey: required(process.env.CLAUDE_API_KEY, "CLAUDE_API_KEY"),
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest",
  claudePromptVersion: process.env.CLAUDE_PROMPT_VERSION ?? "PROMPT_VERSION_1"
};

