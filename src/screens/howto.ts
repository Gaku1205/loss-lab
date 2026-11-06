import { canBack, isLast, positionLabel, type Pager } from "../lib/howto";
import { el, keycap, term } from "../ui";

/** 遊び方のカード1枚（見出しは英語と日本語、本文は日本語） */
export interface HowtoCard {
  en: string;
  ja: string;
  body: string;
}

export interface HowtoHandlers {
  onNext(): void;
  onBack(): void;
  onClose(): void;
}

/** 盤の上の板に入れる、遊び方のカード。ボタンの押しかたは呼ぶ側のハンドラが決める */
export function buildHowto(cards: readonly HowtoCard[], pager: Pager, h: HowtoHandlers): HTMLElement[] {
  const card = cards[Math.min(pager.index, cards.length - 1)];
  const last = isLast(pager);

  const ticks = el(
    "div",
    "howto-ticks",
    cards.map((_, i) => el("span", i <= pager.index ? "howto-tick is-on" : "howto-tick")),
    { "aria-hidden": "true" },
  );
  const back = el("button", "btn", [term("BACK", "前へ")], { type: "button" });
  back.disabled = !canBack(pager);
  back.addEventListener("click", h.onBack);
  const next = el("button", "btn btn-primary", [last ? term("START", "始める") : term("NEXT", "次へ")], { type: "button" });
  next.addEventListener("click", last ? h.onClose : h.onNext);
  const skip = el("button", "btn", [term("SKIP", "閉じる")], { type: "button" });
  skip.addEventListener("click", h.onClose);

  const nodes = [
    el("div", "howto-head", [
      term("HOW TO PLAY", "遊び方", "label howto-label"),
      el("span", "num howto-pos", [positionLabel(pager)]),
    ]),
    ticks,
    el("h2", "panel-title howto-title", [term(card.en, card.ja)]),
    el("p", "howto-body", [card.body]),
    el("div", "howto-actions", [
      el("div", "btn-wrap", [back, keycap("←")]),
      el("div", "btn-wrap", [next, keycap(last ? "Enter" : "→")]),
    ]),
    el("div", "howto-skip", [el("div", "btn-wrap", [skip, keycap("Esc")])]),
  ];
  // 開いた直後は、進めるボタンにフォーカスを置く
  queueMicrotask(() => next.focus({ preventScroll: true }));
  return nodes;
}

/** 勾配ゴルフの遊び方（4枚。文言は docs/design.md） */
export const GOLF_HOWTO: readonly HowtoCard[] = [
  { en: "GOAL", ja: "ゴール", body: "玉をカップに入れるのがゴール。打数は少ないほど良い。パーに近づけて、10ホールの合計を減らす。" },
  { en: "LEARNING RATE", ja: "学習率 η", body: "学習率 η は、1打で進む歩幅。大きすぎると谷を行き過ぎて発散し、小さすぎるとほとんど進まない。" },
  {
    en: "GD / MOMENTUM",
    ja: "手法と風",
    body: "GD は勾配の逆向きへ進む。Momentum は速度をためて、細長い谷や窪みを越える。4ホール目から吹く風は、勾配のばらつき（SGD のノイズ）。",
  },
  {
    en: "CONTROLS",
    ja: "操作",
    body: "η と手法を決めて SHOOT。打った後は LAB NOTE を読んで、次の η を決める。盤の外へ出ると OB（打数＋1）。打数が上限に達すると、そのホールは最初から。",
  },
];
