# Release Checklist (npm)

1. **Version & metadata**
   - [ ] Update `package.json` version (e.g., `1.0.0`).
   - [ ] Update any mirrored version strings (CLI banner/help, docs metadata) to match.
   - [ ] Confirm package metadata (name, description, repository, keywords, license, `files`/`.npmignore`).
   - [ ] If dependencies changed, run `pnpm install` so `pnpm-lock.yaml` is current.
2. **Artifacts**
   - [ ] Run `pnpm run build` (ensure `dist/` is current).
   - [ ] Verify `bin` mapping in `package.json` points to `dist/bin/oracle-cli.js`.
 - [ ] Produce npm tarball and checksums:
    - `npm pack --pack-destination /tmp` (after build)
    - Move the tarball into repo root (e.g., `oracle-<version>.tgz`) and generate `*.sha1` / `*.sha256`.
    - Keep these files handy for the GitHub release; do **not** commit them.
  - [ ] Rebuild macOS notifier helper with signing + notarization:
    - `cd vendor/oracle-notifier && ./build-notifier.sh` (requires `CODESIGN_ID` and `APP_STORE_CONNECT_*`).
    - Verify tickets: `xcrun stapler validate vendor/oracle-notifier/OracleNotifier.app` and `spctl -a -t exec -vv vendor/oracle-notifier/OracleNotifier.app`.
3. **Changelog & docs**
  - [ ] Update `CHANGELOG.md` (or release notes) with highlights.
  - [ ] Keep changelog entries product-facing only; avoid adding release-status/meta lines (e.g., “Published to npm …”)—that belongs in the GitHub release body.
  - [ ] Verify changelog structure: versions strictly descending, no duplicates or skipped numbers, single heading per version.
  - [ ] Ensure README reflects current CLI options (globs, `--status`, heartbeat behavior).
4. **Validation**
   - [ ] `pnpm run check` (zero warnings allowed; fail on any lint/type warnings).
   - [ ] `pnpm vitest`
   - [ ] `pnpm run lint`
   - [ ] Optional live smoke (with real `OPENAI_API_KEY`): `ORACLE_LIVE_TEST=1 pnpm vitest run tests/live/openai-live.test.ts`
   - [ ] MCP sanity check: with `config/mcporter.json` pointed at the local stdio server (`oracle-local`), run `mcporter list oracle-local --schema --config config/mcporter.json` after building (`pnpm build`) to ensure tools/resources are discoverable.
5. **Publish**
   - [ ] Ensure git status is clean; commit and push any pending changes.
   - [ ] `npm login` (or confirm session) & check 2FA.
   - [ ] `npm publish --tag beta --access public` (adjust tag if needed).
   - [ ] `npm view @steipete/oracle version` (and optionally `npm view @steipete/oracle time`) to confirm the registry shows the new version.
   - [ ] Verify positional prompt still works: `npx -y @steipete/oracle "Test prompt" --dry-run`.
6. **Post-publish**
   - [ ] Promote desired dist-tag (e.g., `npm dist-tag add @steipete/oracle@X.Y.Z latest`).
   - [ ] `git tag vX.Y.Z && git push origin vX.Y.Z` (always tag each release).
   - [ ] `git tag vX.Y.Z && git push --tags`
    - [ ] Create GitHub release for tag `vX.Y.Z`:
      - Title `Oracle X.Y.Z` only (no version/date repetition inside the body).
      - Body = full changelog section for that version, but drop the leading `## X.Y.Z — YYYY-MM-DD` heading to avoid duplicating version/date under the release title.
      - Upload assets: `oracle-<version>.tgz`, `oracle-<version>.tgz.sha1`, `oracle-<version>.tgz.sha256`.
      - Confirm the auto `Source code (zip|tar.gz)` assets are present.
   - [ ] From a clean temp directory (no package.json/node_modules), run `npx @steipete/oracle@X.Y.Z "Smoke from empty dir" --dry-run` to confirm the package installs/executes via npx.
   - [ ] After uploading assets, verify they are reachable (e.g., `curl -I <GitHub-asset-URL>` or download and re-check SHA).
   - [ ] Announce / share release notes.
