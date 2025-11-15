# Agent Instructions

This repository relies on autonomous agents to run the `oracle` CLI safely. When you update the runner or CLI behavior, add a short note here so future agents inherit the latest expectations. These guidelines supplement the existing system/developer instructions.

## Current Expectations

- When a user pastes a CLI command that is failing and you implement a fix, only execute that command yourself as the *final* verification step. (Skip the rerun entirely if the command would be destructive or dangerous—ask the user instead.)
- Browser runs now exist (`oracle --browser`). They spin up a Chrome helper process, log its PID in the session output, and shouldn't be combined with `--preview`. If you modify this flow, keep `docs/browser-mode.md` updated.
- Browser mode now aggregates all `--file` inputs into a temporary `.md` attachment that gets uploaded via the ChatGPT composer and deleted immediately after it lands. If you tweak the attachment workflow, sync both this note and `docs/browser-mode.md`.
- Browser mode inherits the `--model` flag as its picker target—pass strings like `--model "ChatGPT 5.1 Instant"` to hit UI-only variants; canonical API names still map to their default labels automatically. Cookie sync now defaults to Chrome's `"Default"` profile so you stay signed in unless you override it, and the run aborts if cookie copying fails (use the hidden `--browser-allow-cookie-errors` override only when you truly want to proceed logged out).
- Headful debugging: if you need to inspect the live Chrome composer, run the browser command inside `tmux` with `--browser-keep-browser`, note the logged DevTools port, and hook up `chrome-devtools-mcp` (see `docs/manual-tests.md` for the full checklist).
- Need ad‑hoc browser control? Use `pnpm tsx scripts/browser-tools.ts --help` for Mario Zechner–style start/nav/eval/screenshot tools before reaching for MCP servers.
- **Always ask before changing tooling** – package installs, `pnpm approve-builds`, or swaps like `sqlite3` → `@vscode/sqlite3` require explicit user confirmation. Suggest the change and wait for approval before touching dependencies or system-wide configs.
- **Interactive prompts** – when you must run an interactive command (e.g., `pnpm approve-builds`, `git rebase --interactive`), start a `tmux` session first (`tmux new -s oracle`) so the UI survives and the user can attach if needed.
- **Respect existing files** – do not delete or rename folders/files you don’t recognize. Other agents (or humans) are working here; ask before removing shared artifacts like `config/`.
- `oracle session --clear --hours <n>` (hidden alias: `--clean`) now mirrors `oracle status --clear` for pruning cached runs, and `oracle status` prints a tip pointing to it—use that flag instead of manipulating `~/.oracle` manually.
