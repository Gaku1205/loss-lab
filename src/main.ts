import "./style.css";
import { parseRoute, routeHash, type Route } from "./lib/route";
import { createDefense } from "./screens/defense";
import { createExplain } from "./screens/explain";
import { createGolf } from "./screens/golf";
import { createMenu } from "./screens/menu";
import { createReward } from "./screens/reward";
import { createRogue } from "./screens/rogue";
import type { Screen } from "./ui";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app がありません");
const root: HTMLElement = app;

let current: Screen | null = null;

function go(r: Route): void {
  const hash = routeHash(r);
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render(): void {
  current?.destroy();
  root.replaceChildren();
  const route = parseRoute(location.hash);
  current =
    route === "golf"
      ? createGolf({ go })
      : route === "explain"
        ? createExplain({ go })
        : route === "defense"
        ? createDefense({ go })
        : route === "rogue"
          ? createRogue({ go })
          : route === "reward"
            ? createReward({ go })
            : createMenu({ go });
  root.append(current.root);
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
render();
