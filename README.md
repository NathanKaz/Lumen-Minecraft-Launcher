# Lumen Launcher

A cross-platform Minecraft launcher with a dark interface, version management, and mod/modpack installation.

## Features

- **Launch Minecraft** — official Mojang versions with automatic download of client, libraries, assets, and natives, plus SHA-1 verification. Instance creation supports a multi-select type filter (release / snapshot / beta / alpha) and version search; non-release versions are marked as unstable and loader compatibility warnings are shown.
- **Mod loaders** — Fabric, Forge, and NeoForge installation via official installers.
- **Instances (builds)** — all instances on the home screen with groups (including empty groups), grid/list views, and search. Cards can be dragged between groups; right-click opens context actions (Open / Rename / Edit / Delete). Renaming is available via double-click and group management supports inline rename. Memory is global by default and can be overridden per instance. Opening an instance shows a dedicated full page with its own sidebar, overview dashboard, quick actions, a persistent launch control, and separate sections for mods, worlds, screenshots, tools and settings.
- **Mods** — per-instance mod management: Modrinth catalog search with "Load more" pagination, optional version/loader filters, dependency installation, local `.jar`/`.zip` import, enable/disable, and removal. Clicking a mod in the catalog opens a separate detail panel on the right with screenshots/gallery, description, compatibility info, and links. Bulk actions cover select-all/selected enable/disable/delete, JSON mod-list export/import, `Update all` with a single auto-backup before the batch, and a diagnostics panel that flags duplicate IDs, loader mismatches, unknown and disabled mods. Loader detection reads all metadata in a JAR, so universal Fabric/Forge mods and NeoForge mods are not reported as incompatible; diagnostics refresh immediately after a loader change.
- **Worlds** — a worlds tab with three sections: local `saves` (name, Minecraft version, last played, size, icon from `level.dat`; import from `.zip`/`.mcworld`, export, copy, rename, delete), **Ready-made worlds** from CurseForge (requires your own API key in Settings; supports search, pagination and one-click install into `saves`), and **World generation** datapacks from Modrinth. CurseForge is used for real worlds because Modrinth has no `world` project type; datapacks remain available in their own section instead of pretending to be worlds.
- **Modpacks** — install `.mrpack` files via dialog or drag & drop, or browse the Modrinth modpack catalog with "Load more" pagination and sorting by relevance, popularity, update date or release date. Clicking a modpack opens a detail panel with screenshots, description, and metadata.
- **Screenshots** — dedicated screenshots page with per-instance filtering and an in-instance screenshots section on the instance page; open, download, and delete screenshots from `<instance>/screenshots`.
- **Skins (Account window)** — offline skin library in the Account modal with PNG import (64×64 / 64×32), an interactive 3D model preview (drag to rotate), active skin selection, and wide/slim model switching. The chosen skin is applied to every offline instance through a generated resource pack on launch. Skins are visible only to you: offline mode does not provide a Mojang signature, so other players will not see them.
- **File verification** — compare an instance's client, libraries, and assets against Mojang checksums and optionally repair missing/corrupted files.
- **World backups** — create, list, restore, and delete ZIP backups of an instance's `saves` folder, with a confirmation before restoring. Optional automatic backups are created before mod/version/modpack updates, and `Back up all worlds` creates backups for every instance. Scheduled backups are available in Settings (off by default, 6-hour interval, keep 10 archives) and skip any instance while its game is running; old archives are pruned automatically.
- **Resource & shader packs** — install `.zip` packs per instance, toggle them on/off, and delete them. Packs are enabled through the instance's `options.txt`; the generated offline-skin pack is managed automatically. The in-instance catalog tab installs resource packs and shaders directly from Modrinth.
- **Mod updates** — check installed mods against Modrinth by SHA-1 and update them to the latest compatible version for the instance's Minecraft version and loader.
- **Logs & diagnostics** — the Settings log viewer switches between in-memory launcher logs and real log files/crash reports of the selected instance, with search, level filtering, and a text viewer that reads the tail of large files.
- **Launcher updates & tray** — check for new launcher releases on startup or on demand, then download and install the matching GitHub release asset directly from Settings (SHA-256 verification when published; silent NSIS update on Windows, AppImage relaunch on Linux, DMG/DEB opened for manual installation). The launcher can also minimize to the system tray on close and launch/stop the game from the tray menu.
- **Localization** — full Russian and English interface, including dialogs, toasts, progress messages, and tray menu; switching the language updates the UI immediately.
- **About & project link** — Settings → About shows version, license, author, platform, Electron/Chromium/Node versions and the data directory; the GitHub repository is linked from both About and the sidebar.
- **Instance deletion** — native confirmation dialog listing data to be removed (saves, mods, screenshots, configs, resource/shader packs, options, logs) and the full instance folder path.
- **Instance transfer & bulk actions** — export selected instances (full folders + manifest) to ZIP, import them back with fresh IDs, and run install/export/delete on a selection from the home screen. A separate `Import` action discovers instances from MultiMC/Prism Launcher, CurseForge export archives (chosen in a dialog), and official `.minecraft` launcher profiles (listed last), copying saves/mods/packs/configs into new instances with path-traversal and size checks.
- **Per-instance Java** — override the Java executable and JVM arguments for each build. If no compatible Java is found, the launcher can download a managed Temurin JRE automatically into its own data directory (no system-wide changes).
- **Multiple offline profiles** — create, rename, switch between, and delete local players. Each player has an isolated set of instances, groups, and skins; its deterministic UUID is shown next to the nickname in the account window, sidebar, and player list. Switching profiles closes the current instance view and loads that player's world. Profile folders on disk are kept when a player is removed.
- **Cross-platform builds** — electron-builder targets Windows (NSIS), macOS (DMG, x64 + Apple Silicon), and Linux (AppImage + DEB, x64 + arm64). Ready-to-use `dist:win`, `dist:mac`, `dist:linux`, and `dist:all` scripts plus a GitHub Actions matrix build native artifacts for all three systems.
- **First-run wizard** — a full-window four-step setup for interface language, player name with a live UUID preview, Java detection/installation and an optional vanilla instance. It runs once on a fresh install and can be re-opened from Settings.
- **Global search** — `Ctrl+K` / `Cmd+K` opens a command palette that searches instances, open-instance sections, installed mods and worlds, settings sections and common actions.
- **Crash assistant** — when the game crashes, the launcher analyzes the newest crash report and logs, explains the likely cause and offers concrete fixes (memory, Java, mods, file verification, full report).
- **Update preview** — `Update all` now shows a checklist of `current → latest` versions; select only the updates to apply, with an automatic backup before a full batch.
- **Drop files on an instance** — drop `.jar` mods, `.mrpack` modpacks, `.mcworld`/`.zip` worlds or `.zip` resource packs directly onto an instance card.
- **Notification center** — the titlebar bell keeps a local history of install, update and backup events with unread counts and filtering actions.
- **Instance signals** — cards show mod/update/world counts, last launch and scheduled backup status, with a one-click backup button.
- **Settings search & field help** — filter settings sections by keyword and open `?` tooltips explaining Java, JVM, memory, loader and backup options.
- **Quality of life** — offline account, Java auto-detection, game/launcher logs, memory and resolution settings, custom window chrome.

## Possible improvements

Ideas for future releases, in no particular order:

- **Background and staged updates** — opt-in automatic download/install on exit, stable/beta channels, rollback to the previous launcher version, and signed update manifests with mandatory checksum verification.
- **Multiple Microsoft apps** — save several Azure Client IDs, validate the redirect URI configuration in the UI, and show token/permission status per profile.
- **Instance templates** — reusable presets (loader, Minecraft version, Java, RAM, JVM flags) and one-click cloning of an existing instance without its worlds.
- **Smarter modpack maintenance** — selective file sync after a modpack update, mod version rollback, and conflict resolution when two mods provide the same classes.
- **Server browser** — favorite servers with live ping/MOTD and player counts, direct connect, and quick switching between offline and licensed profiles.
- **Skin library improvements** — tags/search, multiple skin models per profile, and Mojang skin upload for licensed accounts.
- **Insights and recovery** — per-instance playtime charts, crash-history comparison, and suggested fixes applied with one click from the crash assistant.
- **Release engineering** — code signing/notarization, unit and end-to-end tests, and CI that publishes release notes with asset checksums automatically.
- **Unified catalogs** — reuse the CurseForge key for mods/modpacks, show one combined search across CurseForge and Modrinth, and cache metadata for offline browsing with favorite lists.
- **Loader migration assistant** — preview which installed mods are compatible before switching Fabric/Forge/NeoForge, offer compatible replacements, and create a world backup automatically.
- **Safer world installs** — preview world screenshots/description before download, detect required mods/datapacks, and offer an automatic backup before replacing an existing save.

## Development

Requires Node.js 18+ (tested with Node 20 and 24). Project scripts locate a suitable Node runtime automatically: first `LUMEN_NODE`, then nvm-installed versions, then system `node`. If no suitable Node is found, run `nvm install 20 && nvm use 20` or set `LUMEN_NODE=/path/to/node`.

```bash
npm install
npm run dev        # Electron + Vite (hot reload)
npm run dev:web    # renderer-only in browser with mock data
npm run typecheck
npm run build
npm run dist       # package for current platform
npm run dist:linux # AppImage + DEB (x64/arm64)
npm run dist:win   # universal NSIS installer (x64/ia32/arm64)
npm run dist:mac   # DMG (x64/arm64)
```

macOS DMG packaging requires macOS; use the GitHub Actions matrix in `.github/workflows/build.yml` (or a separate runner per OS) to produce all platform artifacts. `npm run dist:all` builds the supported formats for the current host and stores them in separate folders: `release/linux` and `release/win` on non-macOS systems (macOS is skipped with a notice), or `release/mac` on macOS. Individual `dist:*` scripts still write to `release/`.

Launcher data (versions, instances, mods) is stored in the app user data directory, e.g. `~/.config/Lumen Launcher/launcher` on Linux (exact path depends on platform/Electron userData location).

On a Wayland desktop, Electron must be told to use Wayland before it starts; `scripts/run.js` sets `ELECTRON_OZONE_PLATFORM_HINT=wayland` automatically for `dev`/`preview`. Without it Electron falls back to X11 and can fail with `Authorization required, but no authorization protocol specified` when GNOME rotates its Xwayland `XAUTHORITY` file. If you launch a packaged build directly, start it with the same variable:

```bash
ELECTRON_OZONE_PLATFORM_HINT=wayland ./release/linux-unpacked/lumen-launcher
```

Build artifacts are not needed for development and can be removed to reclaim space: `node_modules/` (~570 MB, restore with `npm install`), `release/` (~1.2 GB, restore with `npm run dist`), `out/` and `dist/`. All of them are gitignored.

## Authentication

The launcher supports two account types, each with its own builds, groups and skin library:

- **Offline profile** — a player name and a locally generated UUID/token. Works for single-player and servers without license checks.
- **Microsoft account** — a licensed Minecraft profile obtained through the full MSA → Xbox Live → XSTS → Minecraft chain. The Minecraft access token is used for `auth_access_token` and refreshed automatically before launch.

### Setting up Microsoft sign-in

The **Sign in with Microsoft** button becomes active as soon as your own Azure application Client ID is saved in Settings → General → Azure application (client) ID. Without it the offline profile is used; the first-run wizard lets you create one.

Microsoft requires every third-party launcher to use its own Azure application, so a one-time setup is needed:

1. Open [App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) in the Azure portal and create a new registration.
2. Set **Supported account types** to **Personal Microsoft accounts only** (the consumer `consumers` tenant).
3. Add a **Mobile and desktop applications** platform with the redirect URI `http://localhost`. The launcher starts a temporary loopback server on a free port, so any port is accepted.
4. Copy the **Application (client) ID** into **Settings → General → Azure application (client) ID**. The Account dialog then enables the Microsoft sign-in button.
5. New Azure applications must be approved for the Minecraft API via the [Minecraft API access request form](https://aka.ms/mce-reviewappid). Without that approval `api.minecraftservices.com` returns HTTP 403.

Afterwards click **Sign in with Microsoft** in the Account dialog: the system browser opens the Microsoft login page, and the launcher receives the authorization code on the loopback address. Sign-in uses PKCE and a random `state` value. The long-lived refresh token is stored in `msa-tokens.json` and encrypted with Electron `safeStorage` (OS keychain/DPAPI) when available. If the platform has no keyring, the file is created with owner-only permissions and a plaintext fallback so the launcher still works.

Signing out removes the stored refresh token and converts the record back into an offline profile while keeping its instances. Uploading skins to other players additionally requires the signed Minecraft profile API; the built-in skin library is still local-only.

### Setting up the CurseForge world catalog

The **Ready-made worlds** section uses CurseForge because Modrinth does not have a `world` project type. Create a personal API key in the [CurseForge developer console](https://console.curseforge.com/?#/api-keys) and paste it into **Settings → General → CurseForge API key**. The key is stored locally in launcher state and sent only to `api.curseforge.com`; without it the tab shows a setup notice (demo mode uses mock worlds). World generation datapacks remain available separately in **World generation**.

## Sources

- Mojang version manifest — version list and client metadata.
- Fabric Meta API — Fabric loader profiles.
- Forge promotions/Maven and NeoForge Maven — loader installers.
- Modrinth API v2 — mods, modpacks, resource packs, shaders, and worldgen datapacks (used by the packs, shader and world-generation catalogs).
- CurseForge API — ready-made world catalog (requires a personal API key; Modrinth has no `world` project type).
- `prismarine-nbt` — reads and rewrites `level.dat` metadata for local worlds.
- Adoptium API — managed JRE downloads for automatic Java installation.

## Architecture

```
src/main/     Electron main process: download, install, launch, IPC
src/preload/  typed contextBridge API
src/shared/   shared types and IPC channel names
src/renderer/ React UI (Tailwind CSS + zustand + framer-motion)
```

The implementation does not rely on ready-made launcher cores: version downloading, JSON inheritance resolution, classpath assembly, and process launch are implemented explicitly for precise progress reporting and error control.
