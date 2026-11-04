// Dev Mode is ASTER running from source (`pnpm dev`, Vite's DEV build). It is
// not a setting: the packaged app is always public mode. Upstream OpenMausBot
// names that the app still depends on — the `openmausbot` CLI commands, the
// npm package — are shown only in Dev Mode, where they help someone working
// on ASTER; public mode explains the same steps through ASTER's own UI.
export function devMode(): boolean {
  return import.meta.env.DEV === true;
}
