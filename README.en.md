<p align="center"><img src="./icon.svg" width="88" height="88" alt=""></p>

# Smart Namer (dsh-smart-namer)

Adds smart naming to the DSH sidebar: the model reads a session's or workspace's own content, offers a few short name candidates, and you rename by picking one. There is one entry point for sessions, one for workspaces, plus a `rename_target` tool for agents.

Only public DSH APIs are used; the host installation is never modified.

[![npm](https://img.shields.io/npm/v/dsh-smart-namer.svg)](https://www.npmjs.com/package/dsh-smart-namer) [![license](https://img.shields.io/npm/l/dsh-smart-namer.svg)](LICENSE)

[中文](README.md) · [English](README.en.md)

## Install

From npm (recommended — prebuilt, no build approval):

```bash
dsh plugin --profile desktop add dsh-smart-namer
```

From GitHub (latest source):

```bash
dsh plugin --profile desktop add github:Blueteemo/dsh-smart-namer
```

From a local checkout (development):

```bash
dsh plugin --profile desktop add file:/absolute/path/to/dsh-smart-namer
```

Or use the prebuilt tarball:

```bash
dsh plugin --profile desktop add https://github.com/Blueteemo/dsh-smart-namer/releases/latest/download/dsh-smart-namer.tgz
```

If the sidebar entry does not appear, **quit the app completely (Cmd+Q) and reopen it**. The client bundle is served with an immutable cache and memoized in the host, so refreshing the page does not reload client code.

## Usage

### Session

1. Hover a session row and click `...`
2. Click **Smart rename**
3. The dialog shows "Thinking…", then up to 3 candidates
4. Pick one: it renames immediately, closes the dialog, and shows "Renamed to X"
5. `Esc` or clicking the backdrop closes without changing anything

### Workspace

Sidebar **More** menu → **Smart rename workspace**. A picker lets you switch between workspaces; candidates refresh per workspace.

### `/rename`

Type `/rename` in the composer:

- `/rename` — asks the model, applies the first candidate, replies `Renamed to "X". Alternatives: A, B`
- `/rename emphasise the tooling` — the text becomes a **preference hint** for the model; the model still generates the names
- If a call fails it says why — too slow, model service error (with the upstream message), or no usable name came back — and leaves the title unchanged
- On a session with no messages yet: `This session has no content yet — say a few things first.`

## What it reads

| Target | Material |
|---|---|
| **Session** | Existing title, owning project, project codes, and 5 user messages sampled evenly across the conversation |
| **Workspace** | Decoded folder name, codes, the 5 most recent session titles, and the latest user message |

Tool output, file contents and full logs are never read — what goes to the model is exactly the text above.

Naming uses the session's own model by default; a workspace has no model of its own, so it uses the profile default. Both can be changed on the plugin page (next section). One call, 20 second timeout, never streamed to the user; failures say whether the model was too slow, the model service errored (with the upstream message), or no usable name came back.

## Custom prompts and models

The plugin page (Settings → Plugins → dsh-smart-namer → Configure) lets you edit both prompt templates:

- **Load default template** fills the box with the built-in text so you can edit it
- **Reset to default** clears the saved value, falling back to the built-in template
- **Save** applies immediately — no restart needed

## Agent tool

`rename_target` renames directly, without calling the model:

```json
{ "kind": "session", "id": "session-...", "title": "New title" }
```

`kind` is `session` or `workspace`. Session renames go through `sessionController.rename`; workspace renames through `workspaceController.rename` (validating non-empty and uniqueness).

## Screenshots

Session menu entry:

![session menu](docs/menu.png)

Dark theme:

![dark](docs/dark.png)

Light theme:

![light](docs/light.png)

Workspace dialog:

![workspace](docs/workspace.png)

Renamed toast:

![toast](docs/toast.png)

`/rename` command:

![rename command](docs/rename-command.png)

Contributor notes (tests, layout, release steps) live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
