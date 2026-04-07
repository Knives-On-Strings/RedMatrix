/**
 * Theme system for RedMatrix.
 *
 * Themes define CSS custom properties that Tailwind references.
 * Components use semantic class names (bg-surface, text-primary, etc.)
 * instead of hardcoded colors (bg-neutral-900, text-neutral-100).
 *
 * To add a new theme: define the color values below and add to THEMES.
 */

export interface Theme {
  id: string;
  name: string;
  colors: {
    // Backgrounds
    "bg-app": string;
    "bg-surface": string;
    "bg-surface-raised": string;
    "bg-control": string;
    "bg-control-hover": string;
    "bg-control-active": string;

    // Text
    "text-primary": string;
    "text-secondary": string;
    "text-muted": string;
    "text-disabled": string;

    // Borders
    "border-default": string;
    "border-subtle": string;

    // Accent (active tab, highlights)
    "accent": string;
    "accent-text": string;

    // Status colors
    "meter-green": string;
    "meter-amber": string;
    "meter-red": string;
    "led-green": string;
    "led-red": string;
    "led-amber": string;
    "led-off": string;

    // Buttons
    "btn-solo-active": string;
    "btn-solo-text": string;
    "btn-mute-active": string;
    "btn-mute-text": string;
    "btn-linked": string;
    "btn-linked-text": string;

    // Port type colors (patchbay/matrix)
    "port-analogue": string;
    "port-spdif": string;
    "port-adat": string;
    "port-mix": string;
    "port-pcm": string;
    "port-off": string;
  };
}

export const THEMES: Record<string, Theme> = {
  dark: {
    id: "dark",
    name: "Dark",
    colors: {
      "bg-app": "#171717",          // neutral-900
      "bg-surface": "#262626",      // neutral-800
      "bg-surface-raised": "#2d2d2d",
      "bg-control": "#404040",      // neutral-700
      "bg-control-hover": "#525252", // neutral-600
      "bg-control-active": "#737373",

      "text-primary": "#f5f5f5",    // neutral-100
      "text-secondary": "#a3a3a3",  // neutral-400
      "text-muted": "#737373",      // neutral-500
      "text-disabled": "#525252",   // neutral-600

      "border-default": "#404040",  // neutral-700
      "border-subtle": "#333333",

      "accent": "#f87171",          // red-400
      "accent-text": "#f87171",

      "meter-green": "#22c55e",
      "meter-amber": "#fbbf24",
      "meter-red": "#ef4444",
      "led-green": "#22c55e",
      "led-red": "#ef4444",
      "led-amber": "#fbbf24",
      "led-off": "#404040",

      "btn-solo-active": "#f59e0b",
      "btn-solo-text": "#000000",
      "btn-mute-active": "#dc2626",
      "btn-mute-text": "#ffffff",
      "btn-linked": "#14532d",
      "btn-linked-text": "#86efac",

      "port-analogue": "#2563eb",
      "port-spdif": "#9333ea",
      "port-adat": "#0d9488",
      "port-mix": "#d97706",
      "port-pcm": "#16a34a",
      "port-off": "#262626",
    },
  },

  light: {
    id: "light",
    name: "Light",
    colors: {
      "bg-app": "#f5f5f5",
      "bg-surface": "#ffffff",
      "bg-surface-raised": "#fafafa",
      "bg-control": "#e5e5e5",
      "bg-control-hover": "#d4d4d4",
      "bg-control-active": "#a3a3a3",

      "text-primary": "#171717",
      "text-secondary": "#525252",
      "text-muted": "#737373",
      "text-disabled": "#a3a3a3",

      "border-default": "#d4d4d4",
      "border-subtle": "#e5e5e5",

      "accent": "#dc2626",
      "accent-text": "#dc2626",

      "meter-green": "#16a34a",
      "meter-amber": "#d97706",
      "meter-red": "#dc2626",
      "led-green": "#16a34a",
      "led-red": "#dc2626",
      "led-amber": "#d97706",
      "led-off": "#d4d4d4",

      "btn-solo-active": "#f59e0b",
      "btn-solo-text": "#000000",
      "btn-mute-active": "#dc2626",
      "btn-mute-text": "#ffffff",
      "btn-linked": "#dcfce7",
      "btn-linked-text": "#166534",

      "port-analogue": "#3b82f6",
      "port-spdif": "#a855f7",
      "port-adat": "#14b8a6",
      "port-mix": "#f59e0b",
      "port-pcm": "#22c55e",
      "port-off": "#e5e5e5",
    },
  },

  highvis: {
    id: "highvis",
    name: "High Visibility",
    colors: {
      "bg-app": "#000000",
      "bg-surface": "#1a1a1a",
      "bg-surface-raised": "#222222",
      "bg-control": "#333333",
      "bg-control-hover": "#444444",
      "bg-control-active": "#666666",

      "text-primary": "#ffffff",
      "text-secondary": "#cccccc",
      "text-muted": "#999999",
      "text-disabled": "#555555",

      "border-default": "#555555",
      "border-subtle": "#333333",

      "accent": "#ff4444",
      "accent-text": "#ff4444",

      "meter-green": "#00ff00",
      "meter-amber": "#ffff00",
      "meter-red": "#ff0000",
      "led-green": "#00ff00",
      "led-red": "#ff0000",
      "led-amber": "#ffff00",
      "led-off": "#333333",

      "btn-solo-active": "#ffff00",
      "btn-solo-text": "#000000",
      "btn-mute-active": "#ff0000",
      "btn-mute-text": "#ffffff",
      "btn-linked": "#003300",
      "btn-linked-text": "#00ff00",

      "port-analogue": "#4488ff",
      "port-spdif": "#cc44ff",
      "port-adat": "#00cccc",
      "port-mix": "#ffaa00",
      "port-pcm": "#00cc00",
      "port-off": "#1a1a1a",
    },
  },
};

/**
 * Apply a theme by setting CSS custom properties on the document root.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.setAttribute("data-theme", theme.id);
}

/**
 * Get the default theme.
 */
export function getDefaultTheme(): Theme {
  return THEMES.dark!;
}
