/**
 * Bocha web-search provider descriptor and tool definition. Credential lookup
 * follows the OpenClaw search-provider contract: scoped plugin config first,
 * then the BOCHA_API_KEY environment variable.
 */
import { executeBochaSearch } from "./bocha-client.js";

/** Canonical config path for the Bocha API key inside OpenClaw config. */
export const BOCHA_CREDENTIAL_PATH = "plugins.entries.bocha.config.webSearch.apiKey";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readScopedApiKey(searchConfig: unknown): unknown {
  if (!isRecord(searchConfig)) {
    return undefined;
  }
  return isRecord(searchConfig.bocha) ? searchConfig.bocha.apiKey : searchConfig.apiKey;
}

/** Build the Bocha provider registration using only public SDK surfaces. */
export function createBochaWebSearchProvider() {
  return {
    id: "bocha",
    label: "Bocha Search",
    hint: "Chinese-first structured web search · direct China mainland access",
    envVars: ["BOCHA_API_KEY"],
    placeholder: "sk-...",
    signupUrl: "https://open.bocha.cn",
    docsUrl: "https://github.com/helloworldtang/openclaw-plugin-bocha",
    credentialPath: BOCHA_CREDENTIAL_PATH,
    getCredentialValue: (searchConfig: unknown) => readScopedApiKey(searchConfig),
    setCredentialValue: (searchConfigTarget: Record<string, unknown>, value: unknown) => {
      const bocha = (searchConfigTarget.bocha ??= {});
      if (isRecord(bocha)) {
        bocha.apiKey = value;
      }
    },
    createTool: (ctx: { searchConfig?: unknown; config?: unknown }) => ({
      description:
        "Search the web using the Bocha Web Search API (api.bocha.cn). Strong Chinese-language coverage with direct access from mainland China. Returns titles, URLs, snippets, and optional AI summaries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query string. Natural language supported.",
          },
          count: {
            type: "integer",
            description: "Number of results to return (1-50). Default: 10.",
            minimum: 1,
            maximum: 50,
          },
          freshness: {
            type: "string",
            enum: ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"],
            description: "Time range filter. Default: noLimit.",
          },
          summary: {
            type: "boolean",
            description: "Include Bocha's AI-generated summary for each page. Default: false.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      } satisfies Record<string, unknown>,
      execute: async (
        args: Record<string, unknown>,
        context?: { signal?: AbortSignal },
      ): Promise<Record<string, unknown>> => {
        context?.signal?.throwIfAborted();
        return await executeBochaSearch(
          args,
          { searchConfig: ctx.searchConfig, config: ctx.config },
          { signal: context?.signal },
        );
      },
    }),
  };
}
