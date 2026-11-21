# 接口与实现

本文说明 X Use MCP 对外暴露的工具合同、一次调用的内部路径、认证与错误处理，以及安装后的运行方式。调查依据见 [X API 调查](INVESTIGATION.md)，设计取舍见 [架构](ARCHITECTURE.md)。

## 总体结构

X Use 是一个通过 stdio 运行的 MCP Server。它不直接保管 X 的 access token，而是把每次只读请求交给本机官方 `xurl`：

```text
MCP client
  → x-use MCP server
  → official xurl CLI
  → X API v2
```

连接和 server capabilities 在 [`src/server.js`](../src/server.js) 中创建；主程序用 `StdioServerTransport` 连接 MCP 客户端。认证配置只来自安装时提供的 app、OAuth2 用户名和 xurl 路径。

## MCP 协议面

X Use 使用 MCP 标准 stdio JSON-RPC，不另建 HTTP 服务。当前实现：

- 响应 `initialize`，声明 tools 和 resources capability。
- 响应 `tools/list`，返回七个静态工具定义。
- 响应 `tools/call`，按工具名执行只读 X API 请求。
- 响应 `resources/list`，提供 `x-use://skill` 和 `x-use://docs/investigation`。
- 响应 `resources/read`，返回对应 Markdown。
- 响应 `resources/templates/list`，明确返回空数组，避免客户端因不支持模板而报警。

工具定义集中在 [`src/tool-definitions.js`](../src/tool-definitions.js)，MCP 请求处理在 [`src/server.js`](../src/server.js)。

## 七个工具

所有工具都是只读的，并声明：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": true
}
```

### `x_post`

读取一条 X 帖子。

必填：

- `post`：X 帖子 URL 或数字 status ID。

可选：

- `expansions`
- `post_fields`，映射为当前 X 参数 `post.fields`
- `user_fields`，映射为 `user.fields`
- `media_fields`，映射为 `media.fields`
- `poll_fields`
- `place_fields`

默认请求作者、媒体和引用帖，使用 `author_id`、`attachments.media_keys`、`referenced_posts` 等当前 expansion 名称。X URL 支持 `x.com`、`twitter.com` 及常见子域，但只提取 URL 中的数字 status ID。

### `x_user`

读取一个用户。

必填：

- `user`：`@username`、username 或数字用户 ID。

可选：

- `expansions`
- `user_fields`
- `post_fields`

数字 ID 使用 `/2/users/{id}`，用户名使用 `/2/users/by/username/{username}`。响应保留上游 `data` 与 `includes`。

### `x_user_posts`

读取某个用户发表的帖子。

必填：

- `user`

可选：

- `max_results`：5–100，默认 10
- `pagination_token`
- `start_time`、`end_time`
- `since_id`、`until_id`
- `exclude`：`replies`、`retweets`
- `expansions`
- `post_fields`、`user_fields`、`media_fields`、`poll_fields`、`place_fields`

用户名会先解析为用户 ID，再调用 `/2/users/{id}/tweets`。解析结果会写入 `meta.resolved_user`，不会把 username 直接拼进用户帖子路径。

### `x_search`

搜索帖子。

必填：

- `query`：X 官方搜索表达式。

可选：

- `scope`：`recent` 或 `all`，默认 `recent`
- `max_results`：recent 为 10–100，all 为 10–500
- `pagination_token`
- `start_time`、`end_time`
- `since_id`、`until_id`
- `sort_order`：`recency` 或 `relevancy`
- 各种 fields 和 `expansions`

`recent` 使用 `/2/tweets/search/recent`，覆盖最近 7 天。`all` 使用 `/2/tweets/search/all`，是否可用取决于账户权益；无权时不自动降级到 recent，而是返回 `forbidden`。

### `x_thread`

读取一个会话及其回复。

必填：

- `post`：会话中任意帖子 URL 或数字 ID。

可选：

- `scope`
- `max_results`
- `pagination_token`
- fields 和 `expansions`

实现分两步：

1. 用 `/2/tweets/{id}` 取得根帖的 `conversation_id`。
2. 用 `conversation_id:<id>` 调用 search。

返回的 `data` 包含 `root` 和 `thread`，`includes.root` 与 `includes.thread` 分别保留两层上游关联对象。该接口不是 X 的独立“线程端点”，因此 recent 范围、分页和权益边界与 Search 相同。

### `x_media`

按 media key 读取媒体元数据。

必填：

- `media_key`：形如 `<type>_<id>`。

可选：

- `media_fields`

调用 `/2/media/{media_key}`。如果 developer App 未加入所需 Project，X 会返回 `client-not-enrolled`，X Use 映射为 `forbidden`；此时可用父帖的 `x_post` 读取 `includes.media`，不会伪造独立媒体结果。

### `x_status`

无参数，返回：

- 当前 xurl 配置的 app、username、认证方式和超时
- 安全脱敏后的 auth store app/user 状态
- 对 `/2/users/me` 的实际认证探测
- `/2/usage/credits` 的额度响应或结构化错误
- rate limit 运行时头的可用性
- 写工具是否启用

该工具不读取 token 原值，也不调用 `xurl token`。

## 一次 `tools/call` 的执行路径

```text
MCP tools/call
  → 找到静态 tool definition
  → 校验参数对象及未知字段
  → 解析 URL、用户名、media key
  → 构造 /2/... 路径与查询参数
  → XurlClient.request()
  → xurl --app ... --username ... --auth oauth2 ...
  → 解析 JSON
  → 统一 success/error envelope
  → content[].text + structuredContent
```

### 参数校验

参数校验分布在 [`src/server.js`](../src/server.js) 和 [`src/params.js`](../src/params.js)：

- `src/server.js` 按工具的 JSON Schema 拒绝非对象参数和未知键
- `src/params.js` 校验必填字符串、整数范围、字段数组和 URL/ID 形态
- 解析帖子 URL/ID、用户名/用户 ID、media key
- 将数组转成 X API 要求的逗号分隔查询参数

当前字段映射如下：

| 工具参数 | X API 参数 |
| --- | --- |
| `post_fields` | `post.fields` |
| `user_fields` | `user.fields` |
| `media_fields` | `media.fields` |
| `poll_fields` | `poll.fields` |
| `place_fields` | `place.fields` |
| `expansions` | `expansions` |

分页遵循 X 的原生约定：上游 `meta.next_token` 被映射为响应中的 `pagination.next_token`；下一次调用把它作为 `pagination_token`。

## 成功返回

成功 envelope 的固定形状：

```json
{
  "ok": true,
  "data": {},
  "includes": {},
  "pagination": {
    "result_count": 10,
    "next_token": "opaque-token",
    "previous_token": null,
    "newest_id": "123",
    "oldest_id": "100"
  },
  "meta": {
    "tool": "x_user_posts",
    "backend": "x_api_v2",
    "endpoint": "/2/users/123/tweets?...",
    "upstream_meta": {},
    "partial_errors": [],
    "resolved_user": {}
  }
}
```

字段语义：

- `data`：X 上游的 data；单帖可能是对象，列表可能是数组
- `includes`：expansions 带来的用户、媒体、引用帖等
- `pagination`：从上游 `meta` 映射出的稳定分页视图；没有 `meta` 时为 `null`
- `meta`：本次工具、后端、端点、原始 upstream meta 和局部错误
- `partial_errors`：上游 200 响应中的 `errors`，不能因为存在它就把整个请求判为失败

MCP 层返回同时包含：

```json
{
  "content": [{"type": "text", "text": "{...JSON...}"}],
  "structuredContent": {"ok": true},
  "isError": false
}
```

`isError` 只在整个 envelope 为 `ok:false` 时为 `true`。

## 错误返回

错误 envelope：

```json
{
  "ok": false,
  "error": {
    "code": "forbidden",
    "message": "actionable message",
    "retryable": false,
    "http_status": 403,
    "upstream_type": "https://api.x.com/2/problems/...",
    "details": {}
  }
}
```

错误代码：

| 代码 | 触发条件 |
| --- | --- |
| `unauthenticated` | 401、缺少认证、token 失效 |
| `forbidden` | 403、scope/Project/套餐/资源权限不足 |
| `rate_limited` | 429、usage cap |
| `not_found` | 404 或 `resource-not-found` |
| `invalid_request` | 本地参数或上游 400/无效查询 |
| `unknown` | 无法归类的上游或本地错误 |

分类逻辑在 [`src/errors.js`](../src/errors.js)。错误体在输出前递归删除 token、secret、authorization、cookie、password、PIN 等敏感字段。

## xurl 传输层

[`src/xurl-client.js`](../src/xurl-client.js) 只负责传输和安全边界：

- 用 `execFile` 启动 xurl，参数数组不经过 shell
- 读取 `X_USE_APP`、`X_USE_USER`、`X_USE_XURL_BIN`、`X_USE_TIMEOUT_MS`
- 原始请求显式增加 `--auth oauth2`
- 只允许 `/2/` 读取路径；没有 POST/PUT/PATCH/DELETE 方法入口
- 不启用 `xurl -v`，不调用 `xurl token`
- 解析 stdout JSON；失败时保留可读的 stderr 摘要

由于 xurl 默认执行 GET 且本工程没有写入方法分支，写能力在代码路径上不存在，而不是仅靠 MCP 工具描述隐藏。

## 安装与运行

源码在 `~/Projects/x-use`，安装脚本在 [`scripts/install.sh`](../scripts/install.sh)：

1. 以当前 Git commit 建立版本目录。
2. 复制源码、Skill 和文档。
3. 在版本目录运行 production `npm ci`。
4. 将 `~/Library/Application Support/x-use/current` 指向该版本。
5. 将 `~/.agents/skills/x-use` 指向安装版 Skill。

Codex 注册固定指向：

```text
~/Library/Application Support/x-use/current/bin/x-use-mcp.js
```

因此升级只需重装和 Reload/Restart MCP，不需要改注册命令。安装版的 `initialize`、`tools/list`、`resources/list`、`resources/read` 由 [`scripts/check-mcp.mjs`](../scripts/check-mcp.mjs) 验证；真实 X 读取由 [`scripts/live-smoke.mjs`](../scripts/live-smoke.mjs) 验证。

## 刻意未实现的接口

以下动作即使账号具备 scope，也不在本 MCP 暴露：

- 发帖、回复、引用
- DM 和 XChat 内容
- 关注/取关
- 点赞/取消点赞
- 书签
- 删除帖子
- 媒体上传

这些操作涉及外发、不可逆副作用或额外私钥，必须另案取得当前动作的明确授权。X Use 不把“工具未暴露”解释为“动作未获授权”，也不在运行时自动切换账号、供应商或付费方式。

