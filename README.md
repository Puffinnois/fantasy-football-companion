# Fantasy Football Companion

Windows desktop companion for a Sleeper fantasy football league: league sync, stats, and decision support.

- Design: `docs/superpowers/specs/`
- Data reference (value & signals payload, definitions, where each number is shown): `docs/reference/value-and-signals.md`
- Plans: `docs/superpowers/plans/`
- Changelog: GitHub Releases (`https://github.com/Puffinnois/fantasy-football-companion/releases`) — each release's notes are what the in-app update popup shows.
- Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
- Dev data (Linux): `~/.config/FantasyCompanion/companion.db`; packaged (Windows): `%APPDATA%\FantasyCompanion\companion.db`
- Windows installer, local test build: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe` (never publishes)
  - Building from WSL needs 32-bit wine for electron-builder's NSIS step (the installer is a 32-bit binary): `sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine64 wine32:i386`. Verified on Ubuntu 24.04 / wine 9.0.
- Release: `npm version <patch|minor|major>` (bumps `package.json`, commits `build: bump version to X.Y.Z`, tags `vX.Y.Z`) → `git push --follow-tags` → the `Release` workflow builds on Windows and uploads the installer to a **draft** GitHub release → add notes, press **Publish**.
- Auto-update: packaged Windows builds check GitHub Releases at launch and hourly. A green **Update to X.Y.Z** button appears at the bottom of the sidebar once a newer version is found; it opens a popup with the release notes and **Update & restart** (silent install, relaunch). Installs ≤ 0.10.0 have no updater — reinstall once from the latest release. Windows **Smart App Control** blocks the unsigned installer; it has to be off (code signing is the proper fix, not done yet).
- Tests: `npm test`
