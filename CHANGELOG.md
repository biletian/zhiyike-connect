# 更新日志

## 1.2.1（交测，未上线）

- `list_news` / `get_news_detail` / `get_report`：保留 `structuredContent` JSON；**text 通道改为已排版可读 Markdown**（含有 cover 时的 `![标题](cover.url)` 与图源说明，规则与既有 instructions / Skill 一致）。
- `get_news_detail`：有 cover 时额外尝试返回 MCP **image** 内容块（优先读数据目录下 `media/`，否则短超时拉站内绝对 URL；超体积则压缩，失败则降级只保留 Markdown 外链，不挡主结果）。
- Skill：`SKILL.md` 补充「服务端 text 已带排版 Markdown / 详情可能带 image 块」说明；版本号统一 **1.2.1**。
- 回归：无 heat；排除来源兜底过滤不变。

## 1.2.0

- 版本号统一；去掉热度按发布时间排序；来源名整理；空字段/空数组不输出；浏览器打开 `/mcp` 中文说明页；封面图 `cover`；排除来源兜底过滤。
