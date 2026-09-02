# 知一刻 · MCP、Skill 与 RSS

知一刻的公开只读接入仓库。这里提供 MCP 服务源码、可安装 Skill，以及 RSS 备用镜像。

## 正式入口

- 网站：https://zhiyike.cn/
- MCP：https://zhiyike.cn/mcp
- Skill 安装说明：https://zhiyike.cn/skills/install.html
- RSS：https://zhiyike.cn/rss.xml

正式 MCP 和 RSS 由知一刻服务器持续运行。本仓库不保存新闻数据库、内部审核记录、模型配置、服务器配置或密钥。

## 目录

- `mcp/`：只读 Streamable HTTP MCP 的公开源码及本地示例数据。
- `skill/zhiyike-reader/`：Skill 源码。
- `skill/download/`：与知一刻安装页一致的 Skill 安装包和校验清单。
- `rss.xml`：RSS 备用副本，由 GitHub Actions 每 15 分钟尝试从正式地址同步。

## 使用边界

MCP 和 Skill 只读取知一刻已经公开的内容，不读取收藏、内部记录或密钥，也不会触发模型调用。RSS 的 GitHub 副本属于备用镜像，GitHub 的定时任务可能延迟；订阅时优先使用正式 RSS 地址。

本仓库公开不代表 GitHub 能替代正在运行的 MCP 服务器。GitHub 负责保存与分发，正式 MCP 仍由 `zhiyike.cn` 提供。
