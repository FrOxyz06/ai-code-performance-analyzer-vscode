import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const { runBenchmark, report } = require('../benchmark.cjs');

export function activate(context: vscode.ExtensionContext) {
    let running = false;
    let lastReport: any;
    const output = vscode.window.createOutputChannel('Performance Analyzer');
    context.subscriptions.push(output);
    async function analyze(mode: 'profile' | 'compare') {
        if (running) { vscode.window.showErrorMessage('A benchmark is already running'); return; }
        running = true;
        try {
            if (!vscode.workspace.isTrusted) throw new Error('Benchmarking requires a trusted workspace');
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'file' || !editor.document.fileName.endsWith('.py') || editor.document.isDirty) {
                throw new Error('Open and save the original Python file first');
            }
            let candidate: vscode.Uri | undefined;
            if (mode === 'compare') {
                const selected = await vscode.window.showOpenDialog({ title: 'Choose the candidate Python file',
                    canSelectMany: false, filters: { Python: ['py'] } });
                if (!selected) return;
                candidate = selected[0];
            }
            const configs = await vscode.window.showOpenDialog({ title: 'Choose benchmark.json',
                canSelectMany: false, filters: { JSON: ['json'] } });
            if (!configs) return;
            const config = JSON.parse(await fs.readFile(configs[0].fsPath, 'utf8'));
            const before = editor.document.getText();
            const after = candidate ? await fs.readFile(candidate.fsPath, 'utf8') : before;
            const answer = await vscode.window.showWarningMessage(
                'Run the selected Python code for timing, profiling, and allocation checks? It runs with your local permissions, not in a sandbox.',
                { modal: true }, 'Run trusted code');
            if (answer !== 'Run trusted code') return;
            const python = vscode.workspace.getConfiguration('performanceAnalyzer').get<string>('pythonPath', 'python');
            lastReport = undefined;
            lastReport = await runBenchmark(python, { ...config, mode, before, after }, path.dirname(editor.document.fileName));
            output.clear();
            output.appendLine('Results refer to source snapshots selected when this run started.');
            output.appendLine(report(lastReport));
            output.show();
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        } finally { running = false; }
    }
    for (const [id, mode] of [['analyzeFile', 'compare'], ['profileFile', 'profile']] as const) {
        context.subscriptions.push(vscode.commands.registerCommand('performanceAnalyzer.' + id, () => analyze(mode)));
    }
    context.subscriptions.push(vscode.commands.registerCommand('performanceAnalyzer.exportReport', async () => {
        try {
            if (!lastReport) throw new Error('Run a profile or comparison first');
            const destination = await vscode.window.showSaveDialog({ filters: { JSON: ['json'], Markdown: ['md'] } });
            if (!destination) return;
            if (!/\.(json|md)$/i.test(destination.fsPath)) throw new Error('Save reports as .json or .md');
            const text = destination.fsPath.endsWith('.md') ? '# Performance report\n\n```text\n' + report(lastReport) + '\n```\n' : JSON.stringify(lastReport, null, 2) + '\n';
            await fs.writeFile(destination.fsPath, text);
            vscode.window.showInformationMessage('Report saved. JSON includes source/config hashes and timing samples.');
        } catch (error) { vscode.window.showErrorMessage(String(error)); }
    }));
}
