import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { serve } from "srvx";
import { serveStatic } from "srvx/static";
import app from "../dist/server/index.js";

const port = Number(process.env.PORT ?? 3000);
const configuredOrigin =
  process.env.SITE_ORIGIN || process.env.RENDER_EXTERNAL_URL;
const site = configuredOrigin
  ? new URL(configuredOrigin)
  : new URL(`http://localhost:${port}`);

if (
  (site.protocol !== "https:" &&
    (site.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname))) ||
  site.username ||
  site.password ||
  site.pathname !== "/" ||
  site.search ||
  site.hash
) {
  throw new Error(
    "SITE_ORIGIN must be an HTTPS origin or a local HTTP origin.",
  );
}

const servePublic = serveStatic({
  dir: fileURLToPath(new URL("../dist/client/", import.meta.url)),
});
const database = {
  DATABASE_URL: process.env.DATABASE_URL,
  REUSE_DATABASE_CONNECTIONS: true,
};

serve({
  hostname: "0.0.0.0",
  port,
  fetch(request) {
    const incoming = new URL(request.url);
    const url = new URL(site.origin);
    url.pathname = incoming.pathname;
    url.search = incoming.search;
    const handleApp = () =>
      app.fetch(new globalThis.Request(url, request), database);

    if (
      url.pathname === "/favicon.ico" ||
      /^\/(assets|img|sample-papers)\//.test(url.pathname)
    ) {
      return servePublic(request, handleApp);
    }

    return handleApp();
  },
});
