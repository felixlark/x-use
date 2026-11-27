# 架构

## 决策

采用：

```text
MCP client
  -> X Use MCP (stdio, read-only)
  -> official xurl 1.3.4 CLI (OAuth2 user context)
  -> official X API v2
```

不直接管理 OAuth token，不复制 `~/.xurl`，不代理官方 hosted MCP。

## 为什么不是只有 xurl CLI

用户明确需要可发现、可调用的 X Use MCP。CLI 继续作为认证正本和人工回退；MCP 只补稳定工具合同、结构化错误和 Agent 原生发现。

## 为什么不是官方 hosted MCP 直接适配

官方 `api.x.com/mcp?read_only=true` 实测可用，但当前 59 个工具中没有最近搜索和独立媒体查询。若用它做主入口，仍需混合一个 REST 后端，产生两套 schema/错误/升级面。本期使用同一套官方 REST 端点，入口更小，也更符合七项需求。

若未来官方 MCP 增加这两项，可重新评估：优先保留现有工具名和返回合同，内部切到 hosted MCP；调用方不必改。

## 组件

| 组件 | 责任 |
| --- | --- |
| `src/server.js` | MCP `tools/list`、`tools/call`、resources 和统一 envelope |
| `src/tool-definitions.js` | 九个只读工具的 JSON Schema |
| `src/params.js` | URL/ID、字段、分页和查询参数映射 |
| `src/errors.js` | 分类、脱敏和错误 envelope |
| `src/xurl-client.js` | `execFile` 调用 `xurl`，无 shell、无 verbose、无 token 输出 |
| `skills/x-use` | 调用规则、边界和回退 |
| `scripts/install.sh` | 版本化安装、current symlink、Skill 同步 |

## 认证

- `X_USE_APP`：既有 xurl app 名
- `X_USE_USER`：既有 OAuth2 用户名
- `X_USE_XURL_BIN`：xurl 可执行文件，默认 `xurl`
- `X_USE_TIMEOUT_MS`：命令超时，默认 30 秒

每次原始请求显式传 `--auth oauth2`。没有 token 文件复制、没有 access token 参数、没有 `xurl token`。`x_status` 用安全的 `auth status` 元数据和一次 `/2/users/me` 实测认证。

认证失败由用户在其现有 xurl 流程恢复。X Use 无法也不应替用户完成认证挑战。

## 安全

1. `assertReadEndpoint` 只接受 `/2/` 路径，拒绝换行；当前实现没有任何 POST/PUT/DELETE/PATCH 分支。
2. 子进程用 `execFile` 参数数组，不经 shell。
3. 不启用 `xurl -v`，避免请求头进入日志。
4. 错误体递归删除 token、secret、authorization、cookie、password、PIN 和 client secret 类键。
5. stdout 只承载 MCP JSON-RPC；诊断写 stderr。
6. XChat 私钥和 PIN 不进入本进程。`x_chat_read` 固定传 `--no-mark-read`，只读取、不改已读状态。

## 返回与错误

成功保留 X `data`、`includes`，并映射 `meta.next_token` 等为统一 `pagination`。工具特有的 ID、scope 和链接放 `meta`。

失败固定返回 `ok=false` 和 `error.code`。HTTP 401、403、404、429、400 分别映射到 `unauthenticated`、`forbidden`、`not_found`、`rate_limited`、`invalid_request`；其余为 `unknown`。

## 安装与升级

- 源码：`~/Projects/x-use`
- 发布：`~/Library/Application Support/x-use/releases/<commit>`
- current：`~/Library/Application Support/x-use/current`
- Skill：`~/.agents/skills/x-use -> current/skills/x-use`

Codex 注册固定指向 `current/bin/x-use-mcp.js`，升级后只需 Reload/Restart MCP。xurl 升级独立于本工程；README 记录当前验证版本。

## 回退

1. MCP 不可用时，按用户级 `xurl` Skill 使用官方 CLI 读取。
2. xurl OAuth2 失效时，先 `xurl auth status`，再由用户恢复其 OAuth2 会话。
3. 独立媒体端点 403 时，用 `x_post` 的 `includes.media`；不伪造单独媒体查询成功。
4. 全归档 403 时返回 `forbidden`，不做隐式 recent 降级。

