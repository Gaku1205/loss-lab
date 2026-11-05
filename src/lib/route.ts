export type Route = "menu" | "golf";

/** URL のハッシュ（#/ #/golf）から画面を決める。知らない物はメニュー */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (h === "/golf") return "golf";
  return "menu";
}

export function routeHash(r: Route): string {
  return r === "golf" ? "#/golf" : "#/";
}
