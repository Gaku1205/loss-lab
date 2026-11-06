/** 報酬の条件ブロック */
export type BlockId = "goal" | "closer" | "away" | "step" | "wall" | "mark" | "order" | "finish" | "wipe" | "fresh" | "revisit";

export interface BlockSpec {
  id: BlockId;
  /** 英語のラベル */
  en: string;
  /** 日本語の条件 */
  ja: string;
  /** 条件が成り立った1歩に足す報酬 */
  value: number;
}

export const BLOCKS: Record<BlockId, BlockSpec> = {
  goal: { id: "goal", en: "GOAL", ja: "ゴールに着いたら", value: 10 },
  closer: { id: "closer", en: "CLOSER", ja: "ゴールに近づいたら", value: 1 },
  away: { id: "away", en: "AWAY", ja: "ゴールから離れたら", value: -1 },
  step: { id: "step", en: "STEP", ja: "1歩ごとに", value: -0.1 },
  wall: { id: "wall", en: "WALL", ja: "壁に当たったら", value: -1 },
  mark: { id: "mark", en: "MARK", ja: "目印を踏んだら", value: 3 },
  order: { id: "order", en: "NEXT MARK", ja: "次の目印に着いたら", value: 3 },
  finish: { id: "finish", en: "FINISH", ja: "目印を全部通ってゴールしたら", value: 10 },
  wipe: { id: "wipe", en: "WIPE", ja: "床を拭いたら", value: 1 },
  fresh: { id: "fresh", en: "NEW TILE", ja: "まだ拭いていないマスに入ったら", value: 1 },
  revisit: { id: "revisit", en: "REVISIT", ja: "拭いたマスに戻ったら", value: -1 },
};

/** 1歩で起きたこと（環境が決める） */
export interface StepEvents {
  /** 壁に当たって動けなかった */
  bump: boolean;
  /** ゴールまでの歩数が減った・増えた */
  closer: boolean;
  away: boolean;
  /** 目印のマスに入った（順番は問わない） */
  onMark: boolean;
  /** 次に通るべき目印に着いた */
  nextMark: boolean;
  /** ゴールのマスに入った */
  goal: boolean;
  /** 目印を全部通ってからゴールのマスに入った */
  finish: boolean;
  /** 別のマスに動いた（床を拭いた） */
  moved: boolean;
  /** このエピソードで初めて入ったマス */
  fresh: boolean;
  /** このエピソードで前に入ったマスに戻った */
  revisit: boolean;
}

export const NO_EVENTS: StepEvents = {
  bump: false,
  closer: false,
  away: false,
  onMark: false,
  nextMark: false,
  goal: false,
  finish: false,
  moved: false,
  fresh: false,
  revisit: false,
};

function fires(id: BlockId, e: StepEvents): boolean {
  switch (id) {
    case "goal":
      return e.goal;
    case "closer":
      return e.closer;
    case "away":
      return e.away;
    case "step":
      return true;
    case "wall":
      return e.bump;
    case "mark":
      return e.onMark;
    case "order":
      return e.nextMark;
    case "finish":
      return e.finish;
    case "wipe":
      return e.moved;
    case "fresh":
      return e.fresh;
    case "revisit":
      return e.revisit;
  }
}

/** 条件ブロックの並びから、1歩の報酬を出す（同じブロックは1回だけ数える） */
export function stepReward(blocks: readonly BlockId[], e: StepEvents): number {
  let r = 0;
  for (const id of new Set(blocks)) if (fires(id, e)) r += BLOCKS[id].value;
  return Math.round(r * 1000) / 1000;
}

/** ブロックの報酬の形（`+10` `−1` `−0.1`） */
export function valueText(v: number): string {
  const s = String(Math.round(Math.abs(v) * 1000) / 1000);
  return v >= 0 ? `+${s}` : `−${s}`;
}
