import type { Provider } from "./types.js";
import { openAICompatible } from "./http.js";

/**
 * Meta Model API (dev.meta.ai). OpenAI-compatible chat completions at https://api.meta.ai/v1.
 * Contract per https://dev.meta.ai/docs/api-reference/chat-completions/create-chat-completion
 */
export function metaProvider(): Provider | null {
  const key = process.env.META_API_KEY || process.env.MODEL_API_KEY;
  if (!key) return null;
  return openAICompatible({
    id: "meta",
    label: "Meta Model API",
    apiKey: key,
    baseUrl: process.env.META_BASE_URL || "https://api.meta.ai/v1",
    model: process.env.META_MODEL || "muse-spark-1.3",
    jsonMode: true,
  });
}
