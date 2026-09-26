# @chaojihao/openclaw-plugin-bocha

[![CI](https://github.com/helloworldtang/openclaw-plugin-bocha/actions/workflows/ci.yml/badge.svg)](https://github.com/helloworldtang/openclaw-plugin-bocha/actions/workflows/ci.yml)

[Bocha](https://open.bocha.cn) Web Search provider plugin for
[OpenClaw](https://github.com/openclaw/openclaw). Adds `bocha` as a selectable
provider for the built-in `web_search` tool.

> Not using OpenClaw? A standalone [ClawHub skill](./skill/SKILL.md)
> ([clawhub.ai/helloworldtang/skills/bocha](https://clawhub.ai/helloworldtang/skills/bocha))
> teaches any agent to call the Bocha API directly with the same conventions.

## Why

- **Chinese-first search quality** — Bocha's index is strong on Chinese-language
  content, which matters for queries Brave/Tavily/Exa handle poorly.
- **Direct mainland-China access** — `api.bocha.cn` needs no proxy, unlike most
  Western search APIs.
- **Cheap** — metered per successful search (see [pricing](https://open.bocha.cn)).

## Install

```bash
openclaw plugins install @chaojihao/openclaw-plugin-bocha
```

Then set your API key (get one at <https://open.bocha.cn>, free tier available):

```bash
openclaw config set plugins.entries.bocha.enabled true
# Option A: store the key in OpenClaw config
openclaw configure --section web
# Option B: environment variable in the Gateway environment
export BOCHA_API_KEY=sk-...
```

Select the provider:

```bash
openclaw config set tools.web.search.provider bocha
```

## Tool parameters

Exposed through the standard `web_search` tool:

| Parameter   | Type    | Default   | Description                                               |
| ----------- | ------- | --------- | --------------------------------------------------------- |
| `query`     | string  | required  | Search query; natural language supported                  |
| `count`     | integer | 10        | Results to return (1–50)                                  |
| `freshness` | string  | `noLimit` | `oneDay` / `oneWeek` / `oneMonth` / `oneYear` / `noLimit` |
| `summary`   | boolean | false     | Include Bocha's AI-generated page summaries               |

## Configuration

| Path (in `openclaw.json`)                        | Env var          | Purpose                          |
| ------------------------------------------------ | ---------------- | -------------------------------- |
| `plugins.entries.bocha.config.webSearch.apiKey`  | `BOCHA_API_KEY`  | Bocha API key                    |
| `plugins.entries.bocha.config.webSearch.baseUrl` | `BOCHA_BASE_URL` | API base override (proxies)      |
| `tools.web.search.timeoutSeconds`                | —                | Request timeout (default 30s)    |
| `tools.web.search.cacheTtlMinutes`               | —                | Result cache TTL (default 10min) |

Untrusted content: every title/snippet/summary is wrapped in per-request
boundary markers before it reaches the agent, mirroring OpenClaw's bundled
search providers.

## Compatibility

- OpenClaw `>= 2026.9.6` (developed and tested against 2026.9.6; plugin APIs are
  experimental — pin and test your host version).
- Node 24.16+ / 26.1+.

## Development

```bash
pnpm install
pnpm test        # vitest, no network needed
pnpm lint && pnpm typecheck
pnpm build       # emits dist/ (required for installation)
```

## License

[MIT](./LICENSE). Not affiliated with Bocha AI or the OpenClaw Foundation.
