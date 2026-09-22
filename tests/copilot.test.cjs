const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('Copilot consent, streaming, failure and cancellation paths', async () => {
    let consent = true, cancelled = false, fail = false, available = true, sent = 0, opened = [], errors = [];
    const source = 'def add(a, b): return a + b';
    const model = { name: 'Test Copilot', id: 'test', maxInputTokens: 1000,
        countTokens: async () => 10,
        sendRequest: async (messages) => {
            sent++;
            assert.equal(messages[1], source);
            return { text: (async function* () { yield 'Review'; if (fail) throw new Error('quota exceeded'); yield ' complete'; })() };
        } };
    const api = {
        workspace: { isTrusted: false, openTextDocument: async value => { opened.push(value); return value; } },
        window: {
            activeTextEditor: { document: { languageId: 'python', getText: () => source } },
            showInformationMessage: async () => consent ? 'Ask Copilot' : undefined,
            showQuickPick: async items => items[0],
            withProgress: async (_, fn) => fn({}, { get isCancellationRequested() { return cancelled; } }),
            showTextDocument: async () => {}, showErrorMessage: async text => errors.push(text)
        },
        lm: { selectChatModels: async selector => { assert.equal(selector.vendor, 'copilot'); return available ? [model] : []; } },
        LanguageModelChatMessage: { User: text => text }, ProgressLocation: { Notification: 15 }, ViewColumn: { Beside: -2 }
    };
    const old = Module._load;
    Module._load = function(name, ...args) { return name === 'vscode' ? api : old.call(this, name, ...args); };
    let ask;
    try { ask = require('../out/copilot.js').askCopilot; } finally { Module._load = old; }
    await ask(); assert.match(errors.pop(), /trusted/); assert.equal(sent, 0);
    api.workspace.isTrusted = true; consent = false;
    await ask(); assert.equal(sent, 0);
    consent = true; available = false;
    await ask(); assert.match(errors.pop(), /No Copilot models/); assert.equal(sent, 0);
    available = true;
    await ask(); assert.equal(sent, 1); assert.equal(opened.length, 1);
    assert.match(opened[0].content, /Not benchmark results/); assert.match(opened[0].content, /Review complete/);
    opened = []; fail = true;
    await ask(); assert.match(errors.pop(), /quota exceeded/); assert.equal(opened.length, 0);
    fail = false; cancelled = true;
    await ask(); assert.equal(sent, 2); assert.equal(opened.length, 0);
    assert.deepEqual(errors, []);
});
