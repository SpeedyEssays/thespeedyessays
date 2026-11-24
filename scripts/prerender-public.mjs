import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import app from "../dist/server/index.js";
import { policies } from "../src/lib/policies.ts";

const publicRoutes = [
  "/",
  "/samples",
  ...policies.map(({ slug }) => `/policies/${slug}`),
];
const clientDirectory = new URL("../dist/client/", import.meta.url);

for (const path of publicRoutes) {
  const response = await app.fetch(
    new globalThis.Request(new URL(path, "https://speedyessays.invalid")),
    {},
  );
  const cacheControl = response.headers.get("cache-control") ?? "";

  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.includes("text/html") ||
    response.headers.has("set-cookie") ||
    /private|no-store/i.test(cacheControl)
  ) {
    throw new Error(
      `Cannot publish ${path} as a public asset (HTTP ${response.status}).`,
    );
  }

  const asset = new URL(
    path === "/" ? "index.html" : `${path.slice(1)}.html`,
    clientDirectory,
  );
  await mkdir(new URL(".", asset), { recursive: true });
  await writeFile(asset, await response.text());
  console.log(`Prerendered public page ${path}`);
}
