import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Same numbers as src/shared/ports.ts — parsed so the dev scripts cannot drift. */
const text = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/shared/ports.ts"
  ),
  "utf8"
);

function num(name) {
  const match = text.match(new RegExp(`export const ${name} = (\\d+)`));
  if (!match) throw new Error(`missing ${name} in src/shared/ports.ts`);
  return Number(match[1]);
}

export const PORT_SPAN = num("PORT_SPAN");
export const BUILD_PORT = num("BUILD_PORT");
export const DEV_API_PORT = num("DEV_API_PORT");
export const DEV_UI_PORT = num("DEV_UI_PORT");
