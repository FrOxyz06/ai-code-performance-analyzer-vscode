# Performance Analyzer

[![Tests](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/actions/workflows/test.yml/badge.svg)](https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode/actions/workflows/test.yml)

Improve Python code in VS Code: find bottlenecks, generate a candidate with GitHub Copilot, and compare its behavior, runtime, and memory allocations before applying it.

Profiling and comparison work locally without Copilot. You provide the function's test inputs; matching those cases does not prove correctness on every input or guarantee a speedup.

## Quick start

Install **Node.js 22+**, **Python 3.10+**, and **VS Code 1.100.0+**, then run:

```sh
git clone https://github.com/FrOxyz06/ai-code-performance-analyzer-vscode.git
cd ai-code-performance-analyzer-vscode
npm ci
code .
```

Press **F5** and select **Run Performance Analyzer** if prompted. VS Code compiles the extension and opens an **Extension Development Host**. Use the commands in that new window. Stop and relaunch it after source changes.

If the `code` command is unavailable, open the cloned folder through VS Code's **File > Open Folder** menu.

The default interpreter is `python`. To use a virtual environment or another installation, set **Performance Analyzer: Python Path** in VS Code's user settings to its executable path. Do not include arguments such as `py -3`. Install your code's dependencies in that interpreter.

## Try it without AI

The bundled example removes duplicate integers while keeping their original order.

1. In the development window, open [`examples/deduplicate.py`](examples/deduplicate.py).
2. Open the Command Palette (**Ctrl+Shift+P** on Windows/Linux, **Cmd+Shift+P** on macOS). Run **Performance Analyzer: Profile File**, choose [`deduplicate-benchmark.json`](examples/deduplicate-benchmark.json), and confirm execution.
3. Focus `deduplicate.py` again. Run **Performance Analyzer: Compare File**, choose [`deduplicate-fast.py`](examples/deduplicate-fast.py), then the same benchmark JSON.
4. Read the **Performance Analyzer** Output channel. Run **Performance Analyzer: Export Report** to save JSON or Markdown.

The fast file is a prewritten reference candidate. It uses extra memory to avoid repeated list searches. The demo checks empty input, ordering, invalid input, and 5,000 distinct integers. Run it on your machine to see the measured tradeoff.

## Optimize your own code

Use a saved local UTF-8 `.py` file in a trusted workspace. Create a benchmark JSON naming a top-level synchronous function and representative inputs. For example, this checks `unique` in the bundled demo:

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

Change the function name, inputs, and expected results for your own code. See the [benchmark reference](docs/BENCHMARK.md) for keyword arguments, supported values, and limits.

To generate an improvement:

1. Enable GitHub Copilot and sign in with model access in the development window.
2. Focus your original file and run **Performance Analyzer: Optimize and Compare**. Select the benchmark JSON, approve sending the file, and choose a model.
3. Review the generated candidate in the diff. Choose **Compare candidate**, then confirm execution.
4. Inspect the results. If the supplied cases match, **Apply candidate** offers an undoable edit. Apply only when the measured tradeoffs suit your needs, then save.

Copilot receives the active file's source and instructions, without other workspace files, benchmark inputs, or reports. The extension stores no API key. Each run generates one candidate; it does not automatically retry or generate tests.

Candidates remain beside the original as `*.performance-candidate-*.py`. You can keep or delete them yourself. After editing a candidate, save it and use **Compare File** to measure the new version.

## Commands

Search for **Performance Analyzer:** in the Command Palette.

| Command | Purpose | Copilot |
| --- | --- | --- |
| **Optimize and Compare** | Generate, review, benchmark, and optionally apply a candidate. | Required |
| **Ask Copilot** | Open performance advice in a separate document. Suggestions are not executed. | Required |
| **Profile File** | Measure the active function and inspect its hotspots. | Optional |
| **Compare File** | Compare the original with a candidate you select; does not apply it. | Optional |
| **Export Report** | Save the current result as JSON or Markdown. | Optional |

## Read the results

- **PASS** means the supplied case matched, including supported return types, input mutation, and captured output.
- **Runtime** is the observed median. A speed ratio appears only when a passing comparison clears the timing checks.
- **Peak traced allocations** measure Python allocations, not total process memory.
- **Hotspots** identify source functions with the highest cumulative profiled time.

Export before starting another run, which clears the current report. See [measurement details and timing warnings](docs/BENCHMARK.md#measurements) and the [historical example](docs/BENCHMARK.md#historical-example).

Target code and its imports execute with your local permissions. Timeouts do not sandbox it. Checks cover the chosen function and supplied inputs, not a whole application or its filesystem/network side effects.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Commands missing | Run `npm ci`, press F5, and use the new development window. |
| Python cannot launch or imports fail | Set the interpreter executable in **Performance Analyzer: Python Path** and install dependencies there. |
| No Copilot models, quota, or network errors | Check Copilot access in the development window. Local profiling and comparison remain available. |
| File changed or has unsaved edits | Save the intended original/candidate and start a fresh comparison. |
| Invalid candidate response | Retry generation or save a candidate manually and use **Compare File**. |
| Timeout or inconsistent results | Reduce inputs/repeats for slow code; check for state-dependent behavior. |
| No speed ratio | Check for failed cases, too few samples, very short runtimes, or noisy timings. |

## Development

```sh
npm test
npm run test:python
npm run test:editor
```

These run compilation and Node tests, Python tests, and the VS Code integration workflow. The editor suite exercises real documents, Python execution, export, apply, and undo with automated dialogs and a mocked Copilot response. **Live Copilot responses have not yet been verified.**

The editor tests download VS Code 1.138.0 into an isolated cache/profile. On Windows, set `VSCODE_TEST_CACHE` to a short writable path if extraction hits path limits. Set `TEST_PYTHON` to select the interpreter for Node/editor tests; `test:python` uses `python`. Linux editor tests need a display, such as `xvfb-run -a npm run test:editor`. CI runs all three suites on Windows.

| Location | Purpose |
| --- | --- |
| `src/` | VS Code commands and Copilot integration. |
| `benchmark/` | Node process bridge and standard-library Python runner. |
| `examples/` | Runnable demos, test fixtures, and a historical report. |
| `tests/`, `scripts/` | Automated checks and the editor test launcher. |
| `docs/BENCHMARK.md` | Configuration, measurement rules, and execution limits. |

Keep `package.json` and `package-lock.json` together when updating dependencies. `node_modules/`, `out/`, and test caches are generated and ignored by Git. Extension packaging runs compilation first and excludes development files and the historical report.
