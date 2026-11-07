import { spawn } from "node:child_process";
import type { ChatRequest, ChatResponse, Provider } from "./types.js";

/**
 * DEV ADAPTER ONLY. Uses the locally installed `claude` CLI so the harness can be developed
 * before sponsor credentials exist. Always labeled as such in logs and UI. Never used to
 * impersonate a sponsor provider.
 */
export function claudeCli(model = process.env.DEV_CLAUDE_MODEL || "haiku"): Provider {
  return {
    id: "claude-cli",
    label: `claude-cli dev adapter (${model}) — NOT a sponsor provider`,
    model,
    chat(req: ChatRequest): Promise<ChatResponse> {
      const t0 = Date.now();
      return new Promise((resolve, reject) => {
        const child = spawn(
          "claude",
          ["-p", "--output-format", "json", "--model", model, "--tools", "", "--system-prompt", req.system],
          { cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] },
        );
        let out = "";
        let err = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), 240_000);
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("close", (code) => {
          clearTimeout(timer);
          try {
            const j = JSON.parse(out);
            if (j.is_error) return reject(new Error(`claude-cli error: ${j.result}`));
            const mu = j.modelUsage ? Object.keys(j.modelUsage)[0] : model;
            resolve({
              text: j.result ?? "",
              provider: "claude-cli",
              model: mu,
              usage: {
                inputTokens: (j.usage?.input_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0),
                outputTokens: j.usage?.output_tokens,
              },
              latencyMs: Date.now() - t0,
            });
          } catch {
            reject(new Error(`claude-cli exited ${code}: ${(err || out).slice(0, 400)}`));
          }
        });
        child.stdin.end(req.user + (req.json ? "\n\nRespond with a single JSON object only, no markdown fences." : ""));
      });
    },
  };
}
