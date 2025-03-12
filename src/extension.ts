import * as vscode from 'vscode';

function getIndentation(input: string): string {
    return input.match(/^(\s*)/)?.[0] || "";
}

function isWhitespace(input: string): boolean {
    return input.trim().length === 0;
}

async function copy() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

    // selections are in the order in which they are created. reorder by line since this is the
    // order in which we will add things to the clipboard.
    // before we do this, consider any selections of length zero as a request to copy the entire
    // line.
    const selections = editor.selections.map(selection => {
        if (selection.isEmpty) {
            const line = editor.document.lineAt(selection.start.line);
            return new vscode.Selection(line.range.start, line.range.end);
        }
        return selection;
    }).sort((a, b) => a.start.line - b.start.line);

    // we now perform two passes through the selections:
    // this first pass determines the minimum indentation on the lines that have selections
    let minimumIndentation: number | undefined = undefined;
    for (const selection of selections) {
        for (let i = selection.start.line; i <= selection.end.line; i++) {
            const line = editor.document.lineAt(i).text;

            if (!isWhitespace(line)) {
                const indentation = getIndentation(line).length;
                if (minimumIndentation === undefined || indentation < minimumIndentation) {
                    minimumIndentation = indentation;
                }
            }
        }
    }
    minimumIndentation ??= 0;

    // this second pass unindents the lines and saves the selected portions of them
    const unindentedLines: string[] = [];
    for (const selection of selections) {
        for (let i = selection.start.line; i <= selection.end.line; i++) {
            const line = editor.document.lineAt(i).text;

            // unindent
            const unindentedLine = line.slice(minimumIndentation);

            // determine the portion of the unindented line that is selected
            const start = i === selection.start.line ?
                Math.max(selection.start.character - minimumIndentation, 0) : 0;
            const end = i === selection.end.line ?
                Math.max(selection.end.character - minimumIndentation, 0) : unindentedLine.length;
            let unindentedSelection = unindentedLine.slice(start, end);

            // the first line of the selection may have additional indentation that wasn't selected.
            // append that indentation to the front.
            if (i === selection.start.line) {
                const textBeforeCursor = unindentedLine.slice(0, start);
                const indentation = getIndentation(textBeforeCursor);
                unindentedSelection = indentation + unindentedSelection;
            }

            unindentedLines.push(unindentedSelection);
        }
    }

    // write to the clipboard
    await vscode.env.clipboard.writeText(unindentedLines.join(eol));
}

async function paste() {
    const clipboardText = await vscode.env.clipboard.readText();
    if (!clipboardText) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const editorConfig = vscode.workspace.getConfiguration("editor");
    const formatOnPaste = editorConfig.get<boolean>("formatOnPaste", false);
    const eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

    const lines = clipboardText.split(/\n|\r\n|\n\r/);

    // determine the minimum indentation in the clipboard.
    // this step was performed in `copy`, but the text may have been copied externally.
    // make an attempt to unindent the copied text in this case, even though we don't have the
    // context to properly handle the first line.
    let minimumIndentation: number | undefined = undefined;
    for (const line of lines) {
        if (!isWhitespace(line)) {
            const indentation = getIndentation(line).length;
            if (minimumIndentation === undefined || indentation < minimumIndentation) {
                minimumIndentation = indentation;
            }
        }
    }
    minimumIndentation ??= 0;

    // unindent
    const unindentedLines = lines.map(line => line.slice(minimumIndentation));

    await editor.edit(editBuilder => {
        // paste at each cursor/selection
        editor.selections.forEach(selection => {
            // get the indentation at the cursor
            const firstLine = editor.document.lineAt(selection.start.line).text;
            const textBeforeCursor = firstLine.slice(0, selection.start.character);
            const indentation = getIndentation(textBeforeCursor);

            // apply indentation to lines that aren't the first line (already indented)
            const indentedText = unindentedLines
                .map((line, index) => index !== 0 ? indentation + line : line).join(eol);

            // replace the selected text (or insert if selection is empty)
            editBuilder.replace(selection, indentedText);
        });
    });

    // if format on paste is enabled, do it now
    if (formatOnPaste) {
        await vscode.commands.executeCommand('editor.action.formatDocument');
    }
}

export function activate(context: vscode.ExtensionContext) {
    const disposables = [
        vscode.commands.registerCommand("copy-paste-and-indent.copy", copy),
        vscode.commands.registerCommand("copy-paste-and-indent.paste", paste)
    ];

    context.subscriptions.concat(disposables);
}

export function deactivate() { }
