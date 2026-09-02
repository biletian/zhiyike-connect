#!/usr/bin/env python3
"""Read published Zhiyike content. Python 3.10+, standard library only."""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

ENDPOINT = "https://zhiyike.cn/mcp"
VERSION = "1.0.0"
PROTOCOLS = ("2025-11-25", "2025-06-18", "2025-03-26")
TOOLS = frozenset(("list_news", "get_news_detail", "search_library", "list_reports", "get_report", "github_trending"))
MAX_BYTES = 4 * 1024 * 1024


class ReadError(Exception):
    """Safe error for display; never includes headers or system configuration."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ReadError("服务地址发生跳转，已停止读取。请从知一刻官网检查技能更新。")


def request_json(payload: dict, protocol: str | None) -> dict | None:
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
               "User-Agent": f"zhiyike-reader/{VERSION}"}
    if protocol:
        headers["MCP-Protocol-Version"] = protocol
    request = Request(ENDPOINT, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    opener = build_opener(NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(request, timeout=15) as response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ReadError("返回内容过大，已停止读取。请减少每页数量。")
            if "id" not in payload and response.status in (202, 204) and not raw:
                return None
            if response.headers.get_content_type() != "application/json":
                raise ReadError("服务没有返回可识别的内容，不能把网页或错误页面当作查询结果。")
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise ReadError("服务返回格式不正确，请稍后重试。")
            return result
    except HTTPError as error:
        if error.code == 429:
            raise ReadError("查询过于频繁，请至少一分钟后再试。") from None
        if error.code in (401, 403):
            raise ReadError("当前环境的访问未获允许。请检查应用网络权限，不要关闭安全检查。") from None
        raise ReadError(f"内容服务暂时无法读取（HTTP {error.code}），这不代表没有内容。") from None
    except (URLError, TimeoutError, OSError):
        raise ReadError("无法安全连接知一刻，请检查网络与证书信任后再试，不要跳过证书验证。") from None
    except (ValueError, UnicodeError):
        raise ReadError("服务返回的内容无法解析，请稍后重试。") from None


class Client:
    def __init__(self, transport=request_json):
        self.transport = transport
        self.protocol = None
        self.serial = 0
        self.connected = False

    def _rpc(self, method: str, params: dict | None = None) -> dict:
        self.serial += 1
        payload = {"jsonrpc": "2.0", "id": self.serial, "method": method}
        if params is not None:
            payload["params"] = params
        answer = self.transport(payload, self.protocol)
        if not isinstance(answer, dict) or answer.get("jsonrpc") != "2.0" or answer.get("id") != self.serial:
            raise ReadError("服务响应与本次查询不匹配，已停止读取。")
        if "error" in answer or not isinstance(answer.get("result"), dict):
            raise ReadError("服务未能完成本次请求，请检查查询条件或稍后再试。")
        return answer["result"]

    def connect(self) -> dict:
        self.connected = False
        self.protocol = None
        result = self._rpc("initialize", {
            "protocolVersion": PROTOCOLS[0], "capabilities": {},
            "clientInfo": {"name": "zhiyike-reader-skill", "version": VERSION},
        })
        if result.get("protocolVersion") not in PROTOCOLS:
            raise ReadError("服务使用的连接版本尚未经过本技能验证，请检查技能更新。")
        if not isinstance(result.get("serverInfo"), dict) or result["serverInfo"].get("name") != "zhiyike":
            raise ReadError("无法确认这是知一刻内容服务，已停止读取。")
        self.protocol = result["protocolVersion"]
        notification = self.transport({"jsonrpc": "2.0", "method": "notifications/initialized"}, self.protocol)
        if notification is not None:
            raise ReadError("服务没有正确确认连接，请稍后再试。")
        discovered = self._rpc("tools/list")
        tools = discovered.get("tools")
        if not isinstance(tools, list) or discovered.get("nextCursor"):
            raise ReadError("工具列表不完整，无法确认读取能力。")
        by_name = {tool.get("name"): tool for tool in tools if isinstance(tool, dict) and isinstance(tool.get("name"), str)}
        for name in TOOLS:
            tool = by_name.get(name, {})
            annotations = tool.get("annotations", {})
            if not isinstance(annotations, dict) or annotations.get("readOnlyHint") is not True or annotations.get("destructiveHint") is not False:
                raise ReadError("缺少必要的只读工具或只读声明，已停止读取。")
        self.connected = True
        return {"status": "service_connected", "contentRead": False, "service": "知一刻",
                "protocolVersion": self.protocol, "tools": sorted(TOOLS),
                "message": "已发现六个只读工具；尚未查询内容，也不代表 AI 应用已加载此技能。"}

    def call(self, name: str, arguments: dict) -> dict:
        if name not in TOOLS:
            raise ReadError("此技能只允许六个公开内容读取工具。")
        if not self.connected:
            self.connect()
        result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError"):
            raise ReadError("内容查询失败，请核对日期、编号或查询条件；不要将失败解释为没有内容。")
        value = result.get("structuredContent")
        if not isinstance(value, dict):
            raise ReadError("查询没有返回完整的公开数据，已停止读取。")
        return value


def bounded(low: int, high: int):
    def parse(value: str) -> int:
        try:
            number = int(value)
        except ValueError:
            raise argparse.ArgumentTypeError("请输入整数。") from None
        if not low <= number <= high:
            raise argparse.ArgumentTypeError(f"请输入 {low} 到 {high} 之间的整数。")
        return number
    return parse


def news_date(value: str) -> str:
    normalized = value.replace(".", "-")
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", normalized):
            raise ValueError
        return date.fromisoformat(normalized).isoformat()
    except ValueError:
        raise argparse.ArgumentTypeError("日期须为真实存在的 YYYY-MM-DD。") from None


def query_text(value: str) -> str:
    if len(value) > 160:
        raise argparse.ArgumentTypeError("关键词请控制在 160 字以内。")
    return value


def command_args(argv=None):
    parser = argparse.ArgumentParser(description="查询知一刻已发布内容；不修改网站，不调用其他模型。")
    parser.add_argument("--version", action="version", version=VERSION)
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("check", help="检查服务及六工具，不查询内容")
    news = subs.add_parser("news", help="查询新闻，默认北京时间今天")
    news.add_argument("--date", type=news_date)
    news.add_argument("--query", type=query_text)
    detail = subs.add_parser("detail", help="使用新闻查询返回的编号读取详情")
    detail.add_argument("id")
    library = subs.add_parser("library", help="产品或概念")
    library.add_argument("kind", choices=("products", "concepts"))
    library.add_argument("--query", type=query_text)
    paginated = [news, library]
    for command in ("reports", "report", "github"):
        sub = subs.add_parser(command, help={"reports": "报告目录", "report": "报告正文", "github": "GitHub 榜单"}[command])
        sub.add_argument("period", choices=("daily", "weekly"))
        if command == "report":
            sub.add_argument("--date", help="日报 YYYY-MM-DD，周报 YYYY-Www；省略取最新一期")
        paginated.append(sub)
    for sub in paginated:
        sub.add_argument("--limit", type=bounded(1, 20), default=10)
        sub.add_argument("--offset", type=bounded(0, 100000), default=0)
    parsed = vars(parser.parse_args(argv))
    command = parsed.pop("command")
    if command == "detail" and not re.fullmatch(r"news-[a-f0-9]{24}", parsed["id"]):
        parser.error("新闻编号须使用 news 查询实际返回的 id。")
    if command == "report" and parsed.get("date"):
        value = parsed["date"]
        if parsed["period"] == "daily":
            try:
                parsed["date"] = news_date(value)
            except argparse.ArgumentTypeError as error:
                parser.error(str(error))
        else:
            try:
                if not re.fullmatch(r"\d{4}-W\d{2}", value):
                    raise ValueError
                year, week = value.split("-W")
                date.fromisocalendar(int(year), int(week), 1)
            except ValueError:
                parser.error("周报期次须为真实存在的 YYYY-Www，请先查询 reports weekly。")
    return command, {key: value for key, value in parsed.items() if value is not None}


def main(argv=None) -> int:
    command, arguments = command_args(argv)
    mapping = {"news": "list_news", "detail": "get_news_detail", "library": "search_library",
               "reports": "list_reports", "report": "get_report", "github": "github_trending"}
    try:
        client = Client()
        result = client.connect() if command == "check" else client.call(mapping[command], arguments)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ReadError as error:
        print(f"读取未完成：{error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("查询已取消。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
