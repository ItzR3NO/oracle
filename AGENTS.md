# AGENTS.MD

READ ~/Projects/agent-scripts/{AGENTS.MD,TOOLS.MD} BEFORE ANYTHING (skip if files missing).

Oracle-specific notes:
- Live smoke tests: OpenAI live tests are opt-in. Run `ORACLE_LIVE_TEST=1 pnpm vitest run tests/live/openai-live.test.ts` with a real `OPENAI_API_KEY` when you need the background path; gpt-5-pro can take ~10 minutes.
- Wait defaults: gpt-5-pro API runs detach by default; use `--wait` to stay attached. gpt-5.1 and browser runs block by default; every run prints `oracle session <id>` for reattach.
- Session storage: Oracle stores session data under `~/.oracle`; delete it if you need a clean slate.
- Ignore project folders whose names contain "copy" or end with a number (e.g., `sweetistics copy`, `sweetistics2`).
