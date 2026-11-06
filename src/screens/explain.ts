import type { Route } from "../lib/route";
import { el, keycap, term, type Screen } from "../ui";

type Sym = [symbol: string, text: string];

function formula(lines: string[]): HTMLElement {
  return el(
    "div",
    "formula num",
    lines.map((l) => el("div", "formula-line", [l])),
  );
}

function symbols(rows: Sym[]): HTMLElement {
  return el(
    "dl",
    "sym-table",
    rows.map(([s, t]) => el("div", "sym-row", [el("dt", "num", [s]), el("dd", "", [t])])),
  );
}

function section(no: number, en: string, ja: string, children: HTMLElement[]): HTMLElement {
  return el("section", "ex-section", [
    el("h2", "ex-head", [el("span", "ex-no num", [String(no)]), term(en, ja, "label")]),
    ...children,
  ]);
}

function para(text: string): HTMLElement {
  return el("p", "ex-text", [text]);
}

function card(en: string, ja: string, warn: boolean, text: string): HTMLElement {
  return el("div", "ex-card", [el("h3", warn ? "ex-card-head is-warn" : "ex-card-head", [term(en, ja, "label")]), para(text)]);
}

export function createExplain(nav: { go(r: Route): void }): Screen {
  const back = () => nav.go("golf");

  const backTop = el("button", "btn", [term("BACK", "戻る")], { type: "button" });
  backTop.addEventListener("click", back);
  const backBottom = el("button", "btn btn-primary", [term("BACK", "戻る")], { type: "button" });
  backBottom.addEventListener("click", back);

  const top = el("header", "golf-top", [
    el("div", "golf-title", [el("div", "btn-wrap", [backTop, keycap("Esc")]), el("h1", "game-title", [term("HOW IT WORKS", "仕組み")])]),
  ]);

  const body = el("div", "ex-body", [
    section(1, "GRADIENT DESCENT", "勾配降下", [
      formula(["θ ← θ − η∇L(θ)"]),
      para("損失 L は、パラメータ θ（ゴルフでは玉の位置 (x, y)）の高さ。勾配 ∇L は、いちばん急に上る向き。その逆へ、学習率 η のぶんだけ進むと、損失が下がる。"),
      symbols([
        ["θ", "パラメータ（玉の位置）"],
        ["η", "学習率（1回に進む大きさ）"],
        ["∇L", "勾配（損失が増える向き）"],
      ]),
    ]),
    section(2, "LEARNING RATE", "学習率", [
      el("div", "ex-cards", [
        card("TOO LARGE", "大きすぎる", true, "一歩が谷を飛び越えて、反対側の壁でさらに高くなる。行き来するたびに振れ幅が増えて発散する。ゴルフでは盤の外へ出て OB。"),
        card("TOO SMALL", "小さすぎる", false, "一歩が小さく、ほとんど進まない。打数の上限までにカップに届かない。"),
      ]),
      formula(["x ← (1 − η)x", "y ← (1 − 4η)y"]),
      para("ホール1（L = 0.5·(x² + 4y²)）で GD を打つと、1ステップはこうなる。|1 − 4η| が 1 を超える η > 0.5 で、y は毎回大きくなって発散する。"),
    ]),
    section(3, "MOMENTUM", "モーメンタム", [
      formula(["v ← βv − η∇L(θ)", "θ ← θ + v"]),
      para("v は速度。前の速度を β = 0.9 だけ残して、新しい勾配を足す。同じ向きの勾配が続くと速度がたまり、細長い谷や浅い窪みも勢いで越える。そのぶん止まりにくく行き過ぎやすいので、η は GD より小さめにする。"),
      symbols([
        ["v", "速度（打つたびに 0 から）"],
        ["β", "前の速度を残す割合"],
      ]),
    ]),
    section(4, "SGD NOISE", "SGD のノイズ", [
      formula(["g̃ = ∇L + ノイズ"]),
      para("SGD は、データの一部（ミニバッチ）だけで勾配を求める。選んだ一部によって勾配がばらつくので、本当の勾配 ∇L にノイズが乗る。更新式の ∇L を、ばらついた g̃ に置き換えるだけ。"),
      formula(["g̃ = ∇L − s·|∇L|·(u + ξ)"]),
      para("ゴルフの風が、このノイズ。ばらつきは勾配の大きさに比例させているので、谷底（∇L = 0）では風も止む。"),
      symbols([
        ["s", "風の強さ"],
        ["u", "風の向き"],
        ["ξ", "毎ステップ引き直す乱数"],
      ]),
    ]),
    el("div", "ex-foot", [el("div", "btn-wrap", [backBottom, keycap("Esc")])]),
  ]);

  const root = el("main", "screen explain", [top, body]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      back();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  return {
    root,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
