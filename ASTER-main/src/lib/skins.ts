// Skins are pure CSS. Every one of them is a block of custom properties in
// styles.css, selected by a `data-skin` attribute; this module only decides
// which one is active and remembers the choice. Nothing here knows a colour —
// that keeps the two halves from drifting apart, and it means adding a skin is
// one CSS block plus one line in SKINS.

export const SKIN_IDS = [
  "midnight",
  "atelier",
  "foundry",
  "lagoon",
  "graphite",
  "linen",
  "dusk",
  "daylight",
] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export type Skin = {
  id: SkinId;
  name: string;
  /** One line, shown under the name in the picker. */
  tagline: string;
};

export const SKINS: readonly Skin[] = [
  { id: "midnight", name: "Midnight", tagline: "The original. Cool and dark." },
  { id: "atelier", name: "Atelier", tagline: "Daylight on paper, warm and quiet." },
  { id: "foundry", name: "Foundry", tagline: "Night shift. Dark, warm, lit in brass." },
  { id: "lagoon", name: "Lagoon", tagline: "Cool daylight. Porcelain and deep teal." },
  { id: "graphite", name: "Graphite", tagline: "Quiet charcoal and softened steel blue." },
  { id: "linen", name: "Linen", tagline: "Clean daylight with a restrained navy accent." },
  { id: "dusk", name: "Dusk", tagline: "Muted plum after dark, calm and low-key." },
  { id: "daylight", name: "Daylight", tagline: "Midnight in reverse. Near-white, ink-black bubbles." },
];

export const DEFAULT_SKIN: SkinId = "midnight";

const KEY = "omb-skin";

// The input is whatever localStorage handed back — a string this app wrote
// on an earlier run, a value edited by hand, or a leftover from a renamed
// skin. The list is the schema.
function isSkinId(value: unknown): value is SkinId {
  // SAFETY: the assertion only satisfies includes()' parameter type; the
  // check itself is what decides, and a non-member returns false.
  return SKIN_IDS.includes(value as SkinId);
}

// Reaching for localStorage is itself a failure point: on an origin with
// storage blocked the getter throws, and `typeof` alone doesn't shield it.
function getStore(): Storage | undefined {
  try {
    // A bare feature test, not a narrowing of parsed input: in a renderer
    // without storage the identifier is simply not defined.
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export const APPEARANCE_MODES = ["system", "dark", "light"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export function resolveSystemSkin(): SkinId {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "daylight" : "midnight";
  }
  return DEFAULT_SKIN;
}

export function readAppearancePreference(): AppearanceMode | SkinId {
  try {
    const stored = getStore()?.getItem(KEY);
    if (!stored || stored === "system") return "system";
    if (stored === "dark") return "midnight";
    if (stored === "light") return "daylight";
    return isSkinId(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function readSkin(): SkinId {
  try {
    const pref = readAppearancePreference();
    if (pref === "system") return resolveSystemSkin();
    if (isSkinId(pref)) return pref;
    return DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

/**
 * Point the document at a skin and remember it. Called once before the first
 * paint (main.tsx) and again on every change from the picker — a stamped
 * attribute rather than a class so it can never collide with Tailwind.
 */
export function applySkin(id: SkinId | "system" | "dark" | "light"): void {
  const targetId: SkinId =
    id === "system"
      ? resolveSystemSkin()
      : id === "dark"
        ? "midnight"
        : id === "light"
          ? "daylight"
          : id;

  document.documentElement.dataset.skin = targetId;
  document.documentElement.classList.toggle("dark", targetId !== "daylight" && targetId !== "atelier" && targetId !== "lagoon" && targetId !== "linen");
  try {
    getStore()?.setItem(KEY, id);
  } catch {
    /* quota / private mode — the skin still applies for this session */
  }
  // The one surface CSS cannot reach: on Windows the caption buttons sit in a
  // native overlay the main process paints. Left at the default it stays
  // Midnight-black on a light skin — the "black block in the top-right
  // corner" of issue #454. Best-effort: a browser tab or an older desktop
  // build has no bridge, and the skin still applies without it.
  try {
    void window.ogb?.applySkin?.(targetId)?.catch(() => undefined);
  } catch {
    /* no bridge */
  }
}

// Watch system appearance changes and update immediately if following system
if (typeof window !== "undefined" && window.matchMedia) {
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const pref = readAppearancePreference();
      if (pref === "system") {
        const resolved = resolveSystemSkin();
        document.documentElement.dataset.skin = resolved;
        document.documentElement.classList.toggle("dark", resolved !== "daylight" && resolved !== "atelier" && resolved !== "lagoon" && resolved !== "linen");
        try {
          void window.ogb?.applySkin?.(resolved)?.catch(() => undefined);
        } catch {
          /* no bridge */
        }
      }
    });
  } catch {
    /* environment without matchMedia listener support */
  }
}
