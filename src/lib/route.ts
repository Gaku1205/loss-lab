export type Route = "menu" | "golf" | "explain" | "defense" | "rogue" | "reward";

/** URL のハッシュ（#/ #/golf #/golf/explain #/defense #/rogue #/reward）から画面を決める。知らない物はメニュー */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (h === "/golf") return "golf";
  if (h === "/golf/explain") return "explain";
  if (h === "/defense") return "defense";
  if (h === "/rogue") return "rogue";
  if (h === "/reward") return "reward";
  return "menu";
}

export function routeHash(r: Route): string {
  if (r === "golf") return "#/golf";
  if (r === "explain") return "#/golf/explain";
  if (r === "defense") return "#/defense";
  if (r === "rogue") return "#/rogue";
  if (r === "reward") return "#/reward";
  return "#/";
}
