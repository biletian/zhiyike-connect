# 更新日志

## 1.2.3（交测，未上线）

- **Codex 日报/列表配图（方案 B 缩小版，基于 A1）**：`get_report` / `list_news` 对前若干条（默认最多 8）有 cover 的条目附缩略图 MCP `image`（边长 ≤480、单张约 ≤100KB；整次全部 image 合计约 ≤800KB，超出截断并在 text 注明其余仅 Markdown 外链）。
- 有 image 时省略 `structuredContent`（与 v1.2.2 A1 一致，含日报/列表）；无 image 仍双通道。详情 `get_news_detail` 仍用较大图上限（约 350KB），不回归。
- 加载/压缩失败降级为仅 Markdown，不挡主结果。不做 ChatGPT widget，不改站点前端。
- Skill / instructions：补充日报/列表有缩略图时同样可能省略 structuredContent。
- 版本号统一 **1.2.3**。

## 1.2.2

- **Codex 配图适配（方案 A1）**：仅当本次结果含至少一块 MCP `image` 时省略 `structuredContent`，只返回 `content[]`（Markdown text + image）；无 image 时仍双通道（与 v1.2.1 一致）。根因：Codex 有 `structuredContent` 会丢弃整段 `content[]`（openai/codex#10334）。
- 封面仍为站内原配图→base64，不生图；压缩上限维持约 350KB；列表/日报不加缩略图 base64。
- Skill / instructions：补充「有图详情在部分宿主会省略 structuredContent」。
- 版本号统一 **1.2.2**。

## 1.2.1（交测，未上线）

- `list_news` / `get_news_detail` / `get_report`：保留 `structuredContent` JSON；**text 通道改为已排版可读 Markdown**（含有 cover 时的 `![标题](cover.url)` 与图源说明，规则与既有 instructions / Skill 一致）。
- `get_news_detail`：有 cover 时额外尝试返回 MCP **image** 内容块（优先读数据目录下 `media/`，否则短超时拉站内绝对 URL；超体积则压缩，失败则降级只保留 Markdown 外链，不挡主结果）。
- Skill：`SKILL.md` 补充「服务端 text 已带排版 Markdown / 详情可能带 image 块」说明；版本号统一 **1.2.1**。
- 回归：无 heat；排除来源兜底过滤不变。

## 1.2.0

- 版本号统一；去掉热度按发布时间排序；来源名整理；空字段/空数组不输出；浏览器打开 `/mcp` 中文说明页；封面图 `cover`；排除来源兜底过滤。
