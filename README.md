# Lumen Launcher

A cross-platform Minecraft launcher with a dark interface, version management, and mod/modpack installation.

## Features

- **Launch Minecraft** — official Mojang versions with automatic download of client, libraries, assets, and natives, plus SHA-1 verification.
- **Mod loaders** — Fabric, Forge, and NeoForge installation via official installers.
- **Instances (builds)** — all instances on the home screen with groups (including empty groups), grid/list views, and search. Cards can be dragged between groups; right-click opens context actions (Open / Rename / Edit / Delete). Renaming is available via double-click and group management supports inline rename. Memory is global by default and can be overridden per instance. Opening an instance shows its mods, screenshots, and settings.
- **Mods** — per-instance mod management: Modrinth catalog search with "Load more" pagination, optional version/loader filters, dependency installation, local `.jar`/`.zip` import, enable/disable, and removal. Clicking a mod in the catalog opens a separate detail panel on the right with screenshots/gallery, description, compatibility info, and links.
- **Modpacks** — install `.mrpack` files via dialog or drag & drop, or install modpacks from Modrinth. Clicking a modpack in the catalog opens a detail panel with screenshots, description, and metadata.
- **Screenshots** — dedicated screenshots page with per-instance filtering and an in-instance screenshots tab in the instance detail view; open, download, and delete screenshots from `<instance>/screenshots`.
- **Skins** — offline skin library with PNG import (64×64 / 64×32), preview, active skin selection, and wide/slim model switching. The chosen skin is applied to every offline instance through a generated resource pack on launch. Skins are visible only to you: offline mode does not provide a Mojang signature, so other players will not see them.
- **File verification** — compare an instance's client, libraries, and assets against Mojang checksums and optionally repair missing/corrupted files.
- **World backups** — create, list, restore, and delete ZIP backups of an instance's `saves` folder, with a confirmation before restoring.
- **Resource & shader packs** — install `.zip` packs per instance, toggle them on/off, and delete them. Packs are enabled through the instance's `options.txt`; the generated offline-skin pack is managed automatically.
- **Mod updates** — check installed mods against Modrinth by SHA-1 and update them to the latest compatible version for the instance's Minecraft version and loader.
- **Launcher updates & tray** — check for new launcher releases on startup or on demand, minimize to the system tray on close, and launch/stop the game from the tray menu.
- **Localization** — full Russian and English interface, including dialogs, toasts, progress messages, and tray menu; switching the language updates the UI immediately.
- **Instance deletion** — native confirmation dialog listing data to be removed (saves, mods, screenshots, configs, resource/shader packs, options, logs) and the full instance folder path.
- **Quality of life** — offline account, Java auto-detection, game/launcher logs, memory and resolution settings, custom window chrome.

## Development

Requires Node.js 18+ (tested with Node 20 and 24). Project scripts locate a suitable Node runtime automatically: first `LUMEN_NODE`, then nvm-installed versions, then system `node`. If no suitable Node is found, run `nvm install 20 && nvm use 20` or set `LUMEN_NODE=/path/to/node`.

```bash
npm install
npm run dev        # Electron + Vite (hot reload)
npm run dev:web    # renderer-only in browser with mock data
npm run typecheck
npm run build
npm run dist       # package for current platform
npm run dist -- --linux AppImage deb
npm run dist -- --win nsis
npm run dist -- --mac dmg
```

Launcher data (versions, instances, mods) is stored in the app user data directory, e.g. `~/.config/Lumen Launcher/launcher` on Linux (exact path depends on platform/Electron userData location).

On a Wayland desktop, Electron must be told to use Wayland before it starts; `scripts/run.js` sets `ELECTRON_OZONE_PLATFORM_HINT=wayland` automatically for `dev`/`preview`. Without it Electron falls back to X11 and can fail with `Authorization required, but no authorization protocol specified` when GNOME rotates its Xwayland `XAUTHORITY` file. If you launch a packaged build directly, start it with the same variable:

```bash
ELECTRON_OZONE_PLATFORM_HINT=wayland ./release/linux-unpacked/lumen-launcher
```

Build artifacts are not needed for development and can be removed to reclaim space: `node_modules/` (~570 MB, restore with `npm install`), `release/` (~1.2 GB, restore with `npm run dist`), `out/` and `dist/`. All of them are gitignored.

## Authentication strategy

Currently uses an offline profile (player name, local UUID, token), suitable for single-player and servers without license verification. Microsoft sign-in (PKCE → Xbox Live → XSTS → Minecraft profile) is planned as a next step.

## Sources

- Mojang version manifest — version list and client metadata.
- Fabric Meta API — Fabric loader profiles.
- Forge promotions/Maven and NeoForge Maven — loader installers.
- Modrinth API v2 — mods and modpacks.

## Architecture

```
src/main/     Electron main process: download, install, launch, IPC
src/preload/  typed contextBridge API
src/shared/   shared types and IPC channel names
src/renderer/ React UI (Tailwind CSS + zustand + framer-motion)
```

The implementation does not rely on ready-made launcher cores: version downloading, JSON inheritance resolution, classpath assembly, and process launch are implemented explicitly for precise progress reporting and error control.
