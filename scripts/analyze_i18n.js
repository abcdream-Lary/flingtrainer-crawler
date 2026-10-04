/* 汉化缺口分析：node scripts/analyze_i18n.js
 * 输出：选项命中率 + 未命中短语频次榜 + 缺译游戏名清单
 */
global.window = {};
var fs = require("fs");
var ROOT = "C:/Users/lmy34/Desktop/A/flingtrainer-crawler";

require(ROOT + "/site/assets/js/translator.js");
require(ROOT + "/site/assets/js/catalog.js");
var TR = window.FLING_TRANSLATOR;
var CATALOG = window.FLING_CATALOG;

var src = fs.readFileSync(ROOT + "/site/assets/js/data.js", "utf8");
var DATA = JSON.parse(src.slice(src.indexOf("window.FLING_DATA = ") + 20, src.lastIndexOf(";")));
var recs = DATA.records;

/* ---------- 选项 ---------- */
var total = 0, hit = 0;
var missCount = {}, missSample = {};
var KEY = /^(?:(?:L?Ctrl|L?Alt|L?Shift|\w+)\+\s*)*(?:Num(?:pad)?\s*[.+\-–—/]?\d*(?:\s*[-–—]\s*\d+)?|F\d{1,2}|Numpad\s*\d+)\s*[–—-]\s*/i;
recs.forEach(function (r) {
  (r.options || []).forEach(function (o) {
    total++;
    if (TR.option(o.t)) { hit++; return; }
    var body = (o.t || "").replace(KEY, "").trim() || o.t;
    missCount[body] = (missCount[body] || 0) + 1;
    if (!missSample[body]) missSample[body] = r.slug;
  });
});
console.log("选项总数:", total, "| 命中:", hit, "| 命中率:", (hit / total * 100).toFixed(1) + "%");
console.log("未命中唯一短语数:", Object.keys(missCount).length);

var top = Object.keys(missCount).sort(function (a, b) { return missCount[b] - missCount[a]; });
console.log("\n=== 未命中短语 TOP 120（频次 | 短语 | 样例游戏）===");
top.slice(0, 120).forEach(function (k) {
  console.log(String(missCount[k]).padStart(4) + "  " + k + "   [" + missSample[k] + "]");
});

/* ---------- 游戏名 ---------- */
var lack = recs.filter(function (r) { return !(CATALOG.entries[r.slug] && CATALOG.entries[r.slug].zh); });
console.log("\n游戏名缺译:", lack.length, "/", recs.length);
var byCat = {};
lack.forEach(function (r) {
  var e = CATALOG.entries[r.slug];
  var c = (e && e.cat) || "(无分类)";
  byCat[c] = (byCat[c] || 0) + 1;
});
console.log("缺译游戏分类分布:", JSON.stringify(byCat, null, 0));
console.log("\n=== 缺译游戏名 TOP 60（按名称）===");
lack.slice(0, 60).forEach(function (r) { console.log("  " + r.slug + "  |  " + r.name); });
