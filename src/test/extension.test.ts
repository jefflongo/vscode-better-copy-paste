import * as assert from 'assert';
import * as vscode from 'vscode';

async function runCopyPaste(
	input: string, copySelections: vscode.Selection[], pasteSelections: vscode.Selection[]) {
	const document = await vscode.workspace.openTextDocument({ content: input });
	const editor = await vscode.window.showTextDocument(document);

	editor.selections = copySelections;
	await vscode.commands.executeCommand('copy-paste-and-indent.copy');

	editor.selections = pasteSelections;
	await vscode.commands.executeCommand('copy-paste-and-indent.paste');

	return document.getText();
}

suite("Extension Test Suite", () => {
	test("Unindent multiline function call", async () => {
		const input = [
			'def foo():"',
			'    print("',
			'        "hello"',
			'    )',
			'',
			'',
		].join("\n");

		const output = await runCopyPaste(
			input, [new vscode.Selection(1, 4, 3, 5)], [new vscode.Selection(5, 0, 5, 0)]
		);
		const expectedOutput = [
			'def foo():"',
			'    print("',
			'        "hello"',
			'    )',
			'',
			'print("',
			'    "hello"',
			')',
		].join("\n");

		assert.strictEqual(output, expectedOutput);
	});
});
