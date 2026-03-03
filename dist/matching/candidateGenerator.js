"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCandidatePairs = void 0;
const DEFAULT_CONFIG = {
    dateWindowDays: 5,
    amountToleranceAbsolute: 0.01,
    amountToleranceRelative: 0.005,
    maxPairsPerRun: 10000,
    enableTextFilter: true
};
const STOP_WORDS = new Set([
    "payment",
    "pos",
    "card",
    "bank",
    "transaction",
    "debit",
    "credit"
]);
const toTokens = (description) => {
    return new Set(description
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t)));
};
const amountsWithinTolerance = (a, b, absTol, relTol) => {
    const absA = Math.abs(a);
    const absB = Math.abs(b);
    const diff = Math.abs(absA - absB);
    if (diff <= absTol)
        return true;
    const maxAbs = Math.max(absA, absB);
    if (maxAbs === 0)
        return diff === 0;
    return diff / maxAbs <= relTol;
};
const generateCandidatePairs = (transactions, userConfig) => {
    const config = { ...DEFAULT_CONFIG, ...userConfig };
    const byCurrency = new Map();
    for (const tx of transactions) {
        const list = byCurrency.get(tx.currency) ?? [];
        list.push(tx);
        byCurrency.set(tx.currency, list);
    }
    const pairs = [];
    for (const [currency, txs] of byCurrency.entries()) {
        const sorted = [...txs].sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
        const tokensCache = new Map();
        for (let i = 0; i < sorted.length; i++) {
            const a = sorted[i];
            for (let j = i + 1; j < sorted.length; j++) {
                const b = sorted[j];
                const dayDiff = Math.abs(Math.floor((b.postedAt.getTime() - a.postedAt.getTime()) / (1000 * 60 * 60 * 24))) || 0;
                if (dayDiff > config.dateWindowDays) {
                    // Further transactions will only be later in time, so break.
                    break;
                }
                if (!amountsWithinTolerance(a.amount, b.amount, config.amountToleranceAbsolute, config.amountToleranceRelative)) {
                    continue;
                }
                if (config.enableTextFilter) {
                    const tokensA = tokensCache.get(a.id) ?? toTokens(a.descriptionNorm);
                    const tokensB = tokensCache.get(b.id) ?? toTokens(b.descriptionNorm);
                    tokensCache.set(a.id, tokensA);
                    tokensCache.set(b.id, tokensB);
                    const hasOverlap = [...tokensA].some((t) => tokensB.has(t));
                    if (!hasOverlap)
                        continue;
                }
                const [txAId, txBId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
                const pairId = `${txAId}:${txBId}`;
                pairs.push({
                    pairId,
                    txAId,
                    txBId,
                    amountA: a.amount,
                    amountB: b.amount,
                    currency,
                    postedAtA: a.postedAt.toISOString(),
                    postedAtB: b.postedAt.toISOString(),
                    descriptionNormA: a.descriptionNorm,
                    descriptionNormB: b.descriptionNorm
                });
                if (pairs.length >= config.maxPairsPerRun) {
                    return pairs;
                }
            }
        }
    }
    return pairs;
};
exports.generateCandidatePairs = generateCandidatePairs;
