"use strict";
// Minimal metrics stub to make it easy to add real monitoring later
// without changing core business logic.
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementCounter = exports.recordDuration = void 0;
const recordDuration = (metricName, _durationMs, _labels) => {
    // no-op for now
};
exports.recordDuration = recordDuration;
const incrementCounter = (metricName, _labels) => {
    // no-op for now
};
exports.incrementCounter = incrementCounter;
