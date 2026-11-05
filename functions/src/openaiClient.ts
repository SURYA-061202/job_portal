import { HttpsError } from "firebase-functions/v2/https";

/**
 * Minimal OpenAI REST client. The key lives only in the functions environment
 * (functions/.env or a deployed secret) and never reaches the browser.
 */

const BASE = "https://api.openai.com/v1";

export const MODELS = {
  parse: process.env.OPENAI_PARSE_MODEL || "gpt-3.5-turbo-0125",
  score: process.env.OPENAI_SCORE_MODEL || "gpt-3.5-turbo",
  rank: process.env.OPENAI_RANK_MODEL || "gpt-4o",
  label: process.env.OPENAI_LABEL_MODEL || "gpt-4o-mini",
  embed: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
};

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new HttpsError("failed-precondition", "AI features are not configured on the server.");
  }
  return key;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("OpenAI request failed", err);
    throw new HttpsError("unavailable", "The AI service did not respond. Please try again.");
  }

  if (!res.ok) {
    // Log the provider's message server-side only; it can mention keys and quotas.
    console.error("OpenAI error", res.status, await res.text().catch(() => ""));
    throw new HttpsError(res.status === 429 ? "resource-exhausted" : "internal", "The AI service returned an error.");
  }
  return (await res.json()) as T;
}

interface ChatResponse {
  choices: { message?: { content?: string | null } }[];
}

export async function chat(opts: {
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const data = await post<ChatResponse>("/chat/completions", {
    model: opts.model,
    messages,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/** Chat call that must return a JSON object. */
export async function chatJson<T = Record<string, unknown>>(opts: Omit<Parameters<typeof chat>[0], "json">): Promise<T> {
  const content = await chat({ ...opts, json: true });
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new HttpsError("internal", "The AI service returned an unreadable answer.");
  }
}

export async function embed(inputs: string[]): Promise<number[][]> {
  const data = await post<{ data: { embedding: number[] }[] }>("/embeddings", {
    model: MODELS.embed,
    input: inputs,
  });
  return data.data.map((d) => d.embedding);
}
