import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const analyzeCommand = vscode.commands.registerCommand(
        'performanceAnalyzer.analyzeFile',
        () => {
            vscode.window.showInformationMessage('Performance Analyzer is running!');
        }
    );
    context.subscriptions.push(analyzeCommand);
}
