/**
 * Bocha Web Search HTTP client. Implements request normalization, credential
 * resolution, response mapping, a small TTL cache, and local untrusted-content
 * wrapping that mirrors OpenClaw's bundled web-search providers.
 */
import { wrapWebContent } from "./untrusted-content.js";

const DEFAULT_BOCHA_BASE_URL = "https://api.bocha.cn";
const WEB_SEARCH_ENDPOINT_PATH = "/v1/web-search";
const DEFAULT_SEARCH_COUNT = 10;
const MAX_SEARCH_COUNT = 50;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_CACHE_TTL_MINUTES = 10;
const MAX_CACHE_ENTRIES = 128;
const MAX_RESULT_URL_CHARS = 2048;
const MAX_TOTAL_CONTENT_CHARS = 20_000;
const MAX_PUBLISHED_CHARS = 31;

const FRESHNESS_VALUES = new Set(["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"]);

/** Bocha web-search response subset used by this plugin. */
type BochaWebSearchResponse = {
  code?: number;
  msg?: string;
  log_id?: string;
  data?: {
    webPages?: {
      totalEstimatedMatches?: number;
      value?: Array<{
        name?: string;
        url?: string;
        snippet?: string;
        summary?: string;
        siteName?: string;
        datePublished?: string;
        dateLastCrawled?: string;
      }>;
    };
  };
};

export type BochaToolContext = {
  searchConfig?: unknown;
  config?: unknown;
};

export type BochaSearchOptions = {
  signal?: AbortSignal;
};

type ScopedSearchConfig = {
  bocha?: { apiKey?: unknown; baseUrl?: unknown };
  apiKey?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Accept plain strings and OpenClaw secret-input objects ({ value } / { secret }). */
function readSecretString(value: unknown): string | undefined {
  const direct = readString(value);
  if (direct) {
    return direct;
  }
  if (isRecord(value)) {
    return readString(value.value) ?? readString(value.secret);
  }
  return undefined;
}

function readScopedSearchConfig(ctx: BochaToolContext): ScopedSearchConfig | undefined {
  if (!isRecord(ctx.searchConfig)) {
    return undefined;
  }
  const scoped = ctx.searchConfig;
  return {
    bocha: isRecord(scoped.bocha)
      ? { apiKey: scoped.bocha.apiKey, baseUrl: scoped.bocha.baseUrl }
      : undefined,
    apiKey: scoped.apiKey,
  };
}

function readPluginWebSearchConfig(ctx: BochaToolContext): Record<string, unknown> | undefined {
  if (!isRecord(ctx.config)) {
    return undefined;
  }
  const plugins = isRecord(ctx.config.plugins) ? ctx.config.plugins : undefined;
  const entries = isRecord(plugins?.entries) ? plugins.entries : undefined;
  const entry = isRecord(entries?.bocha) ? entries.bocha : undefined;
  const pluginConfig = isRecord(entry?.config) ? entry.config : undefined;
  return isRecord(pluginConfig?.webSearch) ? pluginConfig.webSearch : undefined;
}

function readWebSearchSettings(ctx: BochaToolContext): Record<string, unknown> | undefined {
  if (!isRecord(ctx.config)) {
    return undefined;
  }
  const tools = isRecord(ctx.config.tools) ? ctx.config.tools : undefined;
  const web = isRecord(tools?.web) ? tools.web : undefined;
  const search = isRecord(web?.search) ? web.search : undefined;
  return search;
}

/** Resolve the Bocha API key: scoped search config → plugin config → environment. */
export function resolveBochaApiKey(ctx: BochaToolContext): string | undefined {
  const scoped = readScopedSearchConfig(ctx);
  return (
    readSecretString(scoped?.bocha?.apiKey) ??
    readSecretString(scoped?.apiKey) ??
    readSecretString(readPluginWebSearchConfig(ctx)?.apiKey) ??
    readSecretString(process.env.BOCHA_API_KEY)
  );
}

function resolveBochaBaseUrl(ctx: BochaToolContext): string {
  const scoped = readScopedSearchConfig(ctx);
  const configured =
    readString(scoped?.bocha?.baseUrl) ??
    readString(readPluginWebSearchConfig(ctx)?.baseUrl) ??
    readString(process.env.BOCHA_BASE_URL);
  return (configured ?? DEFAULT_BOCHA_BASE_URL).replace(/\/+$/u, "");
}

function resolveTimeoutSeconds(ctx: BochaToolContext): number {
  const raw = readWebSearchSettings(ctx)?.timeoutSeconds;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_TIMEOUT_SECONDS;
}

function resolveCacheTtlMs(ctx: BochaToolContext): number {
  const raw = readWebSearchSettings(ctx)?.cacheTtlMinutes;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, raw) * 60_000;
  }
  return DEFAULT_CACHE_TTL_MINUTES * 60_000;
}

function readQuery(args: Record<string, unknown>): string | undefined {
  return readString(args.query);
}

function readCount(args: Record<string, unknown>): number {
  const raw = args.count;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(MAX_SEARCH_COUNT, Math.max(1, Math.floor(raw)));
  }
  return DEFAULT_SEARCH_COUNT;
}

function readFreshness(args: Record<string, unknown>): string | undefined {
  const raw = readString(args.freshness);
  return raw && FRESHNESS_VALUES.has(raw) ? raw : undefined;
}

function missingKeyPayload(): Record<string, unknown> {
  return {
    error: "missing_bocha_api_key",
    message:
      "web_search (bocha) needs a Bocha API key. Get one at https://open.bocha.cn, then set BOCHA_API_KEY in the Gateway environment or configure plugins.entries.bocha.config.webSearch.apiKey (openclaw configure --section web).",
    docs: "https://open.bocha.cn",
  };
}

function invalidQueryPayload(): Record<string, unknown> {
  return {
    error: "invalid_query",
    message: "query must be a non-empty string.",
    docs: "https://open.bocha.cn",
  };
}

function invalidFreshnessPayload(): Record<string, unknown> {
  return {
    error: "invalid_freshness",
    message: "freshness must be one of: oneDay, oneWeek, oneMonth, oneYear, noLimit.",
    docs: "https://open.bocha.cn",
  };
}

function resolveEndpoint(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}${WEB_SEARCH_ENDPOINT_PATH}`;
    url.search = "";
    return url.toString();
  } catch {
    throw new Error(
      `Bocha Search base URL must be a valid http(s) URL (got: ${baseUrl}). Configure plugins.entries.bocha.config.webSearch.baseUrl.`,
    );
  }
}

function normalizeResultUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_RESULT_URL_CHARS) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.href.length > MAX_RESULT_URL_CHARS ? undefined : url.href;
  } catch {
    return undefined;
  }
}

function normalizePublished(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw || raw.length > MAX_PUBLISHED_CHARS) {
    return undefined;
  }
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? raw : undefined;
}

function resolveSiteName(url: string, fallback: unknown): string | undefined {
  const fromResponse = readString(fallback);
  if (fromResponse) {
    return fromResponse;
  }
  try {
    return new URL(url).hostname.replace(/^www\./u, "") || undefined;
  } catch {
    return undefined;
  }
}

/** Bocha titles/snippets/summaries contain raw newlines and runs of spaces. */
function normalizeText(value: unknown): string | undefined {
  const raw = readString(value);
  return raw ? raw.replace(/\s+/gu, " ").trim() : undefined;
}

type CacheEntry = { value: Record<string, unknown>; expiresAt: number };

const SEARCH_CACHE = new Map<string, CacheEntry>();

function readCache(key: string, now: number): Record<string, unknown> | undefined {
  const entry = SEARCH_CACHE.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= now) {
    SEARCH_CACHE.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: Record<string, unknown>, ttlMs: number): void {
  if (ttlMs <= 0) {
    return;
  }
  if (SEARCH_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldest = SEARCH_CACHE.keys().next().value;
    if (oldest !== undefined) {
      SEARCH_CACHE.delete(oldest);
    }
  }
  SEARCH_CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Test helper: clear the in-process search cache. */
export function clearSearchCacheForTests(): void {
  SEARCH_CACHE.clear();
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.text()).slice(0, 500);
    return body ? ` ${body}` : "";
  } catch {
    return "";
  }
}

async function postBochaWebSearch(params: {
  endpoint: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<BochaWebSearchResponse> {
  const timeoutSignal = AbortSignal.timeout(params.timeoutSeconds * 1_000);
  const signal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(params.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(params.body),
      signal,
    });
  } catch (error) {
    if (params.signal?.aborted) {
      throw params.signal.reason ?? error;
    }
    throw new Error(`Bocha Search API request failed: ${(error as Error).message}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new Error(`Bocha Search API error: HTTP ${response.status}${detail}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Bocha Search API returned malformed JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  if (!isRecord(data)) {
    throw new Error("Bocha Search API returned a malformed response body.");
  }
  return data as BochaWebSearchResponse;
}

/** Execute one Bocha web search and map the response into OpenClaw result rows. */
export async function executeBochaSearch(
  args: Record<string, unknown>,
  ctx: BochaToolContext,
  options?: BochaSearchOptions,
): Promise<Record<string, unknown>> {
  options?.signal?.throwIfAborted();

  const query = readQuery(args);
  if (!query) {
    return invalidQueryPayload();
  }

  const apiKey = resolveBochaApiKey(ctx);
  if (!apiKey) {
    return missingKeyPayload();
  }

  const rawFreshness = readString(args.freshness);
  if (rawFreshness && !FRESHNESS_VALUES.has(rawFreshness)) {
    return invalidFreshnessPayload();
  }

  const count = readCount(args);
  const freshness = readFreshness(args);
  const includeSummary = args.summary === true;
  const baseUrl = resolveBochaBaseUrl(ctx);
  const endpoint = resolveEndpoint(baseUrl);

  const cacheKey = JSON.stringify(["bocha", endpoint, query, count, freshness, includeSummary]);
  const cacheTtlMs = resolveCacheTtlMs(ctx);
  const cached = readCache(cacheKey, Date.now());
  if (cached) {
    return { ...cached, cached: true };
  }

  const body: Record<string, unknown> = { query, count };
  if (freshness) {
    body.freshness = freshness;
  }
  if (includeSummary) {
    body.summary = true;
  }

  const start = Date.now();
  const data = await postBochaWebSearch({
    endpoint,
    apiKey,
    body,
    timeoutSeconds: resolveTimeoutSeconds(ctx),
    signal: options?.signal,
  });
  options?.signal?.throwIfAborted();

  if (typeof data.code === "number" && data.code !== 200) {
    throw new Error(
      `Bocha Search API error: code ${data.code}${data.msg ? ` (${data.msg})` : ""}${
        data.log_id ? ` [log_id: ${data.log_id}]` : ""
      }`,
    );
  }

  const rawResults = Array.isArray(data.data?.webPages?.value) ? data.data?.webPages?.value : [];
  let remainingContentChars = MAX_TOTAL_CONTENT_CHARS;
  let truncated = false;
  const wrapBounded = (value: string): string => {
    if (value.length > remainingContentChars) {
      truncated = true;
    }
    const bounded = value.slice(0, Math.max(0, remainingContentChars));
    remainingContentChars -= bounded.length;
    return wrapWebContent(bounded);
  };

  const results = rawResults.slice(0, count).flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const url = normalizeResultUrl(entry.url);
    if (!url) {
      return [];
    }
    const published = normalizePublished(entry.datePublished ?? entry.dateLastCrawled);
    const title = normalizeText(entry.name);
    const snippet = normalizeText(entry.snippet);
    const summary = normalizeText(entry.summary);
    const mapped: Record<string, unknown> = {
      title: title ? wrapBounded(title) : "",
      url,
      snippet: snippet ? wrapBounded(snippet) : "",
      siteName: resolveSiteName(url, entry.siteName),
    };
    if (includeSummary) {
      mapped.summary = summary ? wrapBounded(summary) : "";
    }
    if (published) {
      mapped.published = published;
    }
    return [mapped];
  });

  const payload: Record<string, unknown> = {
    query,
    provider: "bocha",
    count: results.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "bocha",
      wrapped: true,
    },
    results,
  };
  if (truncated) {
    payload.truncated = true;
  }

  writeCache(cacheKey, payload, cacheTtlMs);
  return payload;
}
