# Fantasy Football Companion

Windows desktop companion for a Sleeper fantasy football league: league sync, stats, and decision support.

- Design: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
- Dev data (Linux): `~/.config/FantasyCompanion/companion.db`; packaged (Windows): `%APPDATA%\FantasyCompanion\companion.db`
- Windows installer: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe`
  - Building from WSL needs 32-bit wine for electron-builder's NSIS step (the installer is a 32-bit binary): `sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine64 wine32:i386`. Verified on Ubuntu 24.04 / wine 9.0.
- Tests: `npm test`
