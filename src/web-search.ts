import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ApprovalKind } from "./protocol";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_COUNT = 5;
const MAX_RESULT_COUNT = 20;
const SEARCH_TIMEOUT_MS = 10_000;
const CONTENT_TIMEOUT_MS = 15_000;
const MAX_API_RESPONSE_BYTES = 512 * 1024;
const MAX_PAGE_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_CHARS = 5_000;
const USER_AGENT = "SmithAgent/0.1";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface WebSearchOptions {
  apiKey?: string;
  fetch?: FetchLike;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  age?: string;
  content?: string;
}

export interface WebSearchResponse {
  provider: "brave";
  query: string;
  results: WebSearchResult[];
}

export interface WebContentResponse {
  url: string;
  title?: string;
  content: string;
}

const webSearchParameters = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 1_000, description: "Web search query." }),
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RESULT_COUNT, description: "Number of results, default 5, maximum 20." })),
  country: Type.Optional(Type.String({ description: "Two-letter country code, default US." })),
  freshness: Type.Optional(Type.String({ description: "Freshness filter: pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD." })),
  includeContent: Type.Optional(Type.Boolean({ description: "Fetch and include readable page text for each result." })),
});
type WebSearchParameters = Static<typeof webSearchParameters>;

const webContentParameters = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 4_000, description: "HTTP or HTTPS page URL to read." }),
});
type WebContentParameters = Static<typeof webContentParameters>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toolResult<T extends object>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function requireApiKey(options: WebSearchOptions): string {
  const apiKey = options.apiKey?.trim() || process.env.BRAVE_API_KEY?.trim();
  if (!apiKey) throw new Error("BRAVE_API_KEY is required for web search. Set it in the environment; never put it in the workspace config.");
  return apiKey;
}

function validateCountry(country: string): string {
  const normalized = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) throw new Error("country must be a two-letter country code.");
  return normalized;
}

function validateFreshness(freshness: string | undefined): string | undefined {
  if (!freshness) return undefined;
  if (!/^(?:pd|pw|pm|py|\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2})$/u.test(freshness)) {
    throw new Error("freshness must be pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD.");
  }
  return freshness;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1") return true;
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return host.includes(":");
  }
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function validateWebUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("url must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("url must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed.");
  if (isBlockedHostname(url.hostname)) throw new Error("Local and private network URLs are not allowed.");
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxBytes - bytes;
      const chunk = next.value.subarray(0, remaining);
      chunks.push(chunk);
      bytes += chunk.byteLength;
      if (chunk.byteLength < next.value.byteLength) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  let text = "";
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

async function fetchWithTimeout(fetcher: FetchLike, input: string | URL, init: RequestInit, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/giu, (entity, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return named[lower] ?? entity;
  });
}

function htmlToText(html: string): { title?: string; content: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  const withoutNoise = html.replace(/<(head|script|style|noscript|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/giu, " ");
  const withBreaks = withoutNoise.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)[^>]*>/giu, "\n");
  const content = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/gu, " "))
    .replace(/[ \t]+/gu, " ")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return {
    ...(title ? { title: decodeHtmlEntities(title).replace(/\s+/gu, " ").trim() } : {}),
    content: content.slice(0, MAX_CONTENT_CHARS),
  };
}

function jsonValue(value: unknown, fallback: unknown): unknown {
  return value === undefined ? fallback : value;
}

async function fetchPage(fetcher: FetchLike, inputUrl: URL, signal?: AbortSignal): Promise<WebContentResponse> {
  let url = inputUrl;
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetchWithTimeout(fetcher, url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
    }, signal, CONTENT_TIMEOUT_MS);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`HTTP ${response.status} redirect without a location.`);
      url = validateWebUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const body = await readLimited(response, MAX_PAGE_RESPONSE_BYTES);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return { url: url.toString(), content: body.slice(0, MAX_CONTENT_CHARS) };
    }
    const extracted = htmlToText(body);
    return { url: url.toString(), ...extracted };
  }
  throw new Error("Too many redirects.");
}

async function searchBrave(options: WebSearchOptions, params: WebSearchParameters, signal?: AbortSignal): Promise<WebSearchResponse> {
  const apiKey = requireApiKey(options);
  const count = Math.min(params.count ?? DEFAULT_RESULT_COUNT, MAX_RESULT_COUNT);
  const country = validateCountry(params.country ?? "US");
  const freshness = validateFreshness(params.freshness);
  const query = params.query.trim();
  const searchUrl = new URL(BRAVE_SEARCH_URL);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("count", String(count));
  searchUrl.searchParams.set("country", country);
  if (freshness) searchUrl.searchParams.set("freshness", freshness);

  const fetcher = options.fetch ?? fetch;
  const response = await fetchWithTimeout(fetcher, searchUrl, {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey },
  }, signal, SEARCH_TIMEOUT_MS);
  if (!response.ok) {
    const errorBody = (await readLimited(response, 8_000)).trim();
    throw new Error(`Brave Search HTTP ${response.status}: ${errorBody || response.statusText}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(await readLimited(response, MAX_API_RESPONSE_BYTES));
  } catch (error) {
    throw new Error(`Brave Search returned invalid JSON: ${errorMessage(error)}`);
  }
  const web = isRecord(data) && isRecord(data.web) ? data.web : {};
  const rawResults = Array.isArray(web.results) ? web.results : [];
  const results: WebSearchResult[] = [];
  for (const raw of rawResults) {
    if (results.length >= count || !isRecord(raw)) break;
    const url = typeof raw.url === "string" ? raw.url : "";
    if (!url) continue;
    const result: WebSearchResult = {
      title: typeof raw.title === "string" ? raw.title : "",
      url,
      snippet: typeof raw.description === "string" ? raw.description : "",
    };
    const age = jsonValue(raw.age, raw.page_age);
    if (typeof age === "string" && age) result.age = age;
    results.push(result);
  }

  if (params.includeContent) {
    for (const result of results) {
      try {
        result.content = (await fetchPage(fetcher, validateWebUrl(result.url), signal)).content;
      } catch (error) {
        if (signal?.aborted) throw error;
        result.content = `(Error: ${errorMessage(error)})`;
      }
    }
  }
  return { provider: "brave", query, results };
}

export function createWebTools(options: WebSearchOptions = {}): { tools: AgentTool[]; protectedToolKinds: ReadonlyMap<string, ApprovalKind> } {
  const protectedToolKinds = new Map<string, ApprovalKind>([
    ["web_search", "web"],
    ["web_content", "web"],
  ]);
  const webSearchTool: AgentTool<typeof webSearchParameters, WebSearchResponse> = {
    name: "web_search",
    label: "Search the web",
    description: "Search the public web through Brave Search and return source URLs, snippets, and optional bounded page text. Requires BRAVE_API_KEY and web approval.",
    parameters: webSearchParameters,
    async execute(_toolCallId, params, signal) {
      return toolResult(await searchBrave(options, params, signal));
    },
  };
  const webContentTool: AgentTool<typeof webContentParameters, WebContentResponse> = {
    name: "web_content",
    label: "Read web content",
    description: "Fetch a public HTTP or HTTPS page and return bounded readable text. Requires web approval.",
    parameters: webContentParameters,
    async execute(_toolCallId, params, signal) {
      const fetcher = options.fetch ?? fetch;
      return toolResult(await fetchPage(fetcher, validateWebUrl(params.url), signal));
    },
  };
  return { tools: [webSearchTool, webContentTool], protectedToolKinds };
}
