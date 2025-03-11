import * as vscode from 'vscode';

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
			// for the given line of this selection, get the entire line (whether the entire
			// line is selected or not)
			const line = editor.document.lineAt(i).text;

			// strip all indentation from whitespace-only lines
			if (line.trim().length === 0) {
				selectedLines.push("");
				continue;
			}

			// determine the amount of whitespace of this line
			const indentation = line.match(/^(\s*)/)?.[0].length || 0;

			// update the minimum indentation
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
	const unindentedLines = selectedLines.map(line =>
		line.replace(new RegExp(`^\\s{0,${minimumIndentation}}`), "")
	).join(eol);

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

	const eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

	// split clipboard text into lines
	const lines = clipboardText.split(/\n|\r\n|\n\r/);

	// determine the minimum indentation in the clipboard.
	// this step was performed in `copy`, but the text may have been copied from outside of vscode.
	// make an attempt to unindent the copied text in this case, even though we don't have the
	// context to properly handle the first line.
	let minimumIndentation: number | undefined = undefined;
	for (const line of lines) {
		const indentation = line.match(/^(\s*)/)?.[0].length || 0;
		if (minimumIndentation === undefined || indentation < minimumIndentation) {
			minimumIndentation = indentation;
		}
	}

	// in case only whitespace lines are copied
	if (minimumIndentation === undefined) {
		minimumIndentation = 0;
	}

	// unindent the lines
	const preprocessedLines = lines.map(line =>
		line.replace(new RegExp(`^\\s{0,${minimumIndentation}}`), "")
	);

	await editor.edit(editBuilder => {
		// paste at each cursor/selection
		editor.selections.forEach(selection => {

			// get the indentation at the cursor
			const firstLine = editor.document.lineAt(selection.start.line).text;
			const textBeforeCursor = firstLine.slice(0, selection.start.character);
			const indentation = textBeforeCursor.match(/^(\s*)/)?.[0] || "";

			// apply indentation to lines that:
			// 1. aren't the first line (it's already indented)
			// 2. are non-empty
			const indentedText = preprocessedLines
				.map((line, index) =>
					index !== 0 && line.trim().length !== 0 ? indentation + line : line)
				.join(eol);

			// replace the selected text (or insert if selection is empty)
			editBuilder.replace(selection, indentedText);
		});
	});
}

export function activate(context: vscode.ExtensionContext) {
	const disposables = [
		vscode.commands.registerCommand("copy-paste-and-indent.copy", copy),
		vscode.commands.registerCommand("copy-paste-and-indent.paste", paste)
	];

	context.subscriptions.concat(disposables);
}

export function deactivate() { }
