/* 翻译词库命中率测试：node test_translator.js */
global.window = {};
require("C:/Users/lmy34/Desktop/A/flingtrainer-crawler/site/assets/js/translator.js");
var TR = window.FLING_TRANSLATOR;
var fs = require("fs");
var src = fs.readFileSync("C:/Users/lmy34/Desktop/A/flingtrainer-crawler/site/assets/js/data.js", "utf8");
var data = JSON.parse(src.slice(src.indexOf("window.FLING_DATA = ") + 20, src.lastIndexOf(";")));

var total = 0, hit = 0, miss = [];
data.records.forEach(function (r) {
  (r.options || []).forEach(function (o) {
    total++;
    var zh = TR.option(o.t);
    if (zh) hit++;
    else miss.push(o.t);
  });
});
console.log("total:", total, "hit:", hit, "rate:", (hit / total * 100).toFixed(1) + "%");
console.log("--- 未命中样例（保留英文，共 " + miss.length + " 条）---");
miss.slice(0, 40).forEach(function (m) { console.log("  " + m); });
console.log("--- 译文样例 ---");
var samples = 0;
data.records.forEach(function (r) {
  (r.options || []).forEach(function (o) {
    if (samples < 18) {
      var zh = TR.option(o.t);
      if (zh && zh !== o.t) { console.log("  " + o.t + "  =>  " + zh); samples++; }
    }
  });
});
