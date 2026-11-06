/** 遊び方の板のページ送り（今のカード番号・次へ／前へ・最後のカードか） */

export interface Pager {
  /** 今のカード（0 始まり） */
  index: number;
  /** カードの枚数（1 以上） */
  count: number;
}

export function newPager(count: number): Pager {
  return { index: 0, count: Math.max(1, Math.floor(count)) };
}

export function isFirst(p: Pager): boolean {
  return p.index <= 0;
}

export function isLast(p: Pager): boolean {
  return p.index >= p.count - 1;
}

/** 前へ戻れるか（1枚目では戻れない） */
export function canBack(p: Pager): boolean {
  return !isFirst(p);
}

/** 次のカード。最後のカードでは動かない（閉じるのは呼ぶ側） */
export function nextCard(p: Pager): Pager {
  return isLast(p) ? p : { ...p, index: p.index + 1 };
}

/** 前のカード。1枚目では動かない */
export function prevCard(p: Pager): Pager {
  return isFirst(p) ? p : { ...p, index: p.index - 1 };
}

/** `1 / 4` の形の位置 */
export function positionLabel(p: Pager): string {
  return `${p.index + 1} / ${p.count}`;
}
