export type Role = "coder" | "analyzer" | "mutator" | "verifier";

export interface ChatRequest {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ChatResponse {
  text: string;
  provider: string; // e.g. "meta", "subquadratic", "gemini", "claude-cli (dev adapter)"
  model: string;
  usage: Usage;
  latencyMs: number;
  raw?: unknown;
}

export interface Provider {
  id: string; // stable id used in logs
  label: string; // human label, must be honest about what it is
  model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
