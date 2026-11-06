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

/** モデル・ローグの遊び方（4枚。文言は docs/design.md） */
export const ROGUE_HOWTO: readonly HowtoCard[] = [
  { en: "GOAL", ja: "ゴール", body: "カードを足してモデルを育て、検証精度をボスの目標まで上げる。4階のボスを倒すと全階突破。" },
  {
    en: "CARDS",
    ja: "カード",
    body: "手札から1枚出すと、モデルの最後に足して学習する。LAYER は表現力を足し、REG は過学習を抑え、FIX は勾配の流れを整える。",
  },
  {
    en: "DEFEAT",
    ja: "負け",
    body: "層を重ねすぎて勾配が消える、表現力が余って過学習する、出せる5枚を使い切る。どれかで負けて、1階からやり直し。",
  },
  {
    en: "CONTROLS",
    ja: "操作",
    body: "数字キー 1〜4 か、カードを押して出す。学習精度と検証精度の差、勾配の流れ GRAD を見ながら選ぶ。",
  },
];

/** 報酬設計室の遊び方（4枚。文言は docs/design.md） */
export const REWARD_HOWTO: readonly HowtoCard[] = [
  { en: "GOAL", ja: "ゴール", body: "条件ブロックを並べて報酬を書き、ロボットに課題をやらせる。3問をクリアするのがゴール。" },
  {
    en: "REWARD",
    ja: "報酬",
    body: "1歩ごとに、成り立った条件の値を足した物が報酬。LEARN を押すと、ロボットが報酬を頼りに試行をくり返して動きを覚える。",
  },
  {
    en: "CHEAT",
    ja: "ズル",
    body: "書き方に穴があると、ロボットは課題をせずに報酬だけ稼ぐ。往復やぐるぐる、近道が朱の線で出たら、条件を直す。",
  },
  {
    en: "CONTROLS",
    ja: "操作",
    body: "棚の条件を押して並べる（4つまで）。LEARN で学習は5回まで。少ない条件・少ない試行でクリアするほど高得点。",
  },
];

/** 境界防衛線の遊び方（4枚。文言は docs/design.md） */
export const DEFENSE_HOWTO: readonly HowtoCard[] = [
  { en: "GOAL", ja: "ゴール", body: "流れてくる ○ と ● を、陣地で正しく仕分けて守る。誤りやすり抜けでライフが減り、0 になるとその波は失敗。" },
  {
    en: "NEURONS",
    ja: "ニューロン",
    body: "盤を押してニューロンを置く。置いた物を押すと外せる。広い物はなだらかに、狭い物は強く効く。○ と ● の陣地の境目が境界線。",
  },
  { en: "OVERFIT", ja: "過学習", body: "練習データのノイズまで拾うと、練習の正解率は上がるが、初見のテストで崩れる。これが過学習。" },
  { en: "CONTROLS", ja: "操作", body: "波の間にニューロンを置き、START WAVE で流す。最終波の点はテストデータで、流れるまで見えない。" },
];
