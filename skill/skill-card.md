## Description:

Bocha Web Search skill — Chinese-first web search with direct China mainland access via the Bocha Web Search API. Covers online lookup, time-sensitive information, fact-checking, and citation-backed answers, with mandatory untrusted-content discipline.

This skill is ready for commercial/non-commercial use.

## Publisher:

[chaojihao](https://clawhub.ai/user/chaojihao)

### License/Terms of Use:

MIT

## Use Case:

Agents answering Chinese-language questions, operating from mainland-China networks where Western search APIs are unreachable, or needing current web information with cited sources. Pairs with the OpenClaw code plugin `@chaojihao/openclaw-plugin-bocha` for full `web_search` provider integration.

### Deployment Geography for Use:

Global (endpoint `api.bocha.cn` reachable without proxy from mainland China)

## Known Risks and Mitigations:

Risk: Search terms derived from user prompts are sent to Bocha's external API using `BOCHA_API_KEY`; returned titles/snippets/summaries are untrusted web content.

Mitigation: The skill mandates treating all search-result content as data (never instructions), keeping the API key in the Authorization header only, and excluding secrets, credentials, and private documents from queries.

## Reference(s):

- Bocha AI open platform: https://open.bocha.cn
- Companion OpenClaw plugin: https://github.com/helloworldtang/openclaw-plugin-bocha
