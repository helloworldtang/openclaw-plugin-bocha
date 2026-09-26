# @chaojihao/openclaw-plugin-bocha

[English](./README.md) | 简体中文

[![CI](https://github.com/helloworldtang/openclaw-plugin-bocha/actions/workflows/ci.yml/badge.svg)](https://github.com/helloworldtang/openclaw-plugin-bocha/actions/workflows/ci.yml)

[博查 Bocha](https://open.bocha.cn) Web 搜索 Provider 插件，为
[OpenClaw](https://github.com/openclaw/openclaw) 提供服务：把 `bocha` 注册为内置
`web_search` 工具的可选搜索引擎。

> 不用 OpenClaw？还有一个独立的 [ClawHub skill](./skill/SKILL.md)
> （[clawhub.ai/helloworldtang/skills/bocha](https://clawhub.ai/helloworldtang/skills/bocha)），
> 教任何 Agent 按同样的约定直调博查 API。

## 为什么选它

- **中文搜索质量**——博查索引对中文内容更强，Brave/Tavily/Exa 处理不好的中文查询它是补位选手
- **大陆直连**——`api.bocha.cn` 无需代理，多数海外搜索 API 在中国大陆环境下不可达
- **便宜**——按成功搜索计费（见[定价](https://open.bocha.cn)），注册有免费额度

## 安装

```bash
openclaw plugins install @chaojihao/openclaw-plugin-bocha
```

然后配置 API Key（到 <https://open.bocha.cn> 注册获取，有免费额度）：

```bash
openclaw config set plugins.entries.bocha.enabled true
# 方式 A（推荐，持久）：把 Key 存进 OpenClaw 配置
openclaw config set plugins.entries.bocha.config.webSearch.apiKey sk-...
# 或交互式配置：openclaw configure --section web
# 方式 B：环境变量——注意必须注入到网关进程自身的环境
# （macOS LaunchAgent 托管的网关，shell 里 export 或 launchctl setenv 都不持久，
#   所以推荐方式 A；配置项优先级也高于环境变量）
BOCHA_API_KEY=sk-...
```

选择 provider：

```bash
openclaw config set tools.web.search.provider bocha
```

**别忘了**：`tools.web.search.enabled` 默认是关的，不开的话 `web_search` 工具不会出现：

```bash
openclaw config set tools.web.search.enabled true
```

## 工具参数

通过标准 `web_search` 工具暴露：

| 参数        | 类型    | 默认值    | 说明                                                      |
| ----------- | ------- | --------- | --------------------------------------------------------- |
| `query`     | string  | 必填      | 搜索词，支持自然语言                                        |
| `count`     | integer | 10        | 返回结果数（1–50）                                          |
| `freshness` | string  | `noLimit` | `oneDay` / `oneWeek` / `oneMonth` / `oneYear` / `noLimit` |
| `summary`   | boolean | false     | 附带博查 AI 生成的网页原文摘要                               |

## 配置项

| 路径（`openclaw.json` 内）                        | 环境变量          | 用途                    |
| ------------------------------------------------ | ----------------- | ----------------------- |
| `plugins.entries.bocha.config.webSearch.apiKey`  | `BOCHA_API_KEY`  | 博查 API Key            |
| `plugins.entries.bocha.config.webSearch.baseUrl` | `BOCHA_BASE_URL` | API 地址覆盖（走代理时） |
| `tools.web.search.timeoutSeconds`                | —                 | 请求超时（默认 30 秒）    |
| `tools.web.search.cacheTtlMinutes`                | —                 | 结果缓存 TTL（默认 10 分钟） |

不可信内容处理：所有标题/摘要/正文在到达 Agent 之前都会包裹按请求隔离的边界标记，
与 OpenClaw 内置搜索 provider 的做法一致——搜索结果里的指令不会被当作指令执行。

## 兼容性

- OpenClaw `>= 2026.9.6`（在 2026.9.6 上开发测试；插件 API 仍是实验性的，建议锁定并实测你的宿主版本）
- Node 24.16+ / 26.1+

## 开发

```bash
pnpm install
pnpm test        # vitest，无需网络
pnpm lint && pnpm typecheck
pnpm build       # 产出 dist/（安装必需）
```

## 许可证

[MIT](./LICENSE)。与博查 AI、OpenClaw Foundation 无隶属关系。
