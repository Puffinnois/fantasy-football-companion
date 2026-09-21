# Fantasy Football Companion

Windows desktop companion for a Sleeper fantasy football league: league sync, stats, and decision support.

- Design: `docs/superpowers/specs/`
- Data reference (value & signals payload, definitions, where each number is shown): `docs/reference/value-and-signals.md`
- Plans: `docs/superpowers/plans/`
- Changelog: GitHub Releases (`https://github.com/Puffinnois/fantasy-football-companion/releases`)
- Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
- Dev data (Linux): `~/.config/FantasyCompanion/companion.db`; packaged (Windows): `%APPDATA%\FantasyCompanion\companion.db`
- Windows installer, local test build: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe` (never publishes)
  - Building from WSL needs 32-bit wine for electron-builder's NSIS step (the installer is a 32-bit binary): `sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine64 wine32:i386`. Verified on Ubuntu 24.04 / wine 9.0.
- Release: `npm version <patch|minor|major>` (bumps `package.json`, commits `build: bump version to X.Y.Z`, tags `vX.Y.Z`) → `git push --follow-tags` → the `Release` workflow builds on Windows and uploads the installer to a **draft** GitHub release → add notes, press **Publish**.
- Auto-update: packaged Windows builds check GitHub Releases once at launch and offer **Restart now / Later** once a newer version has downloaded (Later installs on next quit). Installs ≤ 0.10.0 have no updater — reinstall once from the `v0.10.1` release.
- Tests: `npm test`
