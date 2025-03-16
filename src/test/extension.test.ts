import * as assert from 'assert';
import * as vscode from 'vscode';

async function runCopyPaste(
    input: string,
    copySelections: vscode.Selection[],
    pasteSelections: vscode.Selection[],
    cut: boolean = false) {
    const document = await vscode.workspace.openTextDocument({ content: input });
    const editor = await vscode.window.showTextDocument(document);

    editor.selections = copySelections;
    if (cut) {
        await vscode.commands.executeCommand('copy-paste-and-indent.cut');
    } else {
        await vscode.commands.executeCommand('copy-paste-and-indent.copy');
    }

    editor.selections = pasteSelections;
    await vscode.commands.executeCommand('copy-paste-and-indent.paste');

    return document.getText();
}

suite("Extension Test Suite", () => {
    test("Indent basic", async () => {
        const input = [
            'hello world',
            '    ',
        ].join("\n");

        const output = await runCopyPaste(
            input, [new vscode.Selection(0, 0, 0, 11)], [new vscode.Selection(1, 0, 1, 4)]
        );
        const expectedOutput = [
            'hello world',
            '    hello world',
        ].join("\n");

        assert.strictEqual(output, expectedOutput);
    });

    test("Unindent basic", async () => {
        const input = [
            '        hello world',
            '    ',
        ].join("\n");

        const output = await runCopyPaste(
            input, [new vscode.Selection(0, 0, 0, 19)], [new vscode.Selection(1, 0, 1, 4)]
        );
        const expectedOutput = [
            '        hello world',
            '    hello world',
        ].join("\n");

        assert.strictEqual(output, expectedOutput);
    });

    test("Unindent multiline", async () => {
        const input = [
            '        hello',
            '            world',
            '    ',
        ].join("\n");

        const output = await runCopyPaste(
            input, [new vscode.Selection(0, 0, 1, 17)], [new vscode.Selection(2, 0, 2, 4)]
        );
        const expectedOutput = [
            '        hello',
            '            world',
            '    hello',
            '        world',
        ].join("\n");

        assert.strictEqual(output, expectedOutput);
    });

    test("Unindent multiline leading spaces", async () => {
        const input = [
            '            hello',
            '        world',
            '    ',
        ].join("\n");

        const output = await runCopyPaste(
            input, [new vscode.Selection(0, 0, 1, 13)], [new vscode.Selection(2, 0, 2, 4)]
        );
        const expectedOutput = [
            '            hello',
            '        world',
            '        hello',
            '    world',
        ].join("\n");

        assert.strictEqual(output, expectedOutput);
    });

    test("Single line empty selection", async () => {
        const input = [
            'hello world',
            '    foo bar baz',
        ].join("\n");

        const output = await runCopyPaste(
            input, [new vscode.Selection(0, 0, 0, 0)], [new vscode.Selection(2, 7, 2, 7)]
        );
        const expectedOutput = [
            'hello world',
            '    hello world',
            '    foo bar baz',
        ].join("\n");

        assert.strictEqual(output, expectedOutput);
    });

    test("Spread", async () => {
        const input = [
            '    hello',
            'world',
            '',
            '',
            '    ',
        ].join("\n");

        const output = await runCopyPaste(
            input,
            [new vscode.Selection(0, 0, 0, 0), new vscode.Selection(1, 0, 1, 0)],
            [new vscode.Selection(2, 0, 2, 0), new vscode.Selection(4, 4, 4, 4)],
        );
        const expectedOutput = [
            '    hello',
            'world',
            'hello',
            '',
            '    world',
        ].join("\n");

        assert.strictEqual(output, expectedOutput);
    });
});
