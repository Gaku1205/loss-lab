import { isDefenseFinished } from "../lib/defense/game";
import { isFinished } from "../lib/golf/game";
import type { Route } from "../lib/route";
import { golfBestText, hasNoRecord } from "../lib/save";
import { readSave } from "../store";
import { el, keycap, term, type Screen } from "../ui";
import { bestText as rewardBestText, isRewardMidway } from "./reward";
import { bestText as rogueBestText } from "./rogue";

interface GameRow {
  no: string;
  en: string;
  ja: string;
  topic: string;
  /** 差し色の CSS 変数名 */
  accent: string;
  /** 開く画面（準備中なら null） */
  route: Route | null;
  /** 開くキー（e.key） */
  key: string;
}

const GAMES: readonly GameRow[] = [
  { no: "01", en: "Gradient Golf", ja: "勾配ゴルフ", topic: "学習率と最適化手法", accent: "--cyan", route: "golf", key: "Enter" },
  { no: "02", en: "Boundary Defense", ja: "境界防衛線", topic: "過学習と汎化", accent: "--vermilion", route: "defense", key: "2" },
  { no: "03", en: "Model Rogue", ja: "モデル・ローグ", topic: "モデル設計", accent: "--amber", route: "rogue", key: "3" },
  { no: "04", en: "Reward Lab", ja: "報酬設計室", topic: "報酬設計", accent: "--leaf", route: "reward", key: "4" },
];

export function createMenu(nav: { go(r: Route): void }): Screen {
  const save = readSave();
  const prog = save.golf.progress;
  const dprog = save.defense.progress;
  const midway: Record<string, boolean> = {
    golf: prog !== null && !isFinished(prog) && (prog.hole > 0 || prog.strokes > 0),
    defense: dprog !== null && !isDefenseFinished(dprog) && (dprog.wave > 0 || dprog.neurons.length > 0),
    reward: isRewardMidway(save.reward.progress),
  };
  const bestText: Record<string, string> = {
    golf: golfBestText(save),
    defense: save.defense.best !== null ? `${save.defense.best}%` : "—",
    rogue: rogueBestText(save.rogue),
    reward: rewardBestText(save.reward),
  };

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
    const route = g.route;
    let state: HTMLElement;
    if (route) {
      if (route === "golf" && hasNoRecord(save)) name.append(el("span", "start-here", ["最初はここから"]));
      const accentCls = route === "defense" ? " btn-def" : route === "rogue" ? " btn-rogue" : route === "reward" ? " btn-reward" : "";
      const btn = el("button", `btn btn-primary${accentCls}`, [midway[route] ? term("CONTINUE", "続きから") : term("OPEN", "開く")], { type: "button" });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        nav.go(route);
      });
      state = el("div", "xp-state", [btn, keycap(g.key)]);
    } else {
      state = el("div", "xp-state", [el("span", "soon", ["準備中"])]);
    }
    const row = el(
      "div",
      `xp-row${route ? " is-ready" : " is-soon"}`,
      [el("span", "xp-no num", [g.no]), name, el("span", "xp-topic", [g.topic]), el("span", "xp-best num", [route ? bestText[route] : "—"]), state],
      route ? {} : { "aria-disabled": "true" },
    );
    row.style.setProperty("--accent", `var(${g.accent})`);
    if (route) row.addEventListener("click", () => nav.go(route));
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // ボタンにフォーカスがある時の Enter は、そのボタンを押したことにする
    if (e.key === "Enter" && e.target instanceof HTMLButtonElement) return;
    const g = GAMES.find((x) => x.route && x.key === e.key);
    if (g?.route) {
      e.preventDefault();
      nav.go(g.route);
    }
  };
  window.addEventListener("keydown", onKey);
  return { root, destroy: () => window.removeEventListener("keydown", onKey) };
}
