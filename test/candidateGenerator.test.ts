import { generateCandidatePairs, MatchableTransaction } from "../src/matching/candidateGenerator";

const makeTx = (id: string, date: string, amount: number, description: string): MatchableTransaction => ({
  id,
  statementId: "stmt-1",
  postedAt: new Date(date),
  amount,
  currency: "USD",
  descriptionNorm: description.toLowerCase()
});

// Simple smoke test that can be run with ts-node or any test runner.
async function main() {
  const txs: MatchableTransaction[] = [
    makeTx("a", "2024-01-01", -100, "Transfer to savings"),
    makeTx("b", "2024-01-02", 100, "Transfer from checking"),
    makeTx("c", "2024-02-01", -10, "Coffee shop")
  ];

  const pairs = generateCandidatePairs(txs, {
    dateWindowDays: 5,
    amountToleranceAbsolute: 0.01,
    amountToleranceRelative: 0.01,
    maxPairsPerRun: 10,
    enableTextFilter: true
  });

  // Expect at least one candidate between a and b.
  const hasTransferLikePair = pairs.some(
    (p) =>
      (p.txAId === "a" && p.txBId === "b") ||
      (p.txAId === "b" && p.txBId === "a")
  );

  if (!hasTransferLikePair) {
    // eslint-disable-next-line no-console
    console.error("Expected at least one candidate pair between a and b");
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("candidateGenerator smoke test passed with", pairs.length, "pairs");
}

// Only run if invoked directly (node test/candidateGenerator.test.js via ts-node, etc.)
// eslint-disable-next-line no-restricted-syntax
if (require.main === module) {
  // eslint-disable-next-line no-floating-promises
  main();
}

