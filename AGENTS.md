# Agent instructions

Rules for coding agents (including OpenCode) working in this repository.

## Before you finish any task

Always complete this checklist before reporting work as done. None of these steps are optional:

1. **Verify** — run `npm run typecheck` and `npm run build`; fix every error you introduced.
2. **Commit** — stage only the files relevant to the task and create a focused commit with a descriptive message. Leave unrelated or pre-existing changes (for example stray files in the repository root) untouched and unstaged.
3. **README** — update `README.md` whenever a user-facing feature, behavior or setup step changes: the feature list, Development notes and Sources must stay accurate.
4. **Keyboard shortcuts** — if you add, remove or rename a hotkey, update every place that documents it: `src/shared/types.ts` (`HotkeyAction` union), `src/shared/hotkeys.ts` (definition, label, hint and default combination) and the shortcut list in `README.md`. Settings and the in-app shortcut sheet are generated from `HOTKEY_DEFINITIONS`, so no manual UI edit is needed there.
5. **Localization** — every new user-facing string must be added to `src/shared/i18n.ts`. Russian text is the dictionary key; add its English translation to the `en` map. This applies to renderer strings (`t(...)`), main-process messages (`msg(...)`), hotkey labels and hints, and progress/toast text. Missing English keys silently fall back to Russian, so grep your diff for strings passed to `t()`/`msg()` and make sure each one has a translation.

## Code conventions

- Shared types and IPC channel names live in `src/shared/`; keep them in sync with `src/preload/index.ts` and `src/main/ipc.ts` when changing an API.
- The renderer can run in a browser with mock data (`npm run dev:web`); keep `src/renderer/lib/api.ts` mocks in sync with `LauncherAPI` changes.
- Never inject raw HTML from Modrinth descriptions. Embeds are allowlisted in `src/renderer/components/Markdown.tsx` and `src/renderer/index.html`.
