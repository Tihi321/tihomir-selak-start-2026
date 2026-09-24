# Start page 2026 — setup handoff

## Phase 0 setup record

- Repository: `https://github.com/Tihi321/tihomir-selak-start-2026`
- Local clone: `C:\projects\Personal\tihomir-selak-start-2026`
- Initial default branch: `master`
- Initial commit: `30d3234` (README-only seed)
- Work branch: `feat/start-page-foundation`
- The plan's example `main` branch did not match the GitHub repository's actual default. The branch was left as `master`; the workflow listens to both `master` and `main` for quality checks and only considers `master` for production deployment until the default is intentionally changed.
- `plan.md` is the complete plan copied from the coordination workspace.

## CI prepared

`.github/workflows/ci.yml` follows the quality/deploy separation used by the other 2026 personal sites. On this README-only seed it checks that the README exists and is non-empty. Once `package.json` is added, it requires an immutable Yarn install and runs `format:check`, `check`, and `build`; it also runs Playwright browser checks when the `test:e2e` script exists. Production deployment targets only `master`, only after a package scaffold exists, and skips unless both `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` are configured.

No credentials were added and no deployment was run.

## Scope and remaining Phase 0 work

This handoff covers repository setup and CI only. No application scaffold was added. The legacy site and CDN repositories were inspected as read-only references and were not changed. The remaining plan Phase 0 items—legacy page captures/audit, seed install/build verification, and opening the repository as the active Codex workspace—were not performed in this setup task. Shell environments reported different tool availability: the setup shell reported Node 24.14.0, Corepack 0.34.6, and Yarn 4.13.0; the coordinator's non-escalated shell reported Node 24.19.0 and no Corepack or Yarn on `PATH`. The seed has no manifest or lockfile to install yet.
