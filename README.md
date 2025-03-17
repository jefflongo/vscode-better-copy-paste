# Better Copy/Paste

[Better Copy/Paste](https://marketplace.visualstudio.com/items?itemName=jefflongo.better-copy-paste) adds a number of useful features to copy/paste such as auto-indentation of pasted text, and a clipboard history. There are several other extensions which attempt to serve a similar purpose; I found that none of them worked quite right, so I made my own.

![Better Copy/Paste Demo](/assets/demo.gif)

## Installation

There is no special setup to use this extension. This extension simply shadows the default copy/cut/paste keybinds. The clipboard history can be accessed by adding shift to the paste keybind.

## How It Works

When copying a block of text, the block is unindented before saving it to the clipboard. It does this by determining the minimum indentation level in the block, ignoring whitespace-only lines. Entire lines are considered when determining indentation level, even if the indentation is not included in the selection.

When pasting, the indentation level is determined for the line that the cursor is on or where a selection is started. The clipboard text is reindented to this indentation level before pasting. Multiple cursors/selections are supported.

## Limitations

### Paste Indentation Is Not Determined by Language Features

Paste indentation level is determined by examining existing indentation on the line where the cursor is present or where a selection is started. This means that the line must already be indented to the desired indentation level before pasting. This extension _does not_ look at surrounding context, such as `{` or `}` characters from preceding lines to determine indentation level.

### Mixing Tabs and Spaces Is Not Supported

Currently, indentation is assumed to be either all tabs or all spaces.

### Other Extensions That Shadow Copy/Paste

This extension is not compatible with other extensions that shadow the copy/cut/paste keybinds. This is because there is no API for intercepting copy/paste outside of binding over the keybinds. To my knowledge, there is no way for extensions to share the keybinds (assuming the keybinds are in the same "when" context), nor would we want other extensions interacting with the clipboard.

### Externally Copied Text

If a block of text is copied from outside of VS Code, an attempt will be made to unindent the block before pasting. However, if the first line is not at the lowest level of indentation in the block and its indentation is not included in the selection, the block will not paste correctly. This is because the context from the first line is lost. For example, consider the following block of text:

```python
if foo:
    bar()   # <-- selection starts just before bar, whitespace was NOT selected
baz()       # <-- selection ends just after baz
```

If the copied selection consists of the calls to `bar` and `baz`, without including the indentation preceding `bar`, it is impossible to differentiate between the following pastes:

```python
# correct
    bar()
baz()
```

```python
# incorrect
bar()
baz()
```

To reiterate, these _can_ be differentiated when this selection is copied within VS Code, where this extension has the context of the entire document, but cannot be differentiated when the text is copied externally. To work around this, be sure to copy leading whitespace when copying from outside of VS Code.
