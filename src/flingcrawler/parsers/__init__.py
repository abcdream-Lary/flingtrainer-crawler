"""页面解析器：只做 HTML -> 结构化数据，不做任何网络请求。"""

from .listing import discover_detail_urls, extract_detail_links
from .detail import parse_detail

__all__ = ["discover_detail_urls", "extract_detail_links", "parse_detail"]
