import { isFinished } from "../lib/golf/game";
import type { Route } from "../lib/route";
import { hasNoRecord } from "../lib/save";
import { readSave } from "../store";
import { el, keycap, term, type Screen } from "../ui";

interface GameRow {
  no: string;
  en: string;
  ja: string;
  topic: string;
  /** 差し色の CSS 変数名 */
  accent: string;
  ready: boolean;
}

const GAMES: readonly GameRow[] = [
  { no: "01", en: "Gradient Golf", ja: "勾配ゴルフ", topic: "学習率と最適化手法", accent: "--cyan", ready: true },
  { no: "02", en: "Boundary Defense", ja: "境界防衛線", topic: "過学習と汎化", accent: "--vermilion", ready: false },
  { no: "03", en: "Model Rogue", ja: "モデル・ローグ", topic: "モデル設計", accent: "--amber", ready: false },
  { no: "04", en: "Reward Lab", ja: "報酬設計室", topic: "報酬設計", accent: "--leaf", ready: false },
];

export function createMenu(nav: { go(r: Route): void }): Screen {
  const save = readSave();
  const best = save.golf.best;
  const prog = save.golf.progress;
  const midway = prog !== null && !isFinished(prog) && (prog.hole > 0 || prog.strokes > 0);
  const open = () => nav.go("golf");

  const head = el("header", "menu-head", [
    el("h1", "site-title", ["Loss Lab"]),
    el("p", "menu-lead", ["損失を下げる4つの実験。勾配降下・過学習・モデル設計・報酬設計を、遊びながら確かめる。"]),
  ]);

  const headRow = el("div", "xp-row xp-headrow", [
    el("span", "xp-no label", ["No."]),
    term("EXPERIMENT", "実験", "xp-name label"),
    term("TOPIC", "テーマ", "xp-topic label"),
    term("BEST", "最高記録", "xp-best label"),
    el("span", "xp-state"),
  ]);

  const rows = GAMES.map((g) => {
    const name = el("div", "xp-name", [el("span", "xp-en", [g.en]), el("span", "xp-ja", [g.ja])]);
    const bestText = g.ready && best !== null ? `${best} 打` : "—";
    let state: HTMLElement;
    if (g.ready) {
      if (hasNoRecord(save)) name.append(el("span", "start-here", ["最初はここから"]));
      const btn = el("button", "btn btn-primary", [midway ? term("CONTINUE", "続きから") : term("OPEN", "開く")], { type: "button" });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        open();
      });
      state = el("div", "xp-state", [btn, keycap("Enter")]);
    } else {
      state = el("div", "xp-state", [el("span", "soon", ["準備中"])]);
    }
    const row = el(
      "div",
      `xp-row${g.ready ? " is-ready" : " is-soon"}`,
      [el("span", "xp-no num", [g.no]), name, el("span", "xp-topic", [g.topic]), el("span", "xp-best num", [bestText]), state],
      g.ready ? {} : { "aria-disabled": "true" },
    );
    row.style.setProperty("--accent", `var(${g.accent})`);
    if (g.ready) row.addEventListener("click", open);
    return row;
  });

  const table = el("section", "xp-table", [headRow, ...rows], { "aria-label": "実験" });

  const boards = GAMES.map((g) => {
    const lines = ["1", "2", "3"].map((n) => el("li", "rank-line", [el("span", "num rank-no", [n]), el("span", "num", ["—"])]));
    const box = el("div", "rank-box", [el("div", "rank-game", [g.en]), el("ol", "rank-list", lines), el("p", "rank-empty", ["まだ記録なし"])]);
    box.style.setProperty("--accent", `var(${g.accent})`);
    return box;
  });
  const ranks = el("section", "ranks", [el("h2", "section-title", [term("TOP 3", "上位3人")]), el("div", "rank-grid", boards)]);

  const foot = el("p", "menu-foot", ["記録はこのブラウザに保存します。ログインはありません。"]);
  const root = el("main", "screen menu", [el("div", "menu-inner", [head, table, ranks, foot])]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      open();
    }
  };
  window.addEventListener("keydown", onKey);
  return { root, destroy: () => window.removeEventListener("keydown", onKey) };
}
