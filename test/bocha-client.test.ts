import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSearchCacheForTests,
  executeBochaSearch,
  resolveBochaApiKey,
} from "../src/bocha-client.js";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function bochaResponse(value: Array<Record<string, unknown>>): unknown {
  return {
    code: 200,
    log_id: "log-1",
    data: {
      webPages: {
        totalEstimatedMatches: value.length,
        value,
      },
    },
  };
}

const BASE_CTX = { searchConfig: { bocha: { apiKey: "sk-test" } } };

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  clearSearchCacheForTests();
  delete process.env.BOCHA_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveBochaApiKey", () => {
  it("prefers scoped bocha.apiKey", () => {
    expect(resolveBochaApiKey(BASE_CTX)).toBe("sk-test");
  });

  it("falls back to env when config has no key", () => {
    process.env.BOCHA_API_KEY = "sk-env";
    expect(resolveBochaApiKey({})).toBe("sk-env");
  });

  it("reads secret-input objects", () => {
    expect(resolveBochaApiKey({ searchConfig: { bocha: { apiKey: { value: "sk-obj" } } } })).toBe(
      "sk-obj",
    );
  });
});

describe("executeBochaSearch", () => {
  it("returns a missing-key error payload without calling the API", async () => {
    const result = await executeBochaSearch({ query: "x" }, {});
    expect(result).toMatchObject({ error: "missing_bocha_api_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty query", async () => {
    const result = await executeBochaSearch({ query: "  " }, BASE_CTX);
    expect(result).toMatchObject({ error: "invalid_query" });
  });

  it("rejects an unknown freshness value", async () => {
    const result = await executeBochaSearch({ query: "x", freshness: "hour" }, BASE_CTX);
    expect(result).toMatchObject({ error: "invalid_freshness" });
  });

  it("sends the documented request shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse(bochaResponse([])));
    await executeBochaSearch(
      { query: "上海天气", count: 5, freshness: "oneWeek", summary: true },
      BASE_CTX,
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.bocha.cn/v1/web-search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ query: "上海天气", count: 5, freshness: "oneWeek", summary: true }),
      }),
    );
  });

  it("maps webPages.value into wrapped result rows", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        bochaResponse([
          {
            name: "阿里ESG报告",
            url: "https://example.com/esg",
            snippet: "摘要\n文本  多空格",
            siteName: "Example",
            datePublished: "2026-08-15T00:00:00+08:00",
            dateLastCrawled: "2026-09-01",
          },
          { name: "no url entry" },
          { name: "bad proto", url: "ftp://example.com/x" },
        ]),
      ),
    );
    const result = await executeBochaSearch({ query: "esg" }, BASE_CTX);

    expect(result).toMatchObject({ query: "esg", provider: "bocha", count: 1 });
    expect(result.externalContent).toEqual({
      untrusted: true,
      source: "web_search",
      provider: "bocha",
      wrapped: true,
    });
    const rows = result.results as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe("https://example.com/esg");
    expect(rows[0].siteName).toBe("Example");
    // datePublished wins over dateLastCrawled
    expect(rows[0].published).toBe("2026-08-15T00:00:00+08:00");
    expect(String(rows[0].title)).toContain("EXTERNAL_UNTRUSTED_CONTENT");
    // whitespace runs collapse to single spaces — content stays on one line
    expect(String(rows[0].snippet)).toContain("摘要 文本 多空格");
    const contentLine = String(rows[0].snippet)
      .split("\n")
      .find((line) => line.includes("摘要"));
    expect(contentLine).toBe("摘要 文本 多空格");
  });

  it("includes summary rows only when summary=true", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          bochaResponse([
            { name: "t", url: "https://a.com/1", snippet: "s", summary: "ai summary" },
          ]),
        ),
      ),
    );
    const without = await executeBochaSearch({ query: "q" }, BASE_CTX);
    expect((without.results as Array<Record<string, unknown>>)[0]).not.toHaveProperty("summary");

    const withSummary = await executeBochaSearch({ query: "q", summary: true }, BASE_CTX);
    expect(String((withSummary.results as Array<Record<string, unknown>>)[0].summary)).toContain(
      "ai summary",
    );
  });

  it("surfaces HTTP errors with status and body excerpt", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(executeBochaSearch({ query: "http-error" }, BASE_CTX)).rejects.toThrow(
      /HTTP 401 .*unauthorized/u,
    );
  });

  it("surfaces Bocha business error codes with msg and log_id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 429, msg: "rate limited", log_id: "l9" }));
    await expect(executeBochaSearch({ query: "biz-error" }, BASE_CTX)).rejects.toThrow(
      /code 429 \(rate limited\) \[log_id: l9\]/u,
    );
  });

  it("serves a repeated query from cache without a second fetch", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(bochaResponse([]))));
    await executeBochaSearch({ query: "cached" }, BASE_CTX);
    await executeBochaSearch({ query: "cached" }, BASE_CTX);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects a custom baseUrl with trailing slash", async () => {
    fetchMock.mockResolvedValue(jsonResponse(bochaResponse([])));
    await executeBochaSearch(
      { query: "q" },
      { searchConfig: { bocha: { apiKey: "sk", baseUrl: "https://proxy.example.com/" } } },
    );
    expect(fetchMock.mock.calls[0][0]).toBe("https://proxy.example.com/v1/web-search");
  });
});
