/** 画面の部品を作る小さな道具 */

type Attrs = Record<string, string>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  children: (Node | string)[] = [],
  attrs: Attrs = {},
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) e.append(c);
  return e;
}

/** キーの印（Space・Esc など） */
export function keycap(label: string): HTMLElement {
  return el("kbd", "key", [label]);
}

/** 英語（主）＋日本語（小さく）のラベル */
export function term(en: string, ja: string, cls = ""): HTMLElement {
  return el("span", `term ${cls}`.trim(), [el("span", "term-en", [en]), el("span", "term-ja", [ja])]);
}

/** 画面1つぶん。開いている間の後始末を destroy で行う */
export interface Screen {
  root: HTMLElement;
  destroy(): void;
}

export const COLORS = {
  floor: "#090E18",
  board: "#111A2A",
  rule: "#24314A",
  text: "#DCE3F0",
  cyan: "#4FD6E8",
  vermilion: "#FF5A1F",
  amber: "#FFB23F",
  leaf: "#A7E36B",
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
