# Benchmarks

> Measured on: GitHub Actions ubuntu-latest, Node v22.0.0, Chromium (Playwright)
> Last updated: 2026-06-30 | neutro/form v0.0.0

## Methodology

Two dimensions: **performance** (ops/sec) and **correctness** (PASS/FAIL).
Three runners: vitest bench (pure JS, Node), vitest test (correctness), Playwright Chromium (production build, no StrictMode).

- **N/A** = library has no equivalent surface
- **FAIL** = correctness test failed; perf number withheld
- **ERROR** = adapter threw at runtime
- **± high** = rme > 10%; result recorded but not used for regression comparisons
- **`*`** = shim used; see footnotes

## Correctness

## Core Performance (Node.js / Tinybench)
