// Minimal metrics stub to make it easy to add real monitoring later
// without changing core business logic.

type Labels = Record<string, string | number>;

export const recordDuration = (metricName: string, _durationMs: number, _labels?: Labels) => {
  // no-op for now
};

export const incrementCounter = (metricName: string, _labels?: Labels) => {
  // no-op for now
};

