import { el, term } from "../ui";

/** 順位表の入力欄（上に英語＋日本語のラベル）。Esc 以外のキーは、画面のキー操作に渡さない */
export function textField(en: string, ja: string, value: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = el("input", "board-input", [], { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": en });
  input.value = value;
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") e.stopPropagation();
  });
  return { wrap: el("label", "board-field", [term(en, ja, "label"), input]), input };
}

export const OFFLINE_TEXT = "オフライン（この端末の記録のみ）";
