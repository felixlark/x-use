# X API 与 X Use 调查

- 调查日期：2026-11-21
- 官方文档快照：X API v2 OpenAPI `2.175`
- 范围：只读能力、认证、套餐/额度、分页/expansions、错误、官方 hosted MCP、XChat、本机 `xurl`
- 产品判断：用户所写“NCP”没有反证；现有 `iot-use`、`wechat-use` 命名和语境均指向 MCP，因此按 MCP 实现

## 结论

1. X API v2 的官方能力足以支持本 MVP 的帖子、用户、用户帖子、搜索、会话、媒体和额度读取。
2. OAuth 2.0 Authorization Code + PKCE 是当前用户上下文的合适选择；`offline.access` 才产生 refresh token。现有本机 `xurl` 已有可用的 OAuth2 用户会话，不需要在 X Use 复制 token。
3. 官方 hosted X MCP 存在且可用，实测 59 个只读工具；它没有独立媒体查询和“最近搜索”工具，不能单独覆盖本期七项入口。
4. 因此本期采用官方 X REST + 官方 `xurl` OAuth 传输的薄 MCP 适配，而不是重写 OAuth、代理官方 MCP 或复制一套凭据。
5. 当前 `xurl` OAuth2 用户已能真实读取用户、帖子和额度。独立媒体端点返回 `client-not-enrolled`；帖子 `includes.media` 仍能返回附带媒体。全归档搜索权益和 XChat 内容读取未验。

## 能力地图

| 能力 | 官方端点/方式 | 认证与 scope | 当前限制 |
| --- | --- | --- | --- |
| 按 ID 读帖子 | `GET /2/tweets/{id}` | OAuth2 user：`tweet.read users.read`；也支持 OAuth1 user 与 app-only | 字段按 `post.fields`；可用 expansions 取作者、媒体、引用帖 |
| 用户查询 | `GET /2/users/{id}`、`GET /2/users/by/username/{username}` | OAuth2 user：`tweet.read users.read`；也支持 app-only | 受保护账号取决于授权可见性 |
| 用户近期帖子 | `GET /2/users/{id}/tweets` | OAuth2 user：`tweet.read users.read`；也支持 app-only | `max_results` 5–100；用 opaque `pagination_token` 翻页 |
| 最近搜索 | `GET /2/tweets/search/recent` | OAuth2 user：`tweet.read users.read`；也支持 app-only | 最近 7 天；`max_results` 10–100 |
| 全归档搜索 | `GET /2/tweets/search/all` | OpenAPI 2.175 列出用户/OAuth1/app 认证；官方 auth mapping 仍将全归档列为 Academic Research 范围 | 账户权益未验；X Use 显式返回 `forbidden`，不自动降级 |
| 会话/回复 | 先读帖子的 `conversation_id`，再搜索 `conversation_id:<id>` | 随 Search 端点 | 不是独立线程端点；recent 只覆盖 7 天，排序仍需调用方处理 |
| 媒体元数据 | `GET /2/media/{media_key}`、`GET /2/media?media_keys=...` | OAuth2 user：`tweet.read`；也支持 app-only | 本机当前直查返回 `client-not-enrolled`；帖子附带的 `includes.media` 可用 |
| 认证用户 | `GET /2/users/me` | OAuth2/OAuth1 user | app-only 没有“当前用户” |
| 额度 | `GET /2/usage/credits` | OAuth2 user 或 app-only bearer | 当前用户读取成功 |
| 每日 Post 用量 | `GET /2/usage/tweets` | 仅 app-only bearer | 当前 xurl 状态没有 bearer；用 OAuth2 user 实测 403 |
| 发帖/回复/引用 | `POST /2/tweets` | OAuth2 user `tweet.read tweet.write users.read`，或 OAuth1 user | 不可用 app-only；本期没有工具 |
| 删除 | `DELETE /2/tweets/{id}` | `tweet.write` 等 | 本期没有工具 |
| DM | `/2/dm_conversations/...` | `dm.read dm.write`，用户上下文 | 本期没有工具 |
| 关注/点赞/书签 | follows/likes/bookmarks 写端点 | 对应 `*.write` | 本期没有工具 |
| 媒体上传 | `/2/media/upload` | `media.write` | 本期没有工具 |
| 书签、列表、关注关系读取 | 相应 GET 端点 | 依端点；常见 `bookmark.read`、`list.read`、`follows.read` | 非本期最小入口；能力存在不等于已授权 |

当前 OpenAPI 以 `post.fields`、`referenced_posts` 等名字显示新版 Post 语义；X Use 发送这些当前名字。为兼容旧客户端而存在的 `tweet.fields` 别名不作为本工程的合同。

## 认证模式

| 模式 | 适用 | 不适用 |
| --- | --- | --- |
| OAuth 2.0 Authorization Code + PKCE | 代表用户读取或写入，细粒度 scope，可跨设备 | 不要让服务端记录 PIN/私钥；client secret 不能放进公开客户端 |
| OAuth 1.0a user context | 既有 OAuth1 用户、仍需代表用户执行的动作 | 新集成优先 OAuth2；不要为了本 MCP 另建凭据 |
| OAuth 2.0 app-only Bearer | 仅公开、无需当前用户的数据读取 | 发帖、DM、账号私有数据、`/2/users/me` |

OAuth2 access token 默认约 2 小时有效；`offline.access` 才会获得 refresh token。授权码必须及时交换。回调 URI 需要精确匹配。用户登录必须由可信浏览器/用户完成，X Use 不采集凭据。

## 分页、字段与 expansions

- 初始请求带 `max_results`；查看 `meta.next_token`；下一页把它作为 `pagination_token`。
- `previous_token`、`newest_id`、`oldest_id` 都是上游 `meta` 字段；没有时应为 `null`，不能伪造。
- expansions 将关联对象放到 `includes`，用 ID 关联。典型组合：`author_id`、`attachments.media_keys`、`referenced_posts`。
- 默认只返回少量字段；需要作者、媒体、引用时，必须同时请求 expansion 和相应字段参数。
- X Use 保留上游 data/includes，并另给统一 `pagination` 对象，便于客户端稳定消费。

## 速率与费用

官方 rate limits 以端点分别计算，窗口通常为 15 分钟或 24 小时；OAuth2 用户与 app-only 使用不同池。响应头含 `x-rate-limit-limit`、`x-rate-limit-remaining`、`x-rate-limit-reset`。

本期相关限额：

| 端点 | Per App | Per User | 结果大小 |
| --- | --- | --- | --- |
| `GET /2/tweets/{id}` | 450/15min | 900/15min | 单资源 |
| `GET /2/users/{id}/tweets` | 10,000/15min | 900/15min | 5–100 |
| `GET /2/tweets/search/recent` | 450/15min | 300/15min | 10–100 |
| `GET /2/tweets/search/all` | 1/sec、300/15min | 1/sec | 10–500 |
| `GET /2/users/*` lookup | 300/15min | 900/15min | 单/批量 |

当前官方付费模型为 pay-per-usage：帖子读取 `$0.005/资源`，用户读取 `$0.010/资源`，关注/粉丝读取 `$0.010/资源`；普通发帖 `$0.015/请求`，含 URL 的发帖 `$0.200/请求`。Owned Reads 可为 `$0.001/资源`。同一资源在 24 小时 UTC 窗口内通常去重。月读上限 300 万条 Post，超过需 Enterprise。

价格会变，以 Developer Console 和官方 pricing 页为准；X Use 不购买、不充值、不绑卡。

## 错误语义

| HTTP | 官方含义 | X Use code |
| --- | --- | --- |
| 401 | 无效或缺失认证 | `unauthenticated` |
| 403 | 有效认证但无资源/套餐/scope/Project 权限 | `forbidden` |
| 404 或 `resource-not-found` | 帖子/用户/资源不存在或已删除 | `not_found` |
| 429、`rate-limit-exceeded`、`usage-capped` | 速率或用量上限 | `rate_limited` |
| 400、`invalid-request` | 参数/查询无效 | `invalid_request` |
| 其他 | 未确定的上游失败 | `unknown` |

200 响应也可能同时含 `data` 和 `errors`。X Use 保留 `meta.partial_errors`；只有无可用 data 的问题才作为工具错误。

## 官方 X MCP 与本机 xurl

官方文档定义：

- `https://api.x.com/mcp`：X API hosted Streamable HTTP MCP，协议 `2025-06-18`
- `https://docs.x.com/mcp`：文档搜索 MCP
- `xurl mcp`：本地 stdio↔HTTP 桥，读取既有 `~/.xurl` 认证或环境凭据，自动刷新并注入 Bearer
- `?read_only=true`：服务端只返回 GET 类工具并拒绝写调用

2026-11-21 的参考环境使用 `xurl 1.3.4` 连接官方只读 X MCP，成功得到 59 个工具、真实额度数据和真实公开帖子。工具中包括 `get_posts_by_id`、`get_users_by_username`、`get_users_posts`、`search_posts_all` 和 `get_usage_credits`，但没有：

- 最近搜索工具
- 独立 media-key 查询工具

官方 MCP 不提供 native dynamic client registration；仍需自家 X developer App 和 `xurl` 桥。它可作为未来上游能力增强，但本期不能单独覆盖最小入口。

## XChat

X Chat API 是官方稳定文档的一部分，但内容安全边界不同于普通 REST：

- OAuth2 需 `dm.read`／`dm.write`，并可能需要 `users.read`、`tweet.read`、`media.write`
- 内容用 Chat XDK 在本地加密/解密和签名
- identity/signing 私钥、conversation keys、export blob 和 PIN 均属高敏材料
- OAuth 撤销不等于私钥失效；私钥不得交给第三方服务或写入仓库

在一个已配置 OAuth2 用户的参考环境中，`xurl chat keys status` 显示：

- 账号已注册 1 个 key version
- 本机 local keys 为 none

因此普通 X 读取与 XChat 会话列表可用，但解密事件读取在密钥补齐前仍为 `blocked(local_private_key_absent)`。X Use 已增加两个只读工具：

- `x_chat_conversations`：列出当前收件箱，不改变已读状态
- `x_chat_read`：调用 `xurl chat read --json --no-mark-read` 读取并解密一个会话

不得从 X Chat App 提取、导出或复制私钥；只允许本人在可信终端通过官方恢复流程把已注册密钥补到本机。

## 参考实现验证

- `xurl 1.3.4` 是验证时使用的版本，也是当时的最新 release（2026-09-29）
- OAuth2 用户上下文已真实读取公开用户、帖子、用户帖子、最近搜索、会话结果和额度
- `xurl --auth oauth2` 是 X Use 固定认证方式，避免隐式回退到另一 auth 类型
- `GET /2/media/...` 在未加入所需 Project 的 App 上返回 `client-not-enrolled`；`x_post` 的 `includes.media` 已完成真实读取
- 不使用 `xurl -v`，因为可能暴露敏感请求头；因此 X Use 不在运行时伪造 rate-limit remaining/reset

## 与 x-deck / X Tweaks 扩展的职责边界

- `x-deck`：macOS 桌面客户端，承载时间线、帖子详情、X Chat 页面和人工草稿
- [X Tweaks](https://github.com/felixlark/x-use/tree/main/chrome-extension)：同仓维护、独立加载的 Chrome 扩展，调整 x.com 页面布局和导航
- X Use MCP：把官方 X API 只读响应结构化给 Agent/MCP 客户端

Chrome 扩展随当前浏览器页面运行，MCP 单独通过 `xurl` 认证。MCP 不读取或控制客户端的会话、窗口、草稿或页面。

## 未验与风险

| 项 | 状态 | 影响 |
| --- | --- | --- |
| 全归档搜索 | unknown | 可能 `forbidden`；不自动改用其他搜索范围 |
| 独立媒体查询 | blocked(client-not-enrolled) | 工具存在并真实上报；可从父帖 includes 取媒体 |
| 运行时 rate-limit headers | unavailable by chosen transport | 可区分 429，但不编造 remaining/reset |
| XChat 会话列表 | verified | 本机无私钥时仍可列出会话 |
| XChat 解密事件 | blocked(local_private_key_absent) | 工具入口已实现；须本人先完成官方密钥恢复，不能读取或记录 PIN/私钥 |
| 其他 X 账号/其他机器 | not tested | 必须自行完成 xurl OAuth2 并用 `x_status` 验证 |
| 写操作 | intentionally absent | 不是待授权；需要另案逐动作授权 |

## 官方来源

以下均在 2026-11-21 读取：

- API 文档索引与版本：<https://docs.x.com/llms.txt>、<https://docs.x.com/openapi.json>
- 认证总览：<https://docs.x.com/fundamentals/authentication/overview.md>
- OAuth2 PKCE、scope、token：<https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code.md>
- App-only Bearer：<https://docs.x.com/fundamentals/authentication/oauth-2-0/application-only.md>
- 认证到端点映射：<https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping.md>
- 帖子读取：<https://docs.x.com/x-api/posts/get-post-by-id.md>
- 用户读取：<https://docs.x.com/x-api/users/get-user-by-username.md>、<https://docs.x.com/x-api/users/get-my-user.md>
- 用户帖子：<https://docs.x.com/x-api/users/get-posts.md>
- 最近搜索：<https://docs.x.com/x-api/posts/search-recent-posts.md>
- 全归档搜索：<https://docs.x.com/x-api/posts/search-all-posts.md>
- 会话 ID：<https://docs.x.com/x-api/fundamentals/conversation-id.md>
- 媒体：<https://docs.x.com/x-api/media/get-media-by-media-key.md>
- 用量与额度：<https://docs.x.com/x-api/usage/get-usage.md>、<https://docs.x.com/x-api/usage/get-usage-credits.md>
- 分页：<https://docs.x.com/x-api/fundamentals/pagination.md>
- fields/expansions：<https://docs.x.com/x-api/fundamentals/fields.md>、<https://docs.x.com/x-api/fundamentals/expansions.md>
- 速率：<https://docs.x.com/x-api/fundamentals/rate-limits.md>
- 错误：<https://docs.x.com/x-api/fundamentals/response-codes-and-errors.md>
- 定价：<https://docs.x.com/x-api/getting-started/pricing.md>
- 官方 X MCP：<https://docs.x.com/tools/mcp.md>
- 官方 xurl：<https://docs.x.com/tools/xurl.md>、<https://github.com/xdevplatform/xurl/releases/tag/v1.3.4>
- XChat：<https://docs.x.com/xchat/introduction.md>、<https://docs.x.com/xchat/handling-private-keys.md>

