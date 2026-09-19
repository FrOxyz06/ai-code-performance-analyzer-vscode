# Performance Analyzer for VS Code

Compare two versions of a Python function using the same inputs. The extension checks behavior and reports median runtime for each case.

This is an early local benchmark tool. AI suggestions, memory profiling, automatic optimization, and line-level hotspots are not implemented.

## Setup

Requires Node.js 22+, Python 3.10+, and VS Code 1.100+.

```sh
npm ci
npm run compile
code --extensionDevelopmentPath="/absolute/path/to/this/repo"
```

Replace the path with your checkout. In the new VS Code window, open this repo and `example.py`. Set **Performance Analyzer: Python Path** if the Python executable is not available as `python`.

## Compare a change

1. Open and save the original Python file.
2. Run **Performance Analyzer: Compare File** from the Command Palette.
3. Pick `candidate.py`, then `benchmark.json`.
4. Review the code before approving execution. Results appear in **Performance Comparison**.

The command compares source snapshots and does not edit either file. The old `performanceAnalyzer.analyzeFile` command ID is retained for compatibility.

## Collab compatibility

[Collab Review](https://github.com/FrOxyz06/realtime-collaborative-coding) uses the same runner and test configuration before accepting a proposal. Copy a `benchmark.json` between the projects without changing its format. See [BENCHMARK.md](BENCHMARK.md).

## Tests

```sh
npm test
npm run test:python
```

Node tests check the command with a VS Code mock and run the real Python bridge. Python tests cover behavior comparisons, input validation, failures, and timeouts.

## Limits

Synchronous top-level Python functions with JSON inputs. Measurements are small local samples, so tiny differences may be noise. Passing cases do not prove equivalence for every input or external side effect. Code runs locally with your permissions, not in a sandbox. No code runs automatically when a file is opened.
