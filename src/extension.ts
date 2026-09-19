import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const { runBenchmark, report } = require('../benchmark.cjs');

export function activate(context: vscode.ExtensionContext) {
    let running = false;
    const output = vscode.window.createOutputChannel('Performance Comparison');
    context.subscriptions.push(output);
    context.subscriptions.push(vscode.commands.registerCommand('performanceAnalyzer.analyzeFile', async () => {
        if (running) { vscode.window.showErrorMessage('A benchmark is already running'); return; }
        running = true;
        try {
            if (!vscode.workspace.isTrusted) throw new Error('Benchmarking requires a trusted workspace');
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'file' || !editor.document.fileName.endsWith('.py') || editor.document.isDirty) {
                throw new Error('Open and save the original Python file first');
            }
            const candidates = await vscode.window.showOpenDialog({ title: 'Choose the candidate Python file',
                canSelectMany: false, filters: { Python: ['py'] } });
            if (!candidates) return;
            const configs = await vscode.window.showOpenDialog({ title: 'Choose benchmark.json',
                canSelectMany: false, filters: { JSON: ['json'] } });
            if (!configs) return;
            const config = JSON.parse(await fs.readFile(configs[0].fsPath, 'utf8'));
            const before = editor.document.getText();
            const after = await fs.readFile(candidates[0].fsPath, 'utf8');
            const answer = await vscode.window.showWarningMessage(
                'Run both Python files? Code runs with your local permissions, not in a sandbox.',
                { modal: true }, 'Run trusted code');
            if (answer !== 'Run trusted code') return;
            const python = vscode.workspace.getConfiguration('performanceAnalyzer').get<string>('pythonPath', 'python');
            const result = await runBenchmark(python, { ...config, before, after }, path.dirname(editor.document.fileName));
            output.clear();
            output.appendLine('Compared the source snapshots selected when this run started.');
            output.appendLine(report(result));
            output.show();
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        } finally { running = false; }
    }));
}
