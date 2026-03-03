import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@config/env";

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null
});

export const parseUploadQueue = new Queue("parse-upload", {
  connection
});

export const runMatchQueue = new Queue("run-match", {
  connection
});

