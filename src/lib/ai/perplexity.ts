import "server-only";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Source {
  title: string;
  url: string;
}

export type AgentEvent = { type: "text"; text: string } | { type: "sources"; sources: Source[] };

const ENDPOINT = "https://api.perplexity.ai/v1/agent";

export function assistantConfig() {
  return {
    enabled: !!process.env.PERPLEXITY_API_KEY,
    model: process.env.PERPLEXITY_MODEL || "perplexity/sonar",
  };
}

/**
 * Appelle l'Agent API de Perplexity en streaming (SSE) et renvoie le texte au fil de l'eau,
 * puis les sources de la recherche web.
 */
export async function* streamAgent(opts: { instructions: string; input: ChatMessage[]; signal?: AbortSignal }): AsyncGenerator<AgentEvent> {
  const { model } = assistantConfig();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal: opts.signal,
    headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      model,
      instructions: opts.instructions,
      input: opts.input.map((m) => ({ type: "message", role: m.role, content: m.content })),
      tools: [{ type: "web_search" }],
      max_output_tokens: 4000,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new PerplexityError(res.status, detail);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let sentSources = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let sep: number;
    while ((sep = buf.search(/\r?\n\r?\n/)) >= 0) {
      const rawEvent = buf.slice(0, sep);
      buf = buf.slice(sep).replace(/^\r?\n\r?\n/, "");
      const data = rawEvent
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      for (const out of parseEvent(ev)) {
        if (out.type === "sources") {
          if (sentSources || !out.sources.length) continue;
          sentSources = true;
        }
        yield out;
      }
    }
  }
}

/**
 * Appel non diffusé à l'API chat completions de Perplexity avec une réponse au format JSON imposé
 * (response_format json_schema). Renvoie le texte brut (à valider) et les sources.
 */
export async function completeJson(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<{ content: string; sources: Source[] }> {
  // l'API chat completions attend le nom du modèle sans préfixe de fournisseur (« sonar », « sonar-pro »)
  const model = assistantConfig().model.replace(/^perplexity\//, "");
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    signal: opts.signal,
    headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema: opts.schema } },
      max_tokens: 2000,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new PerplexityError(res.status, body);
  let j: { choices?: { message?: { content?: string } }[]; search_results?: { url?: string; title?: string }[]; citations?: unknown[] };
  try {
    j = JSON.parse(body);
  } catch {
    throw new PerplexityError(502, "réponse illisible");
  }
  const sources = Array.isArray(j.search_results)
    ? toSources(j.search_results)
    : (j.citations ?? []).filter((u): u is string => typeof u === "string").map((url) => ({ url, title: url }));
  return { content: j.choices?.[0]?.message?.content ?? "", sources };
}

const CHAT_ENDPOINT = "https://api.perplexity.ai/chat/completions";

/** Interprète un évènement SSE (Agent API, avec repli sur l'ancien format Sonar). Exporté pour les tests. */
export function parseEvent(ev: Record<string, unknown>): AgentEvent[] {
  const out: AgentEvent[] = [];
  const type = ev.type as string | undefined;
  if (type === "response.output_text.delta" && typeof ev.delta === "string") out.push({ type: "text", text: ev.delta });
  if (type === "error" || type === "response.failed") {
    const err = (ev.error ?? (ev.response as Record<string, unknown> | undefined)?.error) as { message?: string } | undefined;
    throw new PerplexityError(502, err?.message ?? "réponse en échec");
  }

  // Sources : élément « search_results » (ajouté/terminé), ou réponse complète en fin de flux.
  const items: unknown[] = [];
  if (ev.item) items.push(ev.item);
  const response = ev.response as { output?: unknown[] } | undefined;
  if (type === "response.completed" && Array.isArray(response?.output)) items.push(...response.output);
  for (const it of items) {
    const item = it as { type?: string; results?: { url?: string; title?: string }[] };
    if (item?.type === "search_results" && Array.isArray(item.results)) out.push({ type: "sources", sources: toSources(item.results) });
  }

  // Ancien format Sonar (chat completions).
  const choices = ev.choices as { delta?: { content?: string } }[] | undefined;
  const legacy = choices?.[0]?.delta?.content;
  if (typeof legacy === "string" && legacy) out.push({ type: "text", text: legacy });
  if (Array.isArray(ev.search_results)) out.push({ type: "sources", sources: toSources(ev.search_results as { url?: string; title?: string }[]) });
  else if (Array.isArray(ev.citations)) out.push({ type: "sources", sources: (ev.citations as unknown[]).filter((u): u is string => typeof u === "string").map((url) => ({ url, title: url })) });
  return out;
}

function toSources(results: { url?: string; title?: string }[]): Source[] {
  return results.filter((r) => typeof r?.url === "string").map((r) => ({ url: r.url!, title: r.title || r.url! }));
}

export class PerplexityError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(PerplexityError.describe(status, detail));
  }
  static describe(status: number, detail: string): string {
    if (status === 401 || status === 403) return "Clé API Perplexity refusée : vérifie PERPLEXITY_API_KEY.";
    if (status === 429) return "Limite de requêtes Perplexity atteinte, réessaie dans un instant.";
    if (status === 402) return "Crédit Perplexity insuffisant.";
    let msg = detail;
    try {
      const j = JSON.parse(detail);
      msg = j?.error?.message ?? j?.message ?? detail;
    } catch {}
    return `Erreur Perplexity (${status})${msg ? ` : ${String(msg).slice(0, 300)}` : ""}`;
  }
}
