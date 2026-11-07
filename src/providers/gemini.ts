import type { ChatRequest, ChatResponse, Provider } from "./types.js";
import { postJson } from "./http.js";

/** Google Gemini generateContent. https://aistudio.google.com/api-reference/generate-content/generate-content */
export function geminiProvider(): Provider | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  return {
    id: "gemini",
    label: "Google Gemini",
    model,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const t0 = Date.now();
      const raw = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {},
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: { temperature: req.temperature ?? 0.2, ...(req.json ? { responseMimeType: "application/json" } : {}) },
        },
      );
      const text = (raw?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      const u = raw?.usageMetadata ?? {};
      return {
        text, provider: "gemini", model: raw?.modelVersion ?? model,
        usage: { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, totalTokens: u.totalTokenCount },
        latencyMs: Date.now() - t0,
      };
    },
  };
}
