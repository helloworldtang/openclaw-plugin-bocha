## Description:

Bocha Web Search skill — Chinese-first web search with direct China mainland access via the Bocha Web Search API. Covers online lookup, time-sensitive information, fact-checking, and citation-backed answers, with mandatory untrusted-content discipline.

博查 Web 搜索 skill——中文优先、中国大陆直连（Bocha Web Search API）。覆盖联网查询、时效性信息、事实核查与带引用的回答，并强制执行不可信内容纪律。

This skill is ready for commercial/non-commercial use.

## Publisher:

[chaojihao](https://clawhub.ai/user/chaojihao)

### License/Terms of Use:

MIT

## Use Case:

Agents answering Chinese-language questions, operating from mainland-China networks where Western search APIs are unreachable, or needing current web information with cited sources. Pairs with the OpenClaw code plugin `@chaojihao/openclaw-plugin-bocha` for full `web_search` provider integration.

回答中文问题的 Agent、从中国大陆网络运行（海外搜索 API 不可达）的 Agent、或需要带来源引用的联网信息的 Agent。可与 OpenClaw code 插件 `@chaojihao/openclaw-plugin-bocha` 配对使用，获得完整的 `web_search` provider 集成。

### Deployment Geography for Use:

Global (endpoint `api.bocha.cn` reachable without proxy from mainland China)

全球可用（`api.bocha.cn` 从中国大陆无需代理直连）

## Known Risks and Mitigations:

Risk: Search terms derived from user prompts are sent to Bocha's external API using `BOCHA_API_KEY`; returned titles/snippets/summaries are untrusted web content.

风险：源自用户提示词的搜索词会携带 `BOCHA_API_KEY` 发往博查外部 API；返回的标题/摘要/正文属于不可信网络内容。

Mitigation: The skill mandates treating all search-result content as data (never instructions), keeping the API key in the Authorization header only, and excluding secrets, credentials, and private documents from queries.

缓解：本 skill 强制要求把所有搜索结果内容当作数据（绝不当作指令）、API Key 仅放入 Authorization 头、查询词中不携带密钥/凭据/私密文档。

## Reference(s):

- Bocha AI open platform / 博查 AI 开放平台: https://open.bocha.cn
- Companion OpenClaw plugin / 配套 OpenClaw 插件: https://github.com/helloworldtang/openclaw-plugin-bocha
