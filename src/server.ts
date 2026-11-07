import "dotenv/config";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { onEvent, RESULTS, ROOT } from "./trace/recorder.js";
import { evolve } from "./evolution/evolve.js";
import { describeProviders } from "./providers/index.js";

const PORT = Number(process.env.PORT || 4317);
let running = false;
const clients = new Set<import("node:http").ServerResponse>();
onEvent((e) => { for (const c of clients) c.write(`data: ${JSON.stringify(e)}\n\n`); });

function latest() {
  const dir = join(RESULTS, "evolutions");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.startsWith("evo-") && f.endsWith(".json")).sort();
  return files.length ? JSON.parse(readFileSync(join(dir, files.at(-1)!), "utf8")) : null;
}
function versions() {
  const dir = join(ROOT, "versions");
  const cur = existsSync(join(dir, "current.json")) ? JSON.parse(readFileSync(join(dir, "current.json"), "utf8")) : null;
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => /^v[\d.]+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))) : [];
  const hist = existsSync(join(dir, "history.jsonl")) ? readFileSync(join(dir, "history.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { current: cur, versions: all, history: hist };
}

createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  if (url.pathname === "/") { res.setHeader("content-type", "text/html"); return res.end(readFileSync(join(ROOT, "ui", "index.html"))); }
  if (url.pathname === "/api/latest") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ record: latest(), versions: versions(), providers: describeProviders(), running })); }
  if (url.pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": ok\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (url.pathname === "/api/evolve" && req.method === "POST") {
    if (running) { res.statusCode = 409; return res.end("already running"); }
    running = true; res.end("started");
    evolve({ reps: Number(process.env.REPS || 1), candidates: Number(process.env.CANDIDATES || 2), iterations: 1 })
      .catch((e) => { for (const c of clients) c.write(`data: ${JSON.stringify({ type: "error", msg: String(e) })}\n\n`); })
      .finally(() => { running = false; });
    return;
  }
  res.statusCode = 404; res.end();
}).listen(PORT, () => console.log(`agentgym ui → http://localhost:${PORT}`));
