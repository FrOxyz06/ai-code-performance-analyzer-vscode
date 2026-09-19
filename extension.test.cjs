const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const manifest = require('./package.json');

test('registers the declared command and adds it to extension cleanup', () => {
    let command;
    let callback;
    let message;
    const disposable = { dispose() {} };
    const originalLoad = Module._load;
    Module._load = function (name, ...args) {
        if (name === 'vscode') {
            return {
                commands: { registerCommand(id, action) {
                    command = id;
                    callback = action;
                    return disposable;
                } },
                window: { showInformationMessage(text) { message = text; } }
            };
        }
        return originalLoad.call(this, name, ...args);
    };
    try {
        const context = { subscriptions: [] };
        require('./out/extension.js').activate(context);
        assert.equal(command, manifest.contributes.commands[0].command);
        assert.deepEqual(context.subscriptions, [disposable]);
        callback();
        assert.equal(message, 'Performance Analyzer is running!');
    } finally {
        Module._load = originalLoad;
    }
});
