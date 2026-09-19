# Performance Analyzer

A VS Code extension for checking whether a Python change actually helps. Profile a function, compare an edited version against test cases, and export the results.

The repository name comes from the original AI assistant idea. This version uses Python profiling and benchmarks; it does not generate AI suggestions.

## Run it

Requires Node.js 22+, Python 3.10+, and VS Code 1.100+.

```sh
npm ci
npm run compile
code --extensionDevelopmentPath="/absolute/path/to/this/repo"
```

Open this repo in the new window. Set **Performance Analyzer: Python Path** if `python` is not on your PATH. Commands are in the Command Palette.

1. Open the saved `deduplicate.py` file.
2. Run **Performance Analyzer: Profile File** and choose `deduplicate-benchmark.json`.
3. Read the slowest functions, line numbers, runtime samples, and peak Python allocations in the output panel.
4. Focus `deduplicate.py` again. Run **Performance Analyzer: Compare File**, choose `deduplicate-fast.py`, then the same config.
5. Run **Performance Analyzer: Export Report** to save JSON or Markdown.

Review the selected code before approving execution. These commands run code locally with your permissions.

## Example result

The example removes duplicate integers while preserving order. The first version searches a list for every item; the second uses a set for membership and a list for the output. That trades extra memory for average linear-time work.

One local Windows/Python 3.12.14 run on 5,000 distinct integers produced these medians over seven timed calls:

| Measurement | List version | Set version |
| --- | ---: | ---: |
| Runtime | 84.1196 ms | 0.9355 ms |
| Peak traced allocation | 42,224 bytes | 697,800 bytes |

All four cases passed, including an empty list, order/duplicates, and an expected invalid-input exception. The candidate timing was flagged **noisy**, so the report deliberately omits a speedup claim. These are one machine's measurements, not a guaranteed improvement. See [the raw report](sample-report.json) for samples, hashes, environment, and variation. Tests also check both implementations against an independent oracle on 500 seeded random inputs.

## How it works

TypeScript handles VS Code commands. A small Node bridge starts the standard-library Python runner. Each source runs in a separate process. The runner checks return types/values, input mutation, captured output, expected exceptions, and consistency across repeated calls.

Timing excludes input copying and module loading. Profiling (`cProfile`) and allocation measurement (`tracemalloc`) run separately so their overhead is excluded from runtime samples. Allocations are Python-traced peak bytes, not total process memory. Reports keep raw samples and flag short or noisy timings.

[Collab Review](https://github.com/FrOxyz06/realtime-collaborative-coding) uses the same runner and config to check proposed changes before acceptance. See [BENCHMARK.md](BENCHMARK.md).

## Tests

```sh
npm test
npm run test:python
npm run test:editor
```

The last command downloads VS Code 1.138.0 and runs the actual compare, profile, and export commands in an isolated editor profile. Dialog answers are automated. On Linux use `xvfb-run -a npm run test:editor`. On Windows, use a short `VSCODE_TEST_CACHE` path if the download exceeds path limits. `TEST_PYTHON` can select a Python executable for editor tests.

## Limits

Synchronous Python functions with JSON inputs and JSON/tuple outputs only. This is not a sandbox or proof of equivalence for untested inputs. Timing order is fixed (original first), and results can change with machine load. Filesystem/network effects and native allocations are outside the checks. Five-second worker limits bound small examples, not the risks of untrusted code.
