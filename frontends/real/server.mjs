// Minimal static server for the Vite build (dist/). Used by Databricks Apps and as the local/offline fallback.
// No dependencies, no credentials: it only serves files, including the exported JSON under dist/data/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.DATABRICKS_APP_PORT || process.env.PORT || 8000);
const HOST = "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function cacheControl(rel) {
  if (rel.startsWith("assets/")) return "public, max-age=31536000, immutable"; // hashed file names
  if (rel.startsWith("data/")) return "public, max-age=3600"; // exported snapshots; change only on redeploy
  return "no-cache"; // index.html
}

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error(`dist/index.html not found. Run "npm run build" first.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  let stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    file = path.join(file, "index.html");
    stat = fs.statSync(file, { throwIfNoEntry: false });
  }
  if (!stat) {
    // Missing data files must stay visible as 404s; only app routes fall back to index.html.
    if (rel.startsWith("data/") || rel.startsWith("assets/") || path.extname(rel)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    file = path.join(ROOT, "index.html");
    stat = fs.statSync(file);
    rel = "index.html";
  }
  const mtime = stat.mtime.toUTCString();
  if (req.headers["if-modified-since"] === mtime) {
    res.writeHead(304, { "Cache-Control": cacheControl(rel), "Last-Modified": mtime }).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": cacheControl(rel),
    "Last-Modified": mtime,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => console.log(`Five Bars 3G on http://${HOST}:${PORT}`));
