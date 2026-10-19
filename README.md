# Performance Analyzer

[![Tests](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/actions/workflows/test.yml/badge.svg)](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/actions/workflows/test.yml)

A VS Code extension for profiling Python functions and measuring proposed code changes. Compare behavior on supplied inputs, inspect runtime and Python allocation costs, and export a report. Optional GitHub Copilot integration can explain bottlenecks or generate one candidate for review and benchmarking.

**A passing comparison means the supplied cases matched. It does not prove general correctness or a performance improvement.**

## Commands

Open the Command Palette and search for **Performance Analyzer:**.

| Command | What it does | Copilot required |
| --- | --- | --- |
| **Profile File** | Measures one function in the active Python file, including source hotspots and peak traced allocations. | No |
| **Compare File** | Compares the active original with a separate candidate using the same cases. It does not apply changes. | No |
| **Optimize and Compare** | Generates a candidate, opens a diff, benchmarks it after confirmation, and offers an undoable apply if the cases match. | Yes |
| **Ask Copilot** | Opens performance advice in a separate Markdown document without executing the suggestions. | Yes |
| **Export Report** | Saves the current run as JSON or a readable Markdown summary. | No |

The benchmark tools work locally without an AI account. You supply the inputs and expected results; the extension does not automatically generate or run a project-wide test suite.

## Run from source

| Requirement | Details |
| --- | --- |
| Node.js and npm | Node.js 22+ for development. CI uses Node.js 22 and the committed npm lockfile. |
| Python | Python 3.10+; the runner uses the standard library. Install any dependencies imported by your target code in the selected interpreter. |
| VS Code | The manifest declares 1.100.0 or later. The editor suite currently tests 1.138.0. |
| GitHub Copilot | Optional. AI commands need available Copilot models, account access, and a network connection. |

```sh
git clone https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode.git
cd ai-code-performance-analyzer-vscode
npm ci
npm run compile
```

From that directory, launch an Extension Development Host (PowerShell or a POSIX shell):

```sh
code --new-window --extensionDevelopmentPath="$PWD" .
```

Run commands in that new window. Recompile and reload it after changing TypeScript source. If `code` is unavailable, use the full path to your VS Code command-line launcher.

Use a local, saved UTF-8 `.py` file as the original. Benchmarking and Copilot commands require a trusted workspace. Results appear in the **Performance Analyzer** Output channel.

The default Python executable is `python`. Set **Performance Analyzer: Python Path** (`performanceAnalyzer.pythonPath`) in VS Code's user settings to select another interpreter or virtual environment. Supply an executable path, not a shell command or arguments such as `py -3`.

For example, replace this path with your interpreter:

```json
{
  "performanceAnalyzer.pythonPath": "C:\\path\\to\\venv\\Scripts\\python.exe"
}
```

## Try the bundled example

The example removes duplicate integers while preserving their first-occurrence order. The original searches a list for each value; the candidate uses a set for membership and a list for the output. This trades extra memory for average linear-time work.

1. Open [`examples/deduplicate.py`](examples/deduplicate.py) in the development window.
2. Run **Performance Analyzer: Profile File**, select [`examples/deduplicate-benchmark.json`](examples/deduplicate-benchmark.json), and confirm execution.
3. Inspect runtime, function hotspots, and peak traced allocations in the Output channel.
4. Focus `deduplicate.py` again and run **Performance Analyzer: Compare File**. Choose [`examples/deduplicate-fast.py`](examples/deduplicate-fast.py), then the same benchmark JSON, and confirm execution.
5. Run **Performance Analyzer: Export Report** and choose a `.json` or `.md` destination.

The config covers an empty list, duplicates and ordering, an expected invalid-input exception, and 5,000 distinct integers. Short cases may not support a useful speed ratio.

## Create a benchmark configuration

Save this as `benchmark.json` to check the example's `unique` function:

```json
{
  "schemaVersion": 1,
  "function": "unique",
  "repeats": 20,
  "cases": [
    {"name": "empty", "args": [[]], "expected": []},
    {"name": "preserve order", "args": [[3, 1, 3, 2, 1]], "expected": [3, 1, 2]},
    {"name": "reject strings", "args": [[1, "two"]], "expectedError": "ValueError"}
  ]
}
```

- `function` names one top-level synchronous function present in both versions.
- Supply 1-20 cases, each with optional `name`, positional `args`, and keyword `kwargs`.
- `expected` checks the return value and supported types on both versions. Use `expectedError` for an exact exception class name instead; do not combine them.
- Without either expected field, the original's observed behavior is the reference.
- `repeats` is the total timed calls per case per version: 1-50, default 20. Each call gets a fresh deep copy of its inputs.

See [the benchmark protocol](docs/BENCHMARK.md) for the full request and measurement details. The v1 config is shared with [Collab Review](https://github.com/FrOxyz06/realtime-collaborative-coding); use 1-10 repeats when sharing configs with its older runners.

## Use Copilot

Enable GitHub Copilot in the development window and sign in with model access. Both AI commands ask before sending the active file and let you select an available model. Cancel requests from the progress notification.

The extension sends the source snapshot plus its instructions through VS Code's language-model API. It does not include other workspace files, the benchmark config, or reports in that request, and stores no API key. Source is limited to 60,000 characters and must also fit the selected model's token limit.

### Optimize and compare

1. Focus the saved original and run **Performance Analyzer: Optimize and Compare**.
2. Choose a benchmark JSON. Confirm sending the original to Copilot and select a model.
3. Copilot is asked for one complete replacement module. The extension requires a JSON response with a nonempty `code` field and rejects malformed or unchanged output.
4. The candidate is saved beside the original with a unique `.performance-candidate-...py` name. Review the diff, then select **Compare candidate**.
5. Confirm local execution. Both versions run against the supplied cases; inspect runtime, allocation costs, and timing warnings.
6. If the cases match without a runner error, **Apply candidate** offers an undoable replacement of the original editor contents. Review and save, or let your existing VS Code Auto Save setting handle saving.

Applying is optional and does not require a speedup. Changed originals, candidate edits during execution confirmation, and candidate edits after measurement are rejected at the corresponding checks. Save changes and start a new comparison when prompted.

Cancelling after generation leaves the candidate available for review. Candidates are not automatically deleted. If you edit one, save it and use **Compare File** to measure that version. This workflow makes one proposal; it has no autonomous retry or optimization loop.

### Ask for advice only

Run **Performance Analyzer: Ask Copilot** with a Python editor active. Advice opens in a separate Markdown document. It is AI-generated guidance, not measured results. Save suggested code separately and use **Compare File** before adopting it.

## Understand the results

The runner checks supported return values and types, argument mutation, captured stdout/stderr, and expected exception messages. Observations must stay consistent across warm-up, timed, diagnostic, and fresh-process batch calls.

Comparisons distribute the requested samples across up to four fresh-process batches per version, alternating original/candidate order. Profiling uses one batch. Each case has one checked warm-up per batch. Input copying, module loading, and diagnostic calls are excluded from timing; the invocation wrapper is included.

| Report item | Meaning |
| --- | --- |
| Median, range, raw samples, MAD | Observed timings and variation. MAD is median absolute deviation. |
| `too few samples` | Either side has fewer than 10 timed samples. |
| `too short` | Either median is below 0.1 ms, after the sample-count check. |
| `noisy` | Either MAD exceeds 10% of its median, or the central 10th-90th percentile spread exceeds 20%. |
| `measurable` | The timing heuristics passed. Matching cases may report a before/after speed ratio. |
| Hotspots | Up to five source functions ranked by `cProfile` cumulative time, with source line numbers; retained from the first batch. |
| Peak traced allocations | `tracemalloc` peak bytes from a separate call, taking the maximum across batches. This is not whole-process RSS. |

The gates are heuristics, not statistical confidence intervals. Load, caches, and process effects can still change results. A ratio above 1 means the candidate's median was lower in that run.

JSON reports include raw samples, sampling metadata, source/config hashes, timestamp, and Python/OS/machine details; raw source is not included. Markdown exports are readable summaries. An export keeps its selected report even if another run starts while the Save dialog is open. Export a result before starting another run, which clears the current report.

### Historical example

The committed [sample report](examples/sample-report.json) is a historical run from September 19, 2026, on Windows/Python 3.12.14 using the earlier runner and seven timed samples per version. It is retained as evidence, not presented as a result from the current sampling method.

| 5,000 distinct integers | List version | Set version |
| --- | ---: | ---: |
| Median runtime | 84.1196 ms | 0.9355 ms |
| Peak traced allocations | 42,224 bytes | 697,800 bytes |

All four supplied cases passed. The candidate timing was **noisy**, so that report omits a speed ratio. These measurements are specific to that run. Rerun the example to measure your environment.

## Tests and verification

```sh
npm test
npm run test:python
npm run test:editor
```

| Suite | Coverage |
| --- | --- |
| `npm test` | TypeScript compilation, Node-to-Python bridge, commands, Copilot consent/cancellation/errors, candidate parsing and review/apply checks, and report export races. |
| `npm run test:python` | Behavior, mutation/output/exception checks, sampling, timing gates, limits, profiling, and a 500-case seeded oracle check for the deduplication example. |
| `npm run test:editor` | Real VS Code documents, compare/profile/export, candidate workflow, apply, and undo. Dialog responses and Copilot output are automated. |

For the implementation merged in [PR #6](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/pull/6), **13 Node tests, 23 Python tests, and the VS Code workflow passed** in [Windows CI](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/actions/runs/39200511389). **Live Copilot model responses have not yet been verified.** The editor test uses a mocked response and disables AI features in its isolated profile; use a separate signed-in development window for a live check.

The editor launcher downloads VS Code 1.138.0 and uses an isolated profile. On Windows, set `VSCODE_TEST_CACHE` to a short writable path if extraction hits path limits. `TEST_PYTHON` selects the interpreter for the Node bridge and editor tests; `test:python` itself invokes `python`. Linux editor tests need a display, for example `xvfb-run -a npm run test:editor`; configured CI runs on Windows.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Commands missing | Compile and use the window launched with `--extensionDevelopmentPath` pointing to this repository. |
| Open/save or trust error | Focus a saved local `.py` original. Benchmarking and AI commands require a trusted workspace. |
| Python cannot be launched | Set `performanceAnalyzer.pythonPath` to the interpreter executable, without arguments. |
| Missing imported module | Install the dependency in that interpreter. Execution uses the original file's directory. |
| No Copilot models | Check Copilot is enabled and signed in in the development window, with model access. |
| Model quota, network, or token-limit error | Check access/connectivity; select another available model or reduce source size when appropriate. Local profiling/comparison remain available. |
| Invalid candidate JSON | Retry generation or save a candidate manually and use **Compare File**. |
| Original/candidate changed | Save the intended versions and start a fresh comparison. Detected edits invalidate acceptance of measured code. |
| Inconsistent observations | Check for state-dependent or nondeterministic results. Repeated calls and fresh workers must match. |
| Timeout | Reduce cases/repeats or input size. Each worker has up to 5 seconds within a 12-second total runner budget. |
| No speed ratio | Inspect case results and the timing note. Failed, short, noisy, or undersampled comparisons withhold it. |

## Scope and limits

- Synchronous Python functions only, with JSON inputs and finite JSON/tuple outputs. Dictionary keys must be strings. This is not a whole-application or multi-language profiler.
- Only the selected function and supplied cases are checked. Filesystem/network effects, native allocations, and untested inputs are outside those checks.
- Target code runs with local permissions, including imports. Timeouts are not a sandbox and do not isolate filesystem/network access, spawned processes, or memory consumption. Review code before confirming execution.
- Execution uses the original file's directory. Ordinary local imports can work; package-relative imports and exact `__file__` assumptions are unsupported.
- Runner source strings are capped at 200,000 characters each; Copilot uses the smaller limit above. The Node bridge caps input at 1,000,000 UTF-8 bytes and total execution at 15 seconds. Captured Python output is limited to 16,000 characters per stream per call.

## Project layout and maintenance

| Path | Purpose |
| --- | --- |
| [`src/extension.ts`](src/extension.ts) | Commands, source checks, candidate review/apply, and export. |
| [`src/copilot.ts`](src/copilot.ts) | Model selection, consent, streaming, cancellation, and candidate parsing. |
| [`benchmark/`](benchmark/) | Node process bridge and standard-library Python runner. |
| [`examples/`](examples/) | Python examples, configs, and the historical report. |
| [`tests/`](tests/) and [`scripts/`](scripts/) | Unit/integration tests and the editor test launcher. |
| [`docs/BENCHMARK.md`](docs/BENCHMARK.md) | Shared benchmark protocol and measurement details. |
| [`.github/workflows/test.yml`](.github/workflows/test.yml) | Windows CI for all three suites. |

GitHub Actions runs on pushes, pull requests, and manual dispatch. Dependabot checks npm packages and workflow actions weekly, grouping minor/patch updates. Update `package.json` and `package-lock.json` together for dependency changes and run all three test commands.
