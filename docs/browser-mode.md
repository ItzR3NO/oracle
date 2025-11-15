# Browser Mode

`oracle --engine browser` routes the assembled prompt bundle through the ChatGPT web UI instead of the Responses API. (Legacy `--browser` still maps to `--engine browser`, but it will be removed.) The CLI writes the same session metadata/logs as API runs, but the payload is pasted into ChatGPT via a temporary Chrome profile.

## Current Pipeline

1. **Prompt assembly** – we reuse the normal prompt builder (`buildPrompt`) and the markdown renderer. Browser mode now pastes only the `[SYSTEM]/[USER]` text into the ChatGPT composer and uploads a temporary `.md` bundle (with the `[FILE: path]` markers) as an attachment before sending the prompt.
2. **Automation stack** – code lives in `src/browserMode.ts` and is a lightly refactored version of the `oraclecheap` utility:
   - Launches Chrome via `chrome-launcher` and connects with `chrome-remote-interface`.
   - (Optional) copies cookies from the requested macOS Chrome profile via `chrome-cookies-secure` so users stay signed in.
   - Navigates to `chatgpt.com`, switches the model (currently just label-matching for GPT-5.1/GPT-5 Pro), pastes the prompt, waits for completion, and copies the markdown via the built-in “copy turn” button.
   - Cleans up the temporary profile unless `--browser-keep-browser` is passed.
3. **Session integration** – browser sessions use the normal log writer, add `mode: "browser"` plus `browser.config/runtime` metadata, and log the Chrome PID/port so `oracle session <id>` (or `oracle status <id>`) shows a marker for the background Chrome process.
4. **Usage accounting** – we estimate input tokens with the same tokenizer used for API runs and estimate output tokens via `estimateTokenCount`. `oracle status` therefore shows comparable cost/timing info even though the call ran through the browser.

### CLI Options

- `--engine browser`: enables browser mode (legacy `--browser` remains as an alias for now).
- `--browser-chrome-profile`, `--browser-chrome-path`: cookie source + binary override (defaults to the standard `"Default"` Chrome profile so existing ChatGPT logins carry over).
- `--browser-timeout`, `--browser-input-timeout`: `900s`/`30s` defaults using `ms|s|m` syntax.
- `--browser-no-cookie-sync`, `--browser-headless`, `--browser-hide-window`, `--browser-keep-browser`, and the global `-v/--verbose` flag for detailed automation logs.
- `--browser-url`: override ChatGPT base URL if needed.
- `--model`: the same flag used for API runs controls the ChatGPT picker. Pass descriptive labels such as `--model "ChatGPT 5.1 Instant"` when you want a specific browser variant; canonical API names (`gpt-5-pro`, `gpt-5.1`) still work and map to their default picker labels.
- Cookie sync is mandatory—if we can’t copy cookies from Chrome, the run exits early. Use the hidden `--browser-allow-cookie-errors` flag only when you’re intentionally running logged out (it skips the early exit but still warns).

All options are persisted with the session so reruns (`oracle exec <id>`) reuse the same automation settings.

## Limitations / Follow-Up Plan

- **Attachment lifecycle** – we currently collapse all resolved `--file` inputs into a single temporary `.md` document and upload it via the composer’s hidden `<input type="file">`. That keeps uploads stable but we still want to support per-file attachments (and potentially binary uploads) plus a `--browser-inline-files` escape hatch for debugging. Follow-up work should also record attachment metadata in the session logs.
- **Model picker drift** – we currently rely on heuristics to pick GPT-5.1/GPT-5 Pro. If OpenAI changes the DOM we need to refresh the selectors quickly. Consider snapshot tests or a small “self check” command.
- **Non-mac platforms** – window hiding uses AppleScript today; Linux/Windows just ignore the flag. We should detect platforms explicitly and document the behavior.
- **Streaming UX** – browser runs cannot stream tokens, so we log a warning before launching Chrome. Investigate whether we can stream clipboard deltas via mutation observers for a closer UX.

## Testing Notes

- `pnpm test --filter browser` does not exist yet; manual runs with `--engine browser -v` are the current validation path.
- Most of the heavy lifting lives in `src/browserMode.ts`. If you change selectors or the mutation observer logic, run a local `oracle --engine browser --browser-keep-browser` session so you can inspect DevTools before cleanup.
