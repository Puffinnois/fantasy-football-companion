# Fantasy Football Companion

Windows desktop companion for a Sleeper fantasy football league: league sync, stats, and decision support.

- Design: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
- Dev data (Linux): `~/.config/FantasyCompanion/companion.db`; packaged (Windows): `%APPDATA%\FantasyCompanion\companion.db`
- Windows installer: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe`
  - Building from WSL needs `wine` (`sudo apt-get install -y wine64`) for electron-builder's NSIS step.
- Tests: `npm test`
