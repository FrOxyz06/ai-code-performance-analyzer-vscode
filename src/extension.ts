import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { askCopilot, generateCandidate } from './copilot';
const { runBenchmark, report } = require('../benchmark/benchmark.cjs');

export function activate(context: vscode.ExtensionContext) {
    let running = false;
    let lastReport: any;
    const output = vscode.window.createOutputChannel('Performance Analyzer');
    context.subscriptions.push(output);
    context.subscriptions.push(vscode.commands.registerCommand('performanceAnalyzer.askCopilot', askCopilot));

    async function analyze(mode: 'profile' | 'compare' | 'optimize') {
        if (running) { vscode.window.showErrorMessage('A benchmark is already running'); return; }
        running = true;
        lastReport = undefined;
        try {
            if (!vscode.workspace.isTrusted) throw new Error('Benchmarking requires a trusted workspace');
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'file' || !editor.document.fileName.endsWith('.py') || editor.document.isDirty) {
                throw new Error('Open and save the original Python file first');
            }
            const document = editor.document;
            const before = document.getText();
            const version = document.version;
            async function checkOriginal() {
                if (!vscode.workspace.isTrusted) throw new Error('Benchmarking requires a trusted workspace');
                const diskText = await fs.readFile(document.fileName, 'utf8');
                if (document.isClosed || document.isDirty || document.version !== version || document.getText() !== before || diskText !== before) {
                    throw new Error('The original changed during this run. Save it and start a new comparison.');
                }
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
            if (mode === 'optimize') {
                const code = await generateCandidate(before);
                if (code === undefined) return;
                if (code === before) throw new Error('Copilot returned unchanged code. No candidate was created.');
                await checkOriginal();
                candidate = vscode.Uri.file(path.join(path.dirname(document.fileName),
                    `${path.basename(document.fileName, '.py')}.performance-candidate-${randomUUID()}.py`));
                await fs.writeFile(candidate.fsPath, code, { encoding: 'utf8', flag: 'wx' });
                await vscode.commands.executeCommand('vscode.diff', document.uri, candidate,
                    'Performance Analyzer: Review candidate before running', { preview: false });
                const review = await vscode.window.showInformationMessage(
                    'Candidate created beside the original. Review the diff, then choose Compare candidate when ready.',
                    'Compare candidate');
                if (review !== 'Compare candidate') return;
            }
            const candidateDocument = candidate ? vscode.workspace.textDocuments?.find(doc => doc.uri.toString() === candidate!.toString()) : undefined;
            if (candidateDocument?.isDirty) throw new Error('Save the candidate before comparing it.');
            const after = candidate ? await fs.readFile(candidate.fsPath, 'utf8') : before;
            const answer = await vscode.window.showWarningMessage(
                'Run the selected Python code for timing, profiling, and allocation checks? It runs with your local permissions, not in a sandbox.',
                { modal: true }, 'Run trusted code');
            if (answer !== 'Run trusted code') return;
            await checkOriginal();
            if (candidate) {
                const diskCandidate = await fs.readFile(candidate.fsPath, 'utf8');
                const currentCandidate = vscode.workspace.textDocuments?.find(doc => doc.uri.toString() === candidate!.toString());
                if (currentCandidate?.isDirty || diskCandidate !== after) {
                    throw new Error('The candidate changed during confirmation. Save it and start a new comparison.');
                }
                await checkOriginal();
            }
            const python = vscode.workspace.getConfiguration('performanceAnalyzer').get<string>('pythonPath', 'python');
            const result = await runBenchmark(python, { ...config, mode: mode === 'profile' ? 'profile' : 'compare', before, after }, path.dirname(document.fileName));
            lastReport = result;
            output.clear();
            output.appendLine('Results refer to source snapshots selected when this run started.');
            output.appendLine(report(result));
            output.show(true);
            if (mode === 'optimize' && candidate && result.passed && !result.error) {
                const accept = await vscode.window.showInformationMessage(
                    'Supplied cases matched. Review runtime, memory, and timing warnings in the results; passing does not imply a speed improvement or correctness on other inputs.',
                    'Apply candidate');
                if (accept !== 'Apply candidate') return;
                await checkOriginal();
                const currentCandidate = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === candidate!.toString());
                if (currentCandidate?.isDirty || await fs.readFile(candidate.fsPath, 'utf8') !== after) {
                    throw new Error('The candidate changed after measurement. Run Compare File again before adopting it.');
                }
                await checkOriginal();
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(before.length)), after);
                if (!await vscode.workspace.applyEdit(edit)) throw new Error('Could not apply candidate');
                await vscode.window.showTextDocument(document);
                await vscode.window.showInformationMessage('Candidate applied as an undoable edit. Review and save; VS Code Auto Save follows your settings.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        } finally { running = false; }
    }
    for (const [id, mode] of [['analyzeFile', 'compare'], ['profileFile', 'profile'], ['optimizeFile', 'optimize']] as const) {
        context.subscriptions.push(vscode.commands.registerCommand('performanceAnalyzer.' + id, () => analyze(mode)));
    }
    context.subscriptions.push(vscode.commands.registerCommand('performanceAnalyzer.exportReport', async () => {
        try {
            if (!lastReport) throw new Error('Run a profile or comparison first');
            // Keep the selected report even if another run starts while choosing a path.
            const selectedReport = lastReport;
            const destination = await vscode.window.showSaveDialog({ filters: { JSON: ['json'], Markdown: ['md'] } });
            if (!destination) return;
            if (!/\.(json|md)$/i.test(destination.fsPath)) throw new Error('Save reports as .json or .md');
            const text = /\.md$/i.test(destination.fsPath) ? '# Performance report\n\n```text\n' + report(selectedReport) + '\n```\n' : JSON.stringify(selectedReport, null, 2) + '\n';
            await fs.writeFile(destination.fsPath, text);
            vscode.window.showInformationMessage('Report saved. JSON includes source/config hashes and timing samples.');
        } catch (error) { vscode.window.showErrorMessage(String(error)); }
    }));
}
