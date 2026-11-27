---
name: x-use
description: 通过只读 X Use MCP 调用官方 X MCP，查询 X 帖子、用户、提及、搜索以及 X Chat 会话和事件；使用本机 Chat XDK 解密已恢复的 X Chat 内容。发送走既有获准入口。
---

# X Use

用结构化工具读取 X API v2 和 X Chat。MCP 服务名是 `x-use`；工具全部只读。

## 先做

1. 需要确认连接或额度时先调用 `x_status`。
2. 已知帖子 URL/ID 时用 `x_post`；需要该帖作者、引用和媒体时保留默认 expansions。
3. 已知用户名或数字 ID 时用 `x_user`；列用户帖子用 `x_user_posts`。
4. 关键词、操作符、日期筛选用 `x_search`，默认 `scope=recent`，只覆盖最近 7 天。
5. 会话/回复用 `x_thread`。它先由帖子取得 `conversation_id`，再调用 Search；旧会话是否可得取决于搜索权益和范围。
6. 只有已知 media key 时用 `x_media`。若返回 `forbidden`，可从父帖 `x_post` 的 `includes.media` 读取同一元数据。
7. X Chat 先调用 `x_chat_conversations` 列出当前会话，再用 `x_chat_read` 读取指定会话最近事件。读取固定使用 `--no-mark-read`，不会改变已读状态。
8. 官方 X MCP 统一入口用 `x_mcp`。先传 `list_tools=true` 查看实时白名单，再把官方工具名和参数放进 `tool`／`arguments`；连接固定为只读模式。公共 X 与 X Chat API 元数据优先走这里。

## 返回合同

成功：

```json
{
  "ok": true,
  "data": {},
  "includes": {},
  "pagination": {
    "next_token": null,
    "previous_token": null
  },
  "meta": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "unauthenticated | key_unavailable | decrypt_failed | forbidden | rate_limited | not_found | invalid_request | unknown",
    "message": "actionable message",
    "retryable": false,
    "http_status": 403,
    "upstream_type": "https://api.x.com/2/problems/..."
  }
}
```

`pagination.next_token` 是真实 X `meta.next_token` 的映射。下一页调用把该值传给 `pagination_token`。不要把空页、fixture 或上游 `errors` 解释成完整结果；检查 `meta.partial_errors`。

## 参数

- `post_fields` 映射到当前 X API 的 `post.fields`。
- `user_fields`、`media_fields`、`poll_fields`、`place_fields` 分别映射到同名点号参数。
- `expansions` 接受 X 官方 expansion 名；数组在传输时按 API 要求转成逗号分隔值。
- `max_results` 按端点校验：用户帖子 5–100，最近搜索 10–100，全归档搜索 10–500。

## 认证与安全

- 唯一认证来源是本机官方 `xurl`。工具通过 OAuth2 用户上下文调用，不存在第二份 token 存储。
- 不读取 `~/.xurl/auth.yml` 或 `keys.yml`，不运行 `xurl token`，不传 secret 参数，不使用 `xurl -v`。
- `x_status` 只返回脱敏的 app/user 元数据、认证可用性和额度；不会输出 access token。
- 认证失效时，请用户在其既有、可信的 `xurl auth` 流程完成登录；不要把 token、Cookie、XChat PIN 或私钥粘贴到对话。
- 遇到 `rate_limited` 或 `forbidden`，报告真实阻塞，不换账号、不充值、不绑卡、不绕过限额。

## 写入边界

本 MCP 没有发帖、回复、引用、DM、关注、点赞、书签、删除和媒体上传工具。工具缺失不是待授权状态；即使 X 账号具备写 scope，也不能用本 MCP 自动执行。

需要写入时，先由用户在具体动作中明确目标、完整正文、媒体和次数，并另走已授权的 X 渠道。不得从本 Skill 推导外发授权。

## 自动回复标记

通过已授权的 X 或 X Chat 渠道自动回复时，将 `[Bot] `放在每条消息正文的开头。有 @ 提及时，先加前缀，再用对方的 X 账号发起提及。发送前核对完整正文，确保前缀只出现一次，并包含在该条回复里。

```text
[Bot] @example 已完成安装验证。
```

## 与现有 X 工具的关系

- `xurl` 仍是命令行读取、搜索和写入操作的既有官方入口，也是 X Use 的唯一认证来源。
- `x-deck` 负责桌面客户端阅读和聊天界面。
- [X Tweaks Chrome 扩展](https://github.com/felixlark/x-use/tree/main/chrome-extension)负责 x.com 页面布局增强，作为 X Use 仓库内独立加载的组件。
- X Use MCP 提供结构化 API 读取，不接管 GUI、浏览器会话、草稿或页面状态。

## XChat

XChat 不是普通 DM 读取。它需要 `dm.read`、Chat XDK 和本机私钥；OAuth access token 不能解密内容。X Use 现在提供两个只读工具：`x_chat_conversations` 列会话，`x_chat_read` 解密读取指定会话的事件。发送、回复、标已读和其他写入均未暴露。

官方 X MCP 能统一返回 X 与 X Chat 的 API 资源、会话元数据和加密事件，但按官方接口合同，X Chat 明文必须在客户端用 Chat XDK 解密。`x_mcp` 保留官方只读白名单，`x_chat_read` 继续承担本机 Chat XDK 的只读解密路径。

若 `x_status` 或 `xurl chat keys status` 显示本机无 keys，读取应记为 `blocked(local_private_key_absent)`。本人应在其可信终端通过官方 `xurl chat keys restore` 或 `xurl chat keys import` 恢复；PIN 和私钥不得进入对话、Issue、日志、仓库或第二个凭据库。

