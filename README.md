# Performance Analyzer for VS Code

An early extension scaffold for a code performance analyzer.

**Current state:** the Analyze File command loads and displays a notification. Profiling, benchmarks, memory measurements, AI suggestions, and before/after comparisons are not implemented yet.

## Run

Requires Node.js 22+ and VS Code 1.100+.

```sh
npm ci
npm run compile
code --extensionDevelopmentPath="/absolute/path/to/this/repo"
```

Replace the path with your local checkout. In the Extension Development Host, open the Command Palette and run **Performance Analyzer: Analyze File**. It should display "Performance Analyzer is running!". The command does not analyze the current file yet.

## Check

```sh
npm test
```

This compiles the TypeScript and tests command registration, notification, and cleanup with a small VS Code API mock. It is not a full Extension Development Host test.

## Next step

Read the active Python file, then add one profiling command before expanding the UI. Keep results measurable and test changes before applying them.
