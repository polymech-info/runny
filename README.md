<p align="center">
  <img src="https://raw.githubusercontent.com/icydotdev/runny/main/assets/logo.svg" width="120" alt="Runny" />
</p>

<h1 align="center">Runny</h1>

<p align="center">
  <strong>A visual dashboard for all your npm scripts. Zero config.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@polymech/runny"><img src="https://img.shields.io/npm/v/@polymech/runny.svg?style=flat&colorA=18181B&colorB=6366f1" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@polymech/runny"><img src="https://img.shields.io/npm/dm/@polymech/runny.svg?style=flat&colorA=18181B&colorB=6366f1" alt="npm downloads" /></a>
  <a href="https://github.com/polymech-info/runny/blob/main/LICENSE"><img src="https://img.shields.io/github/license/polymech-info/runny?style=flat&colorA=18181B&colorB=6366f1" alt="license" /></a>
</p>

<p align="center">
  Maintained fork of <a href="https://github.com/icydotdev/runny">icydotdev/runny</a> · published as <code>@polymech/runny</code>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#features">Features</a> · <a href="#screenshots">Screenshots</a> · <a href="#usage">Usage</a> · <a href="#soft-ci">Soft CI</a> · <a href="#contributing">Contributing</a>
</p>

---

Stop memorising script names. Stop tabbing between terminals. **Runny** scans your project for every `package.json`, lays out all your scripts in a clean GUI, and lets you run, stop, and monitor them — all from your browser.

Works with **npm**, **pnpm**, and **yarn** workspaces. Monorepos with 50 packages or solo projects with 3 scripts — same experience.

<p align="center">
  <img src="https://raw.githubusercontent.com/icydotdev/runny/main/assets/runny.gif" width="800" alt="Runny dashboard" />
</p>

## Quick Start

```bash
npm i -g @polymech/runny
cd your-project
runny
```

That's it. Opens your browser. Every script is right there.

Or run without installing:

```bash
npx @polymech/runny
```

> Original project: [github.com/icydotdev/runny](https://github.com/icydotdev/runny) · npm [`@icydotdev/runny`](https://www.npmjs.com/package/@icydotdev/runny)

## Features

### Core

- **Instant discovery** — Finds every `package.json`, including workspace packages
- **One-click run/stop** — Process-tree cleanup with [tree-kill](https://www.npmjs.com/package/tree-kill) (no orphans)
- **Live terminal** — WebSocket stdout/stderr with ANSI colors (xterm.js)
- **Smart script grouping** — Colon prefixes (`test`, `test:ci`, `test:dev`) nest visually
- **Dark & light mode** — System preference + manual toggle
- **Package manager auto-detect** — pnpm, yarn, or npm
- **Monorepo-native** — Expand/collapse packages; works with Turbo/Nx/Lerna scripts
- **Zero project deps** — `npx` and go; nothing is uploaded

### Favourites & organisation

- **Favourite groups** — Multiple named lists, reorder groups and scripts by drag-and-drop
- **Ctrl+drag to duplicate** — Copy a favourite into another group (keep the source)
- **Mute in a group** — Skip muted scripts when running a favourite list
- **Custom descriptions** — Hover notes on favourite scripts
- **Hide scripts** — Tuck away noise from the sidebar

### Soft CI (sequential sessions)

- **Run a colon-group or favourite list sequentially** — fail-fast by default
- **Session strip** — Live step progress; stop a running session
- **CLI** — `runny session run …` / `runny session list` for headless soft-CI
- **Terminal auto-follow** — Active step output stays in view (toggle off via prev/next)

### Terminal & search

- **Stdout / stderr filters** — Toggle streams; preference persisted
- **Cycle running tasks** — Prev/next in the terminal header, or `Alt+←` / `Alt+→`
- **Finished markers** — Compact `DONE` / `FAIL` / `SKIP` + relative time on rows
- **Fuzzy search** — camelCase, `:` `-` `_`, acronyms, and subsequences; matching trees start collapsed

### Packaging

- **Single Rspack client bundle** — one `runny.bundle.js` for publish (`dist/client`)
- **Local-only** — Express + WebSocket on `127.0.0.1`; no telemetry

## Screenshots

<details>
<summary>Dark mode</summary>
<p align="center">
  <img src="https://raw.githubusercontent.com/icydotdev/runny/main/assets/runny-dashboard.png" width="800" alt="Dark mode" />
</p>
</details>

<details>
<summary>Light mode</summary>
<p align="center">
  <img src="https://raw.githubusercontent.com/icydotdev/runny/main/assets/screenshot-light.png" width="800" alt="Light mode" />
</p>
</details>

<details>
<summary>Script grouping</summary>
<p align="center">
  <img src="https://raw.githubusercontent.com/icydotdev/runny/main/assets/screenshot-grouping.png" width="400" alt="Script grouping" />
</p>
</details>

<details>
<summary>Favourites</summary>
<p align="center">
  <img src="https://raw.githubusercontent.com/icydotdev/runny/main/assets/screenshot-favourites.png" width="400" alt="Favourites" />
</p>
</details>

## Usage

```bash
# Run in current directory
runny

# Custom port
runny --port 4000

# Don't open browser automatically
runny --no-browser

# Via npx (no install)
npx @polymech/runny
```

### Soft CI

```bash
# Sequential colon-group (e.g. scripts named build:*, test:*)
runny session run build --package my-app

# Favourite group by id path
runny session run favourite:<groupId>

# List recent / active sessions
runny session list

# Keep going after a failed step
runny session run test --no-fail-fast
```

In the UI: use the **Play** control on a script group or favourite group header.

### Supported project types

| Type                | How it works                                                  |
| ------------------- | ------------------------------------------------------------- |
| **Single package**  | Reads `package.json` scripts, shows them flat (no collapsing) |
| **npm workspaces**  | Reads `workspaces` field from root `package.json`             |
| **yarn workspaces** | Reads `workspaces` field from root `package.json`             |
| **pnpm workspaces** | Reads `pnpm-workspace.yaml`                                   |

### How it works

1. Runny starts a lightweight local server (Express + WebSocket)
2. It scans your project for `package.json` files based on your workspace config
3. A React frontend opens in your browser showing all discovered scripts
4. When you click **Play**, Runny spawns the script as a child process using your package manager
5. stdout/stderr stream to the browser terminal in real time via WebSocket
6. When you click **Stop**, the entire process tree is killed cleanly — no orphaned processes

Your code is never uploaded anywhere. Everything runs locally on your machine.

Config (favourites, muted scripts, descriptions, theme, etc.) is stored under your user config directory as `runny-config.json`.

## FAQ

<details>
<summary><strong>How is this related to the original Runny?</strong></summary>

This repo is a maintained fork of <a href="https://github.com/icydotdev/runny">icydotdev/runny</a>, published on npm as <code>@polymech/runny</code>. Upstream remains available as <a href="https://www.npmjs.com/package/@icydotdev/runny"><code>@icydotdev/runny</code></a>.

</details>

<details>
<summary><strong>Does this upload my code / phone home?</strong></summary>

No. Runny is a local-only tool. The server runs on `127.0.0.1`, the frontend is bundled static assets served from your machine. There are zero network requests to external services.

</details>

<details>
<summary><strong>Can I use this in CI?</strong></summary>

The GUI is aimed at local development. Soft-CI sessions (`runny session run …`) can run sequential script groups headlessly on a machine that has your package manager installed — still not a replacement for your real CI matrix.

</details>

<details>
<summary><strong>What about long-running scripts like `dev`?</strong></summary>

That's Runny's sweet spot. Start your dev servers, watch processes, and build watchers — see all their output in one place, stop them cleanly with one click. Use the terminal prev/next controls to jump between running tasks.

</details>

<details>
<summary><strong>Will stopping a script leave zombie processes?</strong></summary>

No. Runny uses <a href="https://www.npmjs.com/package/tree-kill">tree-kill</a> to kill entire process trees. When you stop `pnpm run dev`, it kills pnpm, node, and any child processes spawned by your dev server.

</details>

<details>
<summary><strong>Does it work with Turborepo / Nx / Lerna?</strong></summary>

Yes — Runny reads workspace configuration (`pnpm-workspace.yaml` or the `workspaces` field in `package.json`), not your build orchestrator. Your Turbo/Nx scripts appear like any other script and can be run from Runny.

</details>

## Roadmap

- [x] Soft-CI sessions for groups & favourite lists
- [x] Favourite groups, mute, Ctrl+drag duplicate
- [x] Terminal stream filters + cycle running tasks
- [x] Fuzzy search
- [x] Single Rspack client bundle
- [ ] Multi-terminal panes (side-by-side)
- [ ] Keyboard shortcuts (`Ctrl+K` search, arrow navigation, `Enter` to run)
- [ ] Desktop notifications when scripts finish or error
- [ ] Detect externally-running scripts started outside Runny
- [ ] Environment variable overrides per script

## Contributing

Contributions are welcome — open an issue or PR on [polymech-info/runny](https://github.com/polymech-info/runny). For upstream discussion, see [icydotdev/runny](https://github.com/icydotdev/runny).

```bash
git clone https://github.com/polymech-info/runny.git
cd runny
npm install
npm run dev
```

This starts the Express API and the Rspack dev server concurrently. Set `TARGET_DIR` to point at a project to test against:

```bash
# Windows (PowerShell)
$env:TARGET_DIR="C:\path\to\your-monorepo"; npm run dev

# macOS / Linux
TARGET_DIR=~/your-monorepo npm run dev
```

Dev UI: `http://127.0.0.1:5173` (proxies `/api` and `/ws` to the API on `:3717`).

```bash
npm run build   # dist/cli.js + dist/client/runny.bundle.js
```

## License

MIT © [Sam Kavanagh](https://icy.dev) — original [icydotdev/runny](https://github.com/icydotdev/runny)
