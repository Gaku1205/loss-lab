export type Route = "menu" | "golf" | "defense";

/** URL のハッシュ（#/ #/golf #/defense）から画面を決める。知らない物はメニュー */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (h === "/golf") return "golf";
  if (h === "/defense") return "defense";
  return "menu";
}

export function routeHash(r: Route): string {
  if (r === "golf") return "#/golf";
  if (r === "defense") return "#/defense";
  return "#/";
}
