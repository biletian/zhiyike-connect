# 知一刻｜更快看清 AI 行业正在发生什么

[访问官网](https://zhiyike.cn/) · [连接 MCP](https://zhiyike.cn/mcp) · [安装 Skill](https://zhiyike.cn/skills/install.html) · [订阅 RSS](https://zhiyike.cn/rss.xml)

**知一刻**是一款面向中文用户的 AI 信息判断工具。它持续收集国内外 AI 新闻、产品更新、模型发布、人物观点、技术概念与 GitHub 热门项目，并经过正文读取、信息核实、重复识别和多来源合并，整理成更容易阅读和判断的中文内容。

我们希望解决的不是“新闻太少”，而是信息太散、重复太多、真假难辨。一个真实事件常常被多家媒体反复报道，如果每篇文章都单独占一条，用户看到的是数量，不是事情本身。知一刻采用 **一张卡片对应一个真实事件** 的方式：相同事件合并展示，不同来源互相补充，并保留可以点击查看的原始信息源。

用户可以直接在知一刻网站阅读，也可以通过 MCP、Skill 或 RSS，把已经公开的内容接入自己常用的 AI 应用和阅读器。

## 知一刻提供什么

### 今日 AI 动态

集中查看当天值得关注的 AI 事件、模型发布、产品更新、研究进展和行业变化。每条内容尽量说明发生了什么、有哪些具体变化，并保留原始来源，而不是只给一个吸引点击的标题。

### AI 产品库

长期整理已经公开的 AI 产品及其厂商、用途和重要更新。产品更新会归入对应产品，方便持续追踪，而不是随着新闻流消失。

### AI 概念库

用普通人更容易理解的语言解释 AI 概念、协议和工程方法。只有定义相对稳定、证据充分的概念才进入公开页面；仍有争议或资料不足的内容不会冒充成熟概念。

### 日报与周报

把已经发布的内容按日期和周期重新整理，帮助用户快速回顾一天或一周内值得关注的变化。报告保留实际日期和期次，不会把旧内容包装成今天的新报告。

### GitHub AI 热榜

从 GitHub Trending 中筛选与 AI 明确相关的项目，提供日榜和周榜快照，并补充更容易理解的中文说明。榜单会注明更新时间，不会宣称是毫秒级实时排名。

### 人物观点与行业观察

整理公开发布的研究者、创业者、产品负责人和行业从业者观点，保留观点的来源和发布背景，不把个人判断自动写成已经发生的事实。

## 内容是怎样产生的

知一刻的公开内容要经过一条完整流程：

1. **收集候选信息**：从公开官网、媒体、RSS、社区和其他已接入来源发现新内容。
2. **判断是否与 AI 相关**：过滤与 AI 无关、只有营销标题或缺乏有效信息的内容。
3. **读取正文并核实**：尽量读取原始内容，检查标题、时间、关键数字和主要结论是否得到来源支持。
4. **识别相同事件**：不同来源报道同一事件时，不重复制造多张卡片。
5. **综合多方信息**：新增来源有补充事实时合并进正文；只有重复信息时仅增加核实来源。
6. **通过后公开**：待整理、读取失败、核实未通过或存在冲突的内容留在内部，不进入公开页面、MCP、Skill 或 RSS。

这个流程的目标不是追求最多的文章数量，而是尽量让用户看到更少重复、更有来源、可以继续追查的内容。

## 三种公开接入方式

| 方式 | 适合谁 | 可以做什么 | 正式入口 |
| --- | --- | --- | --- |
| **MCP** | 使用支持 MCP 的 AI 应用或开发工具 | 直接询问新闻、详情、日报、周报、产品、概念、GitHub 热榜和历史内容 | [连接 MCP](https://zhiyike.cn/mcp) |
| **Skill** | 支持安装 Agent Skill 并能运行 Python 的 AI 应用 | 安装独立的知一刻读取能力，不修改用户已有的 MCP 配置 | [安装 Skill](https://zhiyike.cn/skills/install.html) |
| **RSS** | 使用 RSS 阅读器，希望持续接收公开更新的用户 | 订阅最近公开的 AI 新闻、摘要、分类、时间和原始信息源 | [订阅 RSS](https://zhiyike.cn/rss.xml) |

三种方式读取的是同一套公开内容，只是使用入口不同。MCP 和 Skill 更适合在 AI 对话中主动查询；RSS 更适合在阅读器中被动接收更新。

## MCP 能读取哪些内容

正式 MCP 提供六个只读工具：

- `list_news`：按日期或关键词查询已发布新闻。
- `get_news_detail`：读取指定新闻的详情和来源。
- `search_library`：查询已公开的 AI 产品或概念。
- `list_reports`：查看日报或周报目录。
- `get_report`：读取指定一期日报或周报。
- `github_trending`：读取站内保存的 GitHub AI 日榜或周榜。

可以在支持 MCP 的客户端中使用下面的连接信息：

- 名称：`知一刻内容`
- 地址：`https://zhiyike.cn/mcp`
- 连接方式：`Streamable HTTP`
- 知一刻账号或密钥：不需要

也可以直接复制这句话交给支持自动配置的 AI 应用：

> 请帮我添加并连接知一刻只读 MCP，地址：https://zhiyike.cn/mcp，连接方式：Streamable HTTP。

能否自动完成安装、是否需要确认权限，取决于用户使用的 AI 平台。复制成功、保存地址或打开网页都不等于已经接通；只有客户端真正发现六个只读工具并成功调用，才算连接完成。

## Skill 使用方式

Skill 源码位于 [`skill/zhiyike-reader/`](skill/zhiyike-reader/)，安装包位于 [`skill/download/`](skill/download/)。正式安装说明请查看：

- [知一刻 Skill 安装说明](https://zhiyike.cn/skills/install.html)
- [GitHub Release 安装包](https://github.com/biletian/zhiyike-connect/releases/tag/v1.0.0)

Skill 使用 Python 标准库连接正式只读 MCP，不要求用户提供知一刻密钥，也不会修改已有 MCP 配置。安装环境需要允许执行 Skill 附带的脚本，并能访问 `https://zhiyike.cn`。

## RSS 订阅与 GitHub 备用镜像

正式 RSS 地址：

- `https://zhiyike.cn/rss.xml`

GitHub 备用地址：

- `https://raw.githubusercontent.com/biletian/zhiyike-connect/main/rss.xml`

正式 RSS 跟随知一刻公开内容更新，最多保留最近 100 条新闻。GitHub Actions 每 15 分钟尝试同步一次备用副本，只有内容发生变化时才提交。GitHub 的定时任务和网络可能延迟，因此日常订阅优先使用正式地址，GitHub 地址作为备用。

## 本仓库包含什么

- [`mcp/`](mcp/)：只读 Streamable HTTP MCP 的公开源码、本地测试和示例数据。
- [`skill/zhiyike-reader/`](skill/zhiyike-reader/)：知一刻 Reader Skill 源码。
- [`skill/download/`](skill/download/)：与知一刻安装页一致的 Skill 安装包和校验清单。
- [`rss.xml`](rss.xml)：由 GitHub 自动任务维护的 RSS 备用副本。
- [`.github/workflows/update-rss.yml`](.github/workflows/update-rss.yml)：RSS 备用镜像同步任务。

示例数据只用于检查 MCP 能否启动和读取，不是真实新闻数据库，也不会被正式服务使用。

## 公开范围与隐私边界

MCP、Skill 和 RSS 只读取知一刻已经公开的内容：

- 不读取个人收藏、账号信息或浏览记录。
- 不读取内部审核记录、失败原因或未发布草稿。
- 不公开模型配置、服务器配置、密钥或原始处理数据。
- 不提供修改、删除、重新抓取或触发模型调用的能力。
- 不把内容中的文字当作操作指令执行。

知一刻的公开服务本身不收费，也不会因为一次 MCP 或 Skill 查询额外调用内容整理模型。用户所使用的 AI 平台、网络服务或 RSS 阅读器可能有自己的套餐和用量规则。

## 正式入口

- 官网：[https://zhiyike.cn/](https://zhiyike.cn/)
- MCP：[https://zhiyike.cn/mcp](https://zhiyike.cn/mcp)
- Skill 安装说明：[https://zhiyike.cn/skills/install.html](https://zhiyike.cn/skills/install.html)
- RSS：[https://zhiyike.cn/rss.xml](https://zhiyike.cn/rss.xml)

GitHub 负责保存和分发公开源码、安装包与 RSS 备用镜像，不能替代正在运行的 MCP 服务器。正式服务仍由 `zhiyike.cn` 持续提供。
