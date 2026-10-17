const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function harness(options = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'performance-workflow-'));
    const before = 'def f(x): return sum([n for n in x])\n';
    const after = 'def f(x): return sum(x)\n';
    const file = path.join(root, 'original.py');
    const config = path.join(root, 'benchmark.json');
    await fs.writeFile(file, before);
    await fs.writeFile(config, JSON.stringify({ schemaVersion: 1, function: 'f', cases: [{ args: [[1, 2]], expected: 3 }] }));
    const uri = name => ({ scheme: 'file', fsPath: name, toString: () => name });
    const doc = { uri: uri(file), fileName: file, version: 1, isDirty: false, isClosed: false,
        getText: () => doc.text, positionAt: value => value, text: before };
    const state = { errors: [], commands: new Map(), sent: 0, runs: 0, applies: 0, diffs: 0, candidate: undefined, reviews: 0 };
    const api = {
        Uri: { file: uri }, Range: class { constructor(start, end) { this.start = start; this.end = end; } },
        WorkspaceEdit: class { replace(target, range, text) { this.target = target; this.text = text; } },
        workspace: { isTrusted: options.trusted !== false, textDocuments: [doc],
            getConfiguration: () => ({ get: () => 'python' }),
            applyEdit: async edit => { state.applies++; assert.equal(edit.target, doc.uri); doc.text = edit.text; doc.isDirty = true; doc.version++; return true; } },
        window: {
            activeTextEditor: { document: doc },
            createOutputChannel: () => ({ clear() {}, appendLine() {}, show() {}, dispose() {} }),
            showOpenDialog: async () => [uri(config)],
            showErrorMessage: message => { state.errors.push(message); },
            showInformationMessage: async message => {
                if (message.startsWith('Send the open')) return options.consent === false ? undefined : 'Ask Copilot';
                if (message.startsWith('Candidate created')) { state.reviews++; return options.review === false ? undefined : 'Compare candidate'; }
                if (message.startsWith('Supplied cases')) {
                    if (options.staleOriginal) { doc.version++; doc.text += '# edited'; }
                    if (options.staleCandidate) await fs.appendFile(state.candidate.fsPath, '# edited');
                    if (options.dirtyCandidate) api.workspace.textDocuments.push({ uri: state.candidate, isDirty: true });
                    return options.accept === false ? undefined : 'Apply candidate';
                }
            },
            showQuickPick: async items => items[0],
            withProgress: async (_, fn) => fn({}, { isCancellationRequested: !!options.cancelled }),
            showWarningMessage: async () => options.execute === false ? undefined : 'Run trusted code',
            showTextDocument: async () => {}
        },
        commands: {
            registerCommand: (id, callback) => { state.commands.set(id, callback); return { dispose() {} }; },
            executeCommand: async (id, original, candidate) => {
                assert.equal(id, 'vscode.diff'); assert.equal(original, doc.uri);
                state.diffs++; state.candidate = candidate;
                assert.equal(await fs.readFile(file, 'utf8'), before);
                assert.equal(await fs.readFile(candidate.fsPath, 'utf8'), after);
            }
        },
        lm: { selectChatModels: async () => [{ name: 'Mock', id: 'mock', maxInputTokens: 1000,
            countTokens: async () => 10, sendRequest: async messages => {
                state.sent++; assert.equal(messages[1], before);
                if (options.changedDuringGeneration) { doc.text += '# changed'; doc.version++; }
                return { text: (async function* () { yield options.malformed ? 'not JSON' : JSON.stringify({ code: after }); })() };
            } }] },
        LanguageModelChatMessage: { User: text => text }, ProgressLocation: { Notification: 15 }
    };
    const old = Module._load;
    Module._load = function(name, ...args) {
        if (name === 'vscode') return api;
        if (name === '../benchmark/benchmark.cjs') return { report: () => 'Measured report', runBenchmark: async (_, request) => {
            state.runs++; assert.equal(state.reviews, 1); assert.equal(request.before, before); assert.equal(request.after, after);
            assert.equal(request.mode, 'compare'); assert.equal(request.function, 'f');
            return { passed: options.passed !== false, cases: [], error: options.error };
        } };
        return old.call(this, name, ...args);
    };
    try {
        delete require.cache[require.resolve('../out/copilot.js')];
        delete require.cache[require.resolve('../out/extension.js')];
        require('../out/extension.js').activate({ subscriptions: [] });
    } finally { Module._load = old; }
    try {
        await state.commands.get('performanceAnalyzer.optimizeFile')();
        assert.equal(await fs.readFile(file, 'utf8'), before, 'Original on disk must never be overwritten');
        return { ...state, text: doc.text, before, after, dirty: doc.isDirty };
    } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('generate, review, compare, and explicitly apply as an unsaved edit', async () => {
    const result = await harness();
    assert.equal(result.sent, 1); assert.equal(result.diffs, 1); assert.equal(result.runs, 1);
    assert.equal(result.applies, 1); assert.equal(result.text, result.after); assert.equal(result.dirty, true);
    assert.deepEqual(result.errors, []);
});

test('untrusted workspaces, declined consent and cancellation never generate or execute', async () => {
    for (const options of [{ trusted: false }, { consent: false }, { cancelled: true }]) {
        const result = await harness(options);
        assert.equal(result.sent, 0); assert.equal(result.runs, 0); assert.equal(result.applies, 0);
    }
});

test('malformed generation and stale originals cannot proceed to execution', async () => {
    for (const options of [{ malformed: true }, { changedDuringGeneration: true }]) {
        const result = await harness(options);
        assert.equal(result.diffs, 0); assert.equal(result.runs, 0); assert.equal(result.applies, 0);
        assert.equal(result.errors.length, 1);
    }
});

test('declining review or execution leaves the candidate separate', async () => {
    for (const options of [{ review: false }, { execute: false }]) {
        const result = await harness(options);
        assert.equal(result.diffs, 1); assert.equal(result.runs, 0); assert.equal(result.applies, 0);
        assert.equal(result.text, result.before); assert.deepEqual(result.errors, []);
    }
});

test('failed checks, worker errors and declined acceptance never apply a candidate', async () => {
    for (const options of [{ passed: false }, { error: 'worker failed' }, { accept: false }]) {
        const result = await harness(options);
        assert.equal(result.runs, 1); assert.equal(result.applies, 0); assert.equal(result.text, result.before);
    }
});

test('changes to either source after measurement block acceptance', async () => {
    for (const options of [{ staleOriginal: true }, { staleCandidate: true }, { dirtyCandidate: true }]) {
        const result = await harness(options);
        assert.equal(result.runs, 1); assert.equal(result.applies, 0);
        assert.match(result.errors[0], /changed after|changed during/);
    }
});

test('candidate parser requires a complete, bounded JSON code field', () => {
    const { parseCandidate } = require('../out/copilot.js');
    assert.equal(parseCandidate('{"code":"def f(): return 1"}'), 'def f(): return 1');
    assert.equal(parseCandidate('```json\n{"code":"pass"}\n```'), 'pass');
    for (const text of ['null', '[]', '{}', '{"code":""}', '{"code":42}', '{"code":"pass","extra":1}',
        'Advice\n```python\npass\n```', JSON.stringify({ code: 'x'.repeat(60001) })]) {
        assert.throws(() => parseCandidate(text), /candidate JSON|code field/);
    }
});
