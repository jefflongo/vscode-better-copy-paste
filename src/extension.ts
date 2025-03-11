import * as vscode from 'vscode';

function getIndentation(input: string): string {
	return input.match(/^(\s*)/)?.[0] || "";
}

function removeIndentation(input: string, n: number): string {
	return input.replace(new RegExp(`^\\s{0,${n}}`), "");
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

	const selectedLines: string[] = [];
	let minimumIndentation: number | undefined = undefined;

	for (const selection of selections) {
		for (let i = selection.start.line; i <= selection.end.line; i++) {
			// get the entire line, even if the selection only includes a portion of the line
			const line = editor.document.lineAt(i).text;

			// strip all indentation from whitespace-only lines
			if (isWhitespace(line)) {
				selectedLines.push("");
				continue;
			}

			// determine the amount of whitespace on this line
			const indentation = getIndentation(line).length;
			if (minimumIndentation === undefined || indentation < minimumIndentation) {
				minimumIndentation = indentation;
			}

			// save the selected portion of the line
			if (i === selection.start.line || i === selection.end.line) {
				const start = i === selection.start.line ? selection.start.character : 0;
				const end = i === selection.end.line ? selection.end.character : line.length;
				selectedLines.push(line.slice(start, end));
			} else {
				selectedLines.push(line);
			}
		}
	}

	// in case only whitespace lines are copied
	if (minimumIndentation === undefined) {
		minimumIndentation = 0;
	}

	// unindent the lines
	const unindentedLines = selectedLines
		.map(line => removeIndentation(line, minimumIndentation))
		.join(eol);

	// write to the clipboard
	await vscode.env.clipboard.writeText(unindentedLines);
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

	// split clipboard text into lines, clearing any whitespace-only lines to match the format from
	// `copy`, in case the text was copied externally.
	const lines = clipboardText.split(/\n|\r\n|\n\r/).map(line => isWhitespace(line) ? "" : line);

	// determine the minimum indentation in the clipboard.
	// this step was performed in `copy`, but the text may have been copied externally.
	// make an attempt to unindent the copied text in this case, even though we don't have the
	// context to properly handle the first line.
	let minimumIndentation: number | undefined = undefined;

	for (let line of lines) {
		// determine the amount of whitespace on this line
		const indentation = getIndentation(line).length;
		if (minimumIndentation === undefined || indentation < minimumIndentation) {
			minimumIndentation = indentation;
		}
	}

	// in case only whitespace lines are copied
	if (minimumIndentation === undefined) {
		minimumIndentation = 0;
	}

	// unindent the lines
	const unindentedLines = lines.map(line => removeIndentation(line, minimumIndentation));

	await editor.edit(editBuilder => {
		// paste at each cursor/selection
		editor.selections.forEach(selection => {
			// get the indentation at the cursor
			const firstLine = editor.document.lineAt(selection.start.line).text;
			const textBeforeCursor = firstLine.slice(0, selection.start.character);
			const indentation = getIndentation(textBeforeCursor);

			// apply indentation to lines that:
			// 1. aren't the first line (it's already indented)
			// 2. are non-empty
			const indentedText = unindentedLines
				.map((line, index) =>
					index !== 0 && !isWhitespace(line) ? indentation + line : line)
				.join(eol);

			// replace the selected text (or insert if selection is empty)
			editBuilder.replace(selection, indentedText);
		});
	});

	// if formatOnPaste is enabled, do it now
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
