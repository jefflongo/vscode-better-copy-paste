import * as vscode from 'vscode';

function getIndentation(input: string): string {
    return input.match(/^(\s*)/)?.[0] || "";
}

function getMinimumIndentation(lines: readonly string[]): number {
    let min: number | undefined = undefined;

    for (const line of lines) {
        const lineIsWhitespace = line.trim().length === 0;
        if (!lineIsWhitespace) {
            const indentation = getIndentation(line).length;
            if (min === undefined || indentation < min) {
                min = indentation;
            }
        }
    }

    return min ?? 0;
}

async function copy(log: vscode.OutputChannel, history: string[], cut: boolean = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    // get configuration
    const editorConfig = vscode.workspace.getConfiguration("editor");
    const emptySelectionClipboard = editorConfig.get<boolean>("emptySelectionClipboard", true);
    const eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

    // selections are stored in the order in which they were created.
    // reorder by line since this is the order in which things will be added to the clipboard.
    const selections = [...editor.selections].sort((a, b) => a.start.line - b.start.line);

    // get the lines across all selections and determine the minimum indentation
    const lines = selections.flatMap(selection => Array.from(
        { length: selection.end.line - selection.start.line + 1 },
        (_, i) => editor.document.lineAt(selection.start.line + i).text)
    );
    const minimumIndentation = getMinimumIndentation(lines);
    log.appendLine(`Copy: unindented by ${minimumIndentation} characters`);

    // get the text to be copied to the clipboard
    let toClipboard = selections.flatMap((selection) => {
        const copyWholeLine = emptySelectionClipboard && selection.isEmpty;

        // unindent each line and get the selected portion of each line
        const selectionLines: string[] = [];
        for (let lineIndex = selection.start.line; lineIndex <= selection.end.line; lineIndex++) {
            const isFirstLine = lineIndex === selection.start.line;
            const isLastLine = lineIndex === selection.end.line;
            const line = editor.document.lineAt(lineIndex).text;
            const unindentedLine = line.slice(minimumIndentation);
            let selectionLine = "";

            let start = 0;
            if (isFirstLine && !copyWholeLine && selection.start.character > minimumIndentation) {
                start = selection.start.character - minimumIndentation;

                // append any indentation that wasn't selected
                const textBeforeCursor = unindentedLine.slice(0, start);
                selectionLine += getIndentation(textBeforeCursor);
            }

            let end = unindentedLine.length;
            if (isLastLine && !copyWholeLine) {
                end = Math.max(selection.end.character - minimumIndentation, 0);
            }

            selectionLine += unindentedLine.slice(start, end);
            selectionLines.push(selectionLine);
        }
        return selectionLines;
    }).join(eol);

    // whole lines copied by empty selections always end in an EOL. this is handled for intermediary
    // whole lines due to selections being joined by EOL. however, there is no EOL after the last
    // selection. explicitly add it here if necessary.
    const lastSelection = selections.at(-1)!;
    if (emptySelectionClipboard && lastSelection.isEmpty) {
        toClipboard += eol;
    }

    // handle deletion if cutting
    if (cut) {
        await editor.edit(editBulider => {
            for (const selection of selections) {
                if (emptySelectionClipboard && selection.isEmpty) {
                    const lineToDelete = editor.document.lineAt(selection.start.line);
                    editBulider.delete(lineToDelete.rangeIncludingLineBreak);
                } else {
                    editBulider.delete(selection);
                }
            }
        });
    }

    // save the clipboard text in the history
    const historyIndex = history.indexOf(toClipboard);
    if (historyIndex !== 0) {
        // if the entry is already in the history, it will be moved to the front
        if (historyIndex !== -1) {
            history.splice(historyIndex, 1);
        }

        // shift out the oldest entry if the history is full
        const extensionConfig = vscode.workspace.getConfiguration("copy-paste-and-indent");
        const maxSize = extensionConfig.get<number>("historySize", 10);
        if (history.length >= maxSize) {
            history.pop();
        }

        // insert the new entry to the front
        history.unshift(toClipboard);
    }

    await vscode.env.clipboard.writeText(toClipboard);
}

async function paste(log: vscode.OutputChannel, text?: string) {
    let clipboardText: string = text ?? await vscode.env.clipboard.readText();
    if (!clipboardText) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    // get configuration
    const editorConfig = vscode.workspace.getConfiguration("editor");
    const multiCursorPaste = editorConfig.get<string>("multiCursorPaste", "spread");
    const formatOnPaste = editorConfig.get<boolean>("formatOnPaste", false);
    const eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

    // selections are stored in the order in which they were created.
    // reorder by line since this is the order in which things will be pasted if spreading.
    const selections = [...editor.selections].sort((a, b) => a.start.line - b.start.line);

    // determine the minimum indentation in the clipboard and unindent.
    // this step was performed in `copy`, but the text may have been copied externally.
    // therefore, make an attempt to unindent the copied text in this case, even though we don't
    // have the context to properly handle the first line.
    const lines = clipboardText.split(/\r\n|\r|\n/);
    const minimumIndentation = getMinimumIndentation(lines);
    const unindentedLines =
        minimumIndentation > 0 ? lines.map(line => line.slice(minimumIndentation)) : lines;
    let strategy = "default";

    // when a single line is in the clipboard containing a trailing EOL, and the selection to paste
    // in is empty, the paste is inserted at the beginning of the line.
    // NOTE: this mode is only partially supported. vscode stores clipboard metadata enabling
    // tracking of whether text was copied from an empty selection or not. we cannot do this, so we
    // are unable to differentiate text copied by an empty selection with text copied by a non-empty
    // selection which includes an empty line following.
    const clipboardIsEOL = unindentedLines.length === 1 && unindentedLines[0].length === 0;
    const clipboardIsSingleLineWithEOL =
        unindentedLines.length === 2 &&
        unindentedLines[0].length > 0 &&
        unindentedLines[1].length === 0;
    const clipboardIsSingleWholeLine = clipboardIsEOL || clipboardIsSingleLineWithEOL;

    // if the multiCursorPaste editor option is configured to "spread", and the number of copied
    // selections matches the number of selections to paste in, paste one copy selection per paste
    // selection.
    // NOTE: this mode is only partially supported. vscode stores clipboard metadata enabling
    // tracking of multiline text per selection. we cannot do this, so only one line is supported
    // per copy selection.
    const numLinesWithoutTrailingEOL =
        unindentedLines.at(-1)!.length > 0 ? unindentedLines.length : unindentedLines.length - 1;
    if (multiCursorPaste === "spread" &&
        selections.length > 1 &&
        selections.length === numLinesWithoutTrailingEOL) {
        strategy = "spread";
    }

    await editor.edit(editBuilder => {
        for (const [i, selection] of selections.entries()) {
            if (clipboardIsSingleWholeLine && selection.isEmpty) {
                strategy = "pasteOnNewLine";
            }

            // determine the indentation at the paste location
            const firstLine = editor.document.lineAt(selection.start.line).text;
            const indentation = getIndentation(firstLine);

            // if the selection starts in the indentation, the first line will already be indented
            // from the unselected portion. trim the indentation for the first line accordingly.
            const firstLineIndentationStart =
                Math.min(selection.start.character, indentation.length);
            const firstLineIndentation = indentation.slice(firstLineIndentationStart);

            if (strategy === "pasteOnNewLine") {
                // single line empty selection paste mode:
                // indent the text and insert at the beginning of the line for each selection
                const indentedText = indentation + unindentedLines[0] + eol;
                editBuilder.insert(new vscode.Position(selection.start.line, 0), indentedText);
            } else if (strategy === "spread") {
                // "spread" paste mode:
                // unindent each individual line, reindent at the selection level, then paste one
                // line per selection
                const line = unindentedLines[i];
                const lineIndentation = getIndentation(line).length;
                const indentedText = firstLineIndentation + line.slice(lineIndentation);
                editBuilder.replace(selection, indentedText);
            } else {
                // default paste mode:
                // indent the text and paste at every selection
                const indentedText = unindentedLines
                    .map((line, index) =>
                        index === 0 ? firstLineIndentation + line : indentation + line)
                    .join(eol);
                editBuilder.replace(selection, indentedText);
            }

            let message =
                `Paste: indented by ${indentation.length} characters using strategy "${strategy}"`;
            if (selections.length > 1) {
                message += ` for selection ${i}`;
            }
            log.appendLine(message);
        }
    });

    // if format on paste is enabled, do it now
    if (formatOnPaste) {
        await vscode.commands.executeCommand("editor.action.formatDocument");
    }
}

async function pasteFromHistory(log: vscode.OutputChannel, history: readonly string[]) {
    if (history.length === 0) {
        vscode.window.setStatusBarMessage("Clipboard is empty");
        return;
    }

    const options: vscode.QuickPickOptions = {
        title: "Clipboard History",
        placeHolder: "Start typing to select..."
    };

    const text = await vscode.window.showQuickPick(history, options);
    if (text === undefined) {
        return;
    }

    await paste(log, text);
}

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("Copy Paste and Indent");
    const history: string[] = [];

    const disposables = [
        vscode.commands.registerCommand(
            "copy-paste-and-indent.copy", () => copy(outputChannel, history)
        ),
        vscode.commands.registerCommand(
            "copy-paste-and-indent.cut", () => copy(outputChannel, history, true)
        ),
        vscode.commands.registerCommand(
            "copy-paste-and-indent.paste", () => paste(outputChannel)
        ),
        vscode.commands.registerCommand(
            "copy-paste-and-indent.pasteFromHistory", () => pasteFromHistory(outputChannel, history)
        ),
        vscode.commands.registerCommand(
            "copy-paste-and-indent.clearHistory",
            () => {
                vscode.window.setStatusBarMessage("Clipboard history cleared");
                history.length = 0;
            }
        ),
    ];

    context.subscriptions.concat(disposables);
}

export function deactivate() { }
