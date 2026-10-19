# Benchmark reference

[Back to the README](../README.md)

Performance Analyzer measures one top-level synchronous Python function at a time using a standard-library runner and Node bridge. This page defines configuration, checks, report fields, and limits.

## Configuration

```json
{
  "schemaVersion": 1,
  "function": "total",
  "repeats": 20,
  "cases": [
    {"name": "mixed values", "args": [[1, -2, 3]], "expected": 2}
  ]
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Use `1`. |
| `function` | Name of a top-level synchronous function present in both versions. |
| `repeats` | Total timed calls per case per version: 1-50, default 20. |
| `cases` | 1-20 cases. Use representative inputs and edge cases. |
| `cases[].name` | Optional readable label. |
| `cases[].args` | Optional array of positional arguments. |
| `cases[].kwargs` | Optional object of keyword arguments. |
| `cases[].expected` | Independent expected return value, checked against both versions. |
| `cases[].expectedError` | Exact expected exception class name, such as `ValueError`. |

Use either `expected` or `expectedError`, never both. Without either, the original's observed behavior is the reference. Each call receives a fresh deep copy of its inputs.

Inputs must be JSON values. Supported returned values are finite JSON values and tuples; dictionary keys must be strings. The runner checks supported types as well as values.

The v1 request format is shared with [Collab Review](https://github.com/FrOxyz06/realtime-collaborative-coding). Sampling implementations may differ; use 1-10 repeats for compatibility with its older runners.

## Correctness checks

The runner compares return values/types, positional and keyword argument mutation, captured stdout/stderr, and expected exception messages. Observations must remain consistent across warm-up, timed, diagnostic, and fresh-process batch calls.

Passing means these checks matched on the supplied inputs. It does not prove correctness on untested inputs or cover filesystem/network side effects. Applying a candidate has no speed threshold: review runtime and allocation tradeoffs before accepting it.

## Measurements

Comparisons use up to four fresh-process batches per version. The order alternates original/candidate, then candidate/original. The requested sample count is distributed across batches; a one-sample config uses only one round. Profile mode uses one process.

Each case has one checked warm-up per batch. Timings include the invocation wrapper and exclude warm-up, input copying, module loading, and result checking. Separate diagnostic calls collect profiling and allocation data; those calls do not contribute timing samples.

| Measurement | Meaning |
| --- | --- |
| Median, minimum, maximum, raw samples | Observed runtime and its range. |
| MAD | Median absolute deviation, a measure of sample variation. |
| Hotspots | Up to five source functions ranked by `cProfile` cumulative time, with line numbers. Retained from the first batch. |
| Peak traced allocations | `tracemalloc` peak bytes from a separate call; maximum across batches. Excludes whole-process RSS and untraced native allocations. |

Timing checks are applied in this order:

| Timing note | Condition |
| --- | --- |
| `too few samples` | Either version has fewer than 10 timed samples. |
| `too short` | Either median is below 0.1 ms. |
| `noisy` | Either MAD exceeds 10% of its median, or its central 10th-90th percentile spread exceeds 20% of the median, using outward nearest sample indices. |
| `measurable` | The checks above passed. |

A speed ratio is reported only for passing, measurable comparisons. It is original median / candidate median; above 1 means the candidate was faster in that run. These checks are heuristics, not confidence intervals. Alternating order reduces fixed-order bias but cannot eliminate machine load, cache, or process effects.

## Reports

The bridge adds `before`/`after` source text and `mode` (`compare` by default, or `profile`) to the request.

Results retain `schemaVersion`, `passed`, and `cases`. Comparison cases include `beforeMs`, `afterMs`, nested `before`/`after` measurements, and `timingNote`. Profile cases contain measurements directly. Runner failures may instead contain `passed: false` and `error`.

The `measurement` field records the sampling method, execution order, samples per side, warm-ups per batch, and diagnostic aggregation. Measurements include `sampleCount`.

JSON exports contain raw timing samples, recording time, Python/OS/machine details, source SHA-256 hashes, and a configuration hash. They do not include raw source. Markdown exports are readable summaries. An export retains its selected report if another run starts while the Save dialog is open.

## Execution limits

| Limit | Value |
| --- | --- |
| Python version | 3.10+ |
| Cases / timed calls per case | 1-20 / 1-50 |
| Source per version | 200,000 characters |
| Python request input | 1,000,000 characters |
| Node bridge request input | 1,000,000 UTF-8 bytes |
| Worker / total runner budget | Up to 5 seconds / 12 seconds |
| Node bridge timeout | 15 seconds |
| Captured Python stdout/stderr | 16,000 characters per stream per call |

The Node bridge also caps output. Reduce inputs, cases, or repeats if a run exceeds its budget.

Execution uses the original file's directory. Ordinary local imports can work; package-relative imports and exact `__file__` assumptions are unsupported. Target code and imports run with local permissions. The timeout wrapper does not isolate filesystem/network access, native writes, spawned processes, or memory consumption.

## Copilot candidates

AI requests send the source snapshot and instructions through VS Code's language-model API. Source is limited to 60,000 characters and must fit the selected model's input-token limit. The extension accepts one complete JSON object with one nonempty `code` field, optionally inside a JSON code fence, and rejects malformed or unchanged candidates.

Generated files remain beside the original. Review, execution, and applying are separate steps. The extension checks for changed originals, unsaved candidates, candidate changes during execution confirmation, and candidate changes after measurement before applying. Apply is an undoable editor replacement; saving follows the user's action or existing Auto Save setting.

## Historical example

The [saved sample report](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/blob/main/examples/sample-report.json) records a September 19, 2026 run on Windows/Python 3.12.14 with the earlier runner and seven timed samples per version. It is preserved unchanged, separately from the current measurement method.

| 5,000 distinct integers | List version | Set version |
| --- | ---: | ---: |
| Median runtime | 84.1196 ms | 0.9355 ms |
| Peak traced allocations | 42,224 bytes | 697,800 bytes |

All four supplied cases passed, but the candidate timing was noisy, so that report omitted a speed ratio. These are measurements from that run only; rerun the demo for current results.

The implementation merged in [PR #6](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/pull/6) passed 13 Node tests, 23 Python tests, and the editor workflow in [Windows CI](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/actions/runs/39200511389). That editor workflow mocked the AI response; it did not verify live Copilot generation.
