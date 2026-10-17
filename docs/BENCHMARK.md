# Shared benchmark format (v1)

Performance Analyzer uses a standard-library Python runner and Node bridge. The v1 request format remains compatible with Collab Review; sampling implementations may differ by extension version. Older Collab Review runners accept only 1–10 repeats; use that range for configs shared with them.

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

`function` names a top-level synchronous function. Supply 1-20 cases, each with optional `args`, `kwargs`, and `name`. `repeats` is 1-50 (default 20), specifying the total timed calls per case per version. Older configs with 1-10 calls remain valid. Each call gets a fresh deep copy of its inputs. Use `expected` for an independent expected return value, or `expectedError` for an exact exception class name; never both. Without either, the original is the reference.

The bridge adds `before`/`after` source text and `mode` (`compare` by default, or `profile`). The result retains `schemaVersion`, `passed`, and `cases`. Comparison cases include `beforeMs`, `afterMs`, nested `before`/`after` measurements, and `timingNote`. Profile cases contain measurements directly. Failures can instead contain `passed: false` and `error`.

## Checks and measurements

Each comparison uses up to four batches per version, each in a fresh process. Batch order alternates original/candidate then candidate/original. Exact sample counts are distributed across batches; a one-sample config has only one round. Profile mode uses one process. Return values/types, positional and keyword argument mutation, stdout, stderr, and expected exception messages must agree. Warm-up, timed, and diagnostic calls must give consistent observations. Supported returned values are finite JSON values and tuples; dictionary keys must be strings.

One checked warm-up per case per batch is excluded. Observations must also agree across batches. Runtime samples include the function invocation wrapper, excluding input copying, result comparison, and module loading. Reports include median, minimum, maximum, raw samples, and median absolute deviation (MAD). Separate calls gather the five largest cumulative-time source functions with `cProfile`, and peak Python-traced allocation with `tracemalloc`. These instrumented calls do not contribute timing samples. Reports retain hotspots from the first batch and the maximum peak allocation across batches. Peak bytes are not process RSS or all native allocations.

A comparison is labeled `too few samples` when either side has fewer than 10 samples, then `too short` when either median is below 0.1 ms. Otherwise it is `noisy` if either MAD exceeds 10% of its median or its central 10th–90th percentile sample spread exceeds 20% of the median (using outward nearest sample indices). A speed ratio appears only for passing, measurable comparisons. These gates are heuristics, not confidence intervals or a guarantee of improvement. Alternating order reduces fixed-order bias but does not eliminate load, cache or process effects. There is no speed threshold for accepting candidates; review the measured tradeoffs first.

The additive `measurement` report field records the sampling method, execution order, samples per side, warm-ups per batch and diagnostic aggregation. Each set of measurements includes `sampleCount`. Existing saved reports are historical and are not rewritten.

JSON exports include recording time, Python/OS/machine, source SHA-256 hashes, and a config hash so results can be traced to inputs. Raw source is not included. Markdown export is a readable summary.

## Limits

Each worker has up to five seconds for all cases, repeats, and diagnostics, within a twelve-second total runner budget. Slow functions or large configurations may need fewer cases/repeats. Source text is capped at 200,000 characters, the input at 1,000,000 characters, and captured Python output at 16,000 characters per call. The Node bridge also caps output and execution time. Functions run in the original file's directory; normal local imports can work, but package-relative imports and exact `__file__` assumptions are unsupported.

This is a timeout wrapper, not a sandbox. It does not isolate filesystem/network access, native writes, spawned processes, or memory consumption. Run only trusted code, including imports. Passing cases do not prove behavior on every input.
