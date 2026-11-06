import { describe, expect, it } from "vitest";
import { canBack, isFirst, isLast, newPager, nextCard, positionLabel, prevCard } from "./howto";

describe("遊び方の板のページ送り", () => {
  it("1枚目から始まる。1枚目では戻れない", () => {
    const p = newPager(4);
    expect(p.index).toBe(0);
    expect(isFirst(p)).toBe(true);
    expect(canBack(p)).toBe(false);
    expect(prevCard(p)).toBe(p);
    expect(positionLabel(p)).toBe("1 / 4");
  });
  it("次へで進み、最後のカードで最後と分かる", () => {
    let p = newPager(4);
    p = nextCard(p);
    expect(p.index).toBe(1);
    expect(canBack(p)).toBe(true);
    expect(isLast(p)).toBe(false);
    p = nextCard(nextCard(p));
    expect(p.index).toBe(3);
    expect(isLast(p)).toBe(true);
    expect(positionLabel(p)).toBe("4 / 4");
  });
  it("最後のカードでは次へ動かない。前へで戻れる", () => {
    const last = { index: 3, count: 4 };
    expect(nextCard(last)).toBe(last);
    expect(prevCard(last).index).toBe(2);
  });
  it("枚数が 0 以下でも 1 枚として扱う", () => {
    const p = newPager(0);
    expect(p.count).toBe(1);
    expect(isFirst(p) && isLast(p)).toBe(true);
  });
});
