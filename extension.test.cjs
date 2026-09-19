const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

test('comparison command enforces trust and passes the shared benchmark request', async () => {
    let command, action, errors = [], selected = [], calls = 0, shown = false;
    const original = fs.readFileSync('example.py', 'utf8');
    const vscode = {
        workspace: { isTrusted: false, getConfiguration: () => ({ get: () => 'python' }) },
        window: {
            activeTextEditor: { document: { uri: { scheme: 'file' }, fileName: path.resolve('example.py'), isDirty: false, getText: () => original } },
            createOutputChannel: () => ({ clear() {}, appendLine() {}, show() { shown = true; }, dispose() {} }),
            showErrorMessage: text => errors.push(text), showWarningMessage: async () => 'Run trusted code',
            showOpenDialog: async () => selected.shift()
        },
        commands: { registerCommand: (id, callback) => { command = id; action = callback; return { dispose() {} }; } }
    };
    const load = Module._load;
    Module._load = function (name, ...args) {
        if (name === 'vscode') return vscode;
        if (name === '../benchmark.cjs') return { report: () => 'report', runBenchmark: async (python, request) => {
            calls++; assert.equal(request.schemaVersion, 1); assert.equal(request.before, original);
            assert.equal(request.after, fs.readFileSync('candidate.py', 'utf8'));
            return { passed: true, cases: [] };
        } };
        return load.call(this, name, ...args);
    };
    try {
        require('./out/extension.js').activate({ subscriptions: [] });
        assert.equal(command, require('./package.json').contributes.commands[0].command);
        await action(); assert.match(errors.pop(), /trusted/); assert.equal(calls, 0);
        vscode.workspace.isTrusted = true;
        selected = [undefined]; await action(); assert.equal(calls, 0);
        selected = [[{ fsPath: path.resolve('candidate.py') }], [{ fsPath: path.resolve('benchmark.json') }]];
        await action(); assert.equal(calls, 1); assert.equal(shown, true); assert.deepEqual(errors, []);
    } finally { Module._load = load; }
});
