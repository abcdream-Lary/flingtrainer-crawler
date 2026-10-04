/* 风灵图鉴 · 展示逻辑（纯前端，无构建、无依赖）
 * 数据：window.FLING_DATA（scripts/build_web_data.py 生成）
 * 汉化：window.FLING_CATALOG（游戏名）/ window.FLING_TRANSLATOR（选项短语）
 * 路由：列表 = ?q=&cat=&tag=&sort= ；详情子页 = #/t/<slug>
 */
(function () {
  "use strict";

  var DATA = window.FLING_DATA || null;
  var CATALOG = window.FLING_CATALOG || { categories: [], entries: {} };
  var I18N = window.FLING_I18N || { zh: {}, en: {} };
  var TR = window.FLING_TRANSLATOR || { option: function () { return null; } };
  var PER_OPTIONS = [24, 32, 52];
  var ORIGIN = "https://flingtrainer.com";
  var IMG_PROXY = "https://wsrv.nl/?url=";   // 加载失败的图片代理兜底

  /* ---------------- state ---------------- */
  var state = {
    lang: localStorage.getItem("fling.lang") || "zh",
    theme: localStorage.getItem("fling.theme") || "light",
    q: "", cat: "__all__", tag: "__all__", sort: "recent",
    view: "gallery",
    page: 1, per: 24,
    filtered: [],
    detailSlug: null, listScroll: 0,
    lbList: [], lbIndex: -1,
    cameFromList: false
  };

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function t(key, vars) {
    var s = (I18N[state.lang] && I18N[state.lang][key]) || (I18N.zh[key] || key);
    if (vars) Object.keys(vars).forEach(function (k) {
      s = s.replace("{" + k + "}", vars[k]);
    });
    return s;
  }
  function entryOf(rec) { return CATALOG.entries[rec.slug] || null; }
  function zhName(rec) { var e = entryOf(rec); return (e && e.zh) || ""; }
  function catOf(rec) {
    var e = entryOf(rec);
    return (e && e.cat) || t("unmatchedCat");
  }
  function catLabel(cat) {
    if (state.lang === "en" && CATALOG.categoryEn && CATALOG.categoryEn[cat]) return CATALOG.categoryEn[cat];
    return cat;
  }
  function tagLabel(tag) {
    if (state.lang === "en" && CATALOG.tagEn && CATALOG.tagEn[tag]) return CATALOG.tagEn[tag];
    return tag;
  }
  function tagsOf(rec) { var e = entryOf(rec); return (e && e.tags) || []; }
  function primaryName(rec) {
    if (state.lang === "zh") return zhName(rec) || rec.name;
    return rec.name;
  }
  function secondaryName(rec) {
    if (state.lang === "zh") return zhName(rec) ? rec.name : "";
    return zhName(rec);
  }
  function shotUrl(rec, i) {
    var s = (rec.screenshots || [])[i || 0];
    if (!s) return "";
    return typeof s === "string" ? s : (s.original_url || s.url || "");
  }
  /* 卡片/大图优先用封面图（og:image），缺省回退正文截图 */
  function coverOf(rec) {
    return rec.cover || shotUrl(rec, 0) || "";
  }
  /* lightbox 图集：封面图在前，随后是正文截图 */
  function galleryOf(rec) {
    var list = [];
    if (rec.cover) list.push(rec.cover);
    (rec.screenshots || []).forEach(function (s) {
      var u = typeof s === "string" ? s : (s.original_url || s.url || "");
      if (u && list.indexOf(u) === -1) list.push(u);
    });
    return list;
  }
  function optText(o) {
    var raw = o.t || "";
    if (state.lang !== "zh") return raw;
    var zh = TR.option(raw);
    return zh || raw;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function debounce(fn, ms) {
    var timer;
    return function () {
      var a = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function num(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  /* ISO 时间 → 本地时区 "YYYY-MM-DD HH:MM:SS" */
  function fmtTs(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function hotkeyOf(text) {
    var m = /^(Num(?:pad)?\s*\.?\s*\d|Ctrl\+Num[^–—-]*|Alt\+Num[^–—-]*|Shift\+Num[^–—-]*|F\d{1,2}|Numpad\s*\d)/i.exec(text || "");
    if (m) return m[1];
    m = /^(Ctrl|Alt|Shift)\+[^\s–—-]+/i.exec(text || "");
    return m ? m[1] + "+" : "";
  }

  /* 源站对新版文件做 Referer 子串校验：Referer 必须包含 "flingtrainer.com"。
   * 策略：页面 URL 固定带 ?ref=flingtrainer.com，下载链接用 unsafe-url 发送完整
   * Referer（跨源默认只发 origin，会缺路径与查询串），从而一键直下可用。
   */
  var REF_TAG = "flingtrainer.com";
  function ensureRef() {
    var p = new URLSearchParams(location.search);
    if (p.get("ref") === REF_TAG) return;
    p.set("ref", REF_TAG);
    history.replaceState(null, "", location.pathname + "?" + p.toString() + (location.hash || ""));
  }
  function dlAnchor(href, cls, text) {
    var a = el("a", cls, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.referrerPolicy = "unsafe-url"; // 关键：跨源也发送完整 URL（含 ?ref=flingtrainer.com）
    a.title = t("dlTip");
    return a;
  }

  /* ---------------- 图片加载链：原图 → 代理 → 占位 ---------------- */
  function attachImg(img, src, onFail) {
    var triedProxy = false;
    function handler() {
      img.removeEventListener("error", handler);
      if (!triedProxy && /^https?:\/\//i.test(src)) {
        triedProxy = true;
        img.addEventListener("error", function () {
          if (onFail) onFail();
        });
        img.src = IMG_PROXY + encodeURIComponent(src) + "&w=960&output=webp&q=85";
      } else if (onFail) {
        onFail();
      }
    }
    img.addEventListener("error", handler);
    img.src = src;
  }
  function makeImg(src, alt, onFail) {
    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.alt = alt || "";
    attachImg(img, src, onFail);
    return img;
  }

  /* ---------------- 数据准备 ---------------- */
  var records = [];
  var bySlug = {};
  var tagIndex = {};

  function prepare() {
    records = (DATA && DATA.records) || [];
    records.forEach(function (r) {
      bySlug[r.slug] = r;
      tagsOf(r).forEach(function (tag) {
        tagIndex[tag] = (tagIndex[tag] || 0) + 1;
      });
    });
  }

  function buildFiltered() {
    var q = state.q.trim().toLowerCase();
    var out = records.filter(function (r) {
      if (state.cat !== "__all__" && catOf(r) !== state.cat) return false;
      if (state.tag !== "__all__" && tagsOf(r).indexOf(state.tag) === -1) return false;
      if (q) {
        var hay = [r.name, zhName(r), r.slug, optHaystack(r)].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var byDateDesc = function (a, b) { return (b.last_updated || "").localeCompare(a.last_updated || ""); };
    if (state.sort === "recent") out.sort(byDateDesc);
    else if (state.sort === "options") out.sort(function (a, b) { return (b.options_extracted || 0) - (a.options_extracted || 0); });
    else if (state.sort === "versions") out.sort(function (a, b) { return (b.downloads || []).length - (a.downloads || []).length; });
    else if (state.sort === "name") out.sort(function (a, b) {
      return (primaryName(a) || "").localeCompare(primaryName(b) || "", state.lang === "zh" ? "zh-Hans-CN" : "en");
    });
    return out;
  }
  function optHaystack(rec) {
    return (rec.options || []).map(function (o) { return o.t; }).join(" ");
  }

  /* ---------------- 静态文案 ---------------- */
  function renderStaticText() {
    document.documentElement.lang = t("htmlLang");
    document.body.dataset.lang = state.lang;
    document.body.dataset.theme = state.theme;

    $("brandName").textContent = t("brand");
    $("brandSub").textContent = t("brandSub");
    $("heroEyebrow").textContent = t("brandSub");
    $("heroTitle").innerHTML = "";
    var parts = t("heroTitle").split("·");
    if (parts.length > 1) {
      $("heroTitle").appendChild(el("span", null, parts[0].trim()));
      var em = el("em", null, "·" + parts.slice(1).join("·").trim());
      $("heroTitle").appendChild(em);
    } else {
      $("heroTitle").textContent = t("heroTitle");
    }
    $("heroLead").textContent = t("heroLead");
    $("catsTitle").textContent = t("catsTitle");
    $("tagsTitle").textContent = t("tagsTitle");
    Array.prototype.forEach.call(document.querySelectorAll(".nav-tab"), function (tab) {
      var key = tab.dataset.view === "cats" ? "tabCats" : "tabGallery";
      tab.textContent = t(key);
    });
    $("statGames").textContent = t("statGames");
    $("statOptions").textContent = t("statOptions");
    $("statVersions").textContent = t("statVersions");
    $("statUpdated").textContent = t("statUpdated");
    $("sortLabel").textContent = t("sortLabel");
    $("emptyTitle").textContent = t("emptyTitle");
    $("emptyLead").textContent = t("emptyLead");
    $("footerNote").textContent = t("footerNote");
    $("footerRobots").textContent = t("footerRobots");
    $("langToggle").textContent = t("langButton");
    $("browseCta").textContent = t("browseCta");
    $("perPageLabel").textContent = t("perPage");
    $("lbHint").textContent = t("lbHint");
    $("searchInput").placeholder = t("searchPlaceholder");
    $("searchInput").setAttribute("aria-label", t("searchPlaceholder"));

    var sortMap = { recent: "sortRecent", options: "sortOptions", versions: "sortVersions", name: "sortName" };
    Array.prototype.forEach.call($("sortSelect").options, function (opt) {
      if (sortMap[opt.value]) opt.textContent = t(sortMap[opt.value]);
    });

    if (DATA && DATA.stats) {
      var s = DATA.stats;
      setStat("statGames", num(s.games));
      setStat("statOptions", num(s.options));
      setStat("statVersions", num(s.downloads));
      // 最近更新 = 本站数据快照时间（精确到秒）；游戏自身更新日期源站只有日粒度
      setStat("statUpdated", fmtTs(DATA.generatedAt) || (s.last_updated || "—"));
    }
  }
  function setStat(id, value) {
    var dd = $(id).nextElementSibling;
    dd.textContent = "";
    dd.appendChild(document.createTextNode(value));
  }

  /* ---------------- 筛选 chips ---------------- */
  function renderCatChips() {
    var wrap = $("catChips");
    wrap.innerHTML = "";
    var counts = {};
    records.forEach(function (r) {
      var c = catOf(r);
      counts[c] = (counts[c] || 0) + 1;
    });
    var cats = (CATALOG.categories || []).filter(function (c) { return counts[c]; });
    if (counts[t("unmatchedCat")]) cats.push(t("unmatchedCat"));

    var all = el("button", "chip" + (state.cat === "__all__" ? " on" : ""), t("filterAll"));
    all.type = "button";
    all.setAttribute("aria-pressed", state.cat === "__all__");
    all.appendChild(el("span", "chip-n", records.length));
    all.addEventListener("click", function () { setCat("__all__"); });
    wrap.appendChild(all);

    cats.forEach(function (c) {
      var b = el("button", "chip" + (state.cat === c ? " on" : ""), catLabel(c));
      b.type = "button";
      b.setAttribute("aria-pressed", state.cat === c);
      b.appendChild(el("span", "chip-n", counts[c]));
      b.addEventListener("click", function () { setCat(c); });
      wrap.appendChild(b);
    });
  }

  function renderTagChips() {
    var wrap = $("tagChips");
    wrap.innerHTML = "";
    wrap.dataset.empty = t("filterTag");
    var tags = Object.keys(tagIndex).sort(function (a, b) { return tagIndex[b] - tagIndex[a]; });
    if (!tags.length) return;

    var all = el("button", "chip" + (state.tag === "__all__" ? " on" : ""), t("filterAll"));
    all.type = "button";
    all.setAttribute("aria-pressed", state.tag === "__all__");
    all.addEventListener("click", function () { setTag("__all__"); });
    wrap.appendChild(all);

    tags.forEach(function (tag) {
      var b = el("button", "chip" + (state.tag === tag ? " on" : ""), tagLabel(tag));
      b.type = "button";
      b.setAttribute("aria-pressed", state.tag === tag);
      b.appendChild(el("span", "chip-n", tagIndex[tag]));
      b.addEventListener("click", function () { setTag(tag); });
      wrap.appendChild(b);
    });
  }

  function setCat(c) { state.cat = c; syncUrl(); refresh(); }
  function setTag(tag) { state.tag = tag; syncUrl(); refresh(); }

  /* ---------------- 视图切换（图鉴 / 分类） ---------------- */
  function applyView() {
    Array.prototype.forEach.call(document.querySelectorAll(".nav-tab"), function (tab) {
      var on = tab.dataset.view === state.view;
      tab.classList.toggle("on", on);
      tab.setAttribute("aria-pressed", on);
    });
    $("heroSec").hidden = state.view === "cats";
    $("viewCats").hidden = state.view !== "cats";
  }
  function setView(v) {
    if (v !== "gallery" && v !== "cats") v = "gallery";
    if (state.view === v) return;
    state.view = v;
    applyView();
    syncUrl();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- 卡片 ---------------- */
  function cardNode(rec, delayIdx) {
    var card = el("article", "card");
    card.tabIndex = 0;
    card.style.animationDelay = Math.min(delayIdx * 26, 320) + "ms";
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", primaryName(rec));

    var media = el("div", "card-media");
    var shot = coverOf(rec);
    if (shot) {
      media.appendChild(makeImg(shot, primaryName(rec), function () {
        media.innerHTML = "";
        media.appendChild(fallbackMedia(rec));
      }));
    } else {
      media.appendChild(fallbackMedia(rec));
    }
    var flags = el("div", "card-flag");
    var latest = (rec.downloads || []).filter(function (d) { return d.latest; })[0];
    if (latest && latest.version) flags.appendChild(el("span", "flag latest", latest.version));
    if (rec.downloads.length > 1) flags.appendChild(el("span", "flag", "×" + rec.downloads.length));
    media.appendChild(flags);
    card.appendChild(media);

    var body = el("div", "card-body");
    body.appendChild(el("div", "card-name-zh", primaryName(rec)));
    var sub = secondaryName(rec);
    if (sub) body.appendChild(el("div", "card-name-en", sub));

    var tags = tagsOf(rec);
    if (tags.length) {
      var tw = el("div", "card-tags");
      tags.slice(0, 3).forEach(function (tag) { tw.appendChild(el("span", "mini-tag", tagLabel(tag))); });
      body.appendChild(tw);
    }

    var meta = el("div", "card-meta");
    addMeta(meta, t("cardVersion"), rec.version || "—");
    addMeta(meta, null, (rec.options_extracted || 0) + " " + t("cardOptions"));
    addMeta(meta, null, rec.downloads.length + " " + t("cardVersions"));
    addMeta(meta, t("cardUpdated"), rec.last_updated || t("cardNoDate"));
    body.appendChild(meta);
    card.appendChild(body);

    card.addEventListener("click", function () { openDetail(rec.slug); });
    card.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDetail(rec.slug); }
    });
    return card;
  }

  function addMeta(meta, key, val) {
    if (key) { var k = el("span", "k", key); meta.appendChild(k); }
    meta.appendChild(el("span", null, val));
  }

  function fallbackMedia(rec) {
    var fb = el("div", "card-fallback");
    fb.textContent = (primaryName(rec) || "?").trim().charAt(0).toUpperCase();
    return fb;
  }

  /* ---------------- 列表渲染（固定分页） ---------------- */
  function refresh() {
    state.filtered = buildFiltered();
    var pages = Math.max(1, Math.ceil(state.filtered.length / state.per));
    if (state.page > pages) state.page = pages;
    renderPage();
    renderCatChips();
    renderTagChips();
    syncUrl();
  }

  function renderPage() {
    var grid = $("grid");
    grid.innerHTML = "";
    var count = state.filtered.length;
    var start = (state.page - 1) * state.per;
    var slice = state.filtered.slice(start, start + state.per);
    slice.forEach(function (rec, i) {
      grid.appendChild(cardNode(rec, i));
    });

    $("resultCount").textContent = t("resultCount", { n: num(count) });
    $("empty").hidden = count !== 0;
    $("loadError").hidden = true;
    renderPager(count);
  }

  function pageList(total, current) {
    // 生成页码序列：首尾恒显，中间窗口，断点用 -1 占位（渲染为省略号）
    if (total <= 7) {
      var all = [];
      for (var i = 1; i <= total; i++) all.push(i);
      return all;
    }
    var set = [1, total, current, current - 1, current + 1];
    if (current <= 3) set = set.concat([2, 3, 4]);
    if (current >= total - 2) set = set.concat([total - 3, total - 2, total - 1]);
    var uniq = Array.from(new Set(set)).filter(function (p) { return p >= 1 && p <= total; });
    uniq.sort(function (a, b) { return a - b; });
    var out = [];
    uniq.forEach(function (p, idx) {
      if (idx && p - uniq[idx - 1] > 1) out.push(-1);
      out.push(p);
    });
    return out;
  }

  function renderPager(count) {
    var pager = $("pager");
    pager.innerHTML = "";
    var total = Math.max(1, Math.ceil(count / state.per));
    if (total <= 1) { pager.hidden = true; return; }
    pager.hidden = false;

    var prev = el("button", "pg-btn" + (state.page === 1 ? " dis" : ""), "‹");
    prev.type = "button";
    prev.disabled = state.page === 1;
    prev.setAttribute("aria-label", t("prevPage"));
    prev.addEventListener("click", function () { goToPage(state.page - 1); });
    pager.appendChild(prev);

    pageList(total, state.page).forEach(function (p) {
      if (p === -1) {
        pager.appendChild(el("span", "pg-dots", "…"));
        return;
      }
      var b = el("button", "pg-num" + (p === state.page ? " on" : ""), String(p));
      b.type = "button";
      if (p === state.page) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { goToPage(p); });
      pager.appendChild(b);
    });

    var next = el("button", "pg-btn" + (state.page === total ? " dis" : ""), "›");
    next.type = "button";
    next.disabled = state.page === total;
    next.setAttribute("aria-label", t("nextPage"));
    next.addEventListener("click", function () { goToPage(state.page + 1); });
    pager.appendChild(next);

    var info = el("span", "pg-info", t("pageOf", { a: state.page, b: total }));
    pager.appendChild(info);
  }

  function goToPage(p) {
    var total = Math.max(1, Math.ceil(state.filtered.length / state.per));
    var next = Math.min(Math.max(1, p), total);
    if (next === state.page) return;
    state.page = next;
    renderPage();
    syncUrl();
    var anchor = $("grid-top").getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: Math.max(0, anchor), behavior: "smooth" });
  }

  function setPer(n) {
    if (PER_OPTIONS.indexOf(n) === -1) n = 24;
    if (state.per === n) return;
    state.per = n;
    state.page = 1;
    renderPage();
    syncUrl();
  }

  /* ---------------- 详情子页 ---------------- */
  function openDetail(slug) {
    state.cameFromList = state.detailSlug == null;
    if (state.cameFromList) state.listScroll = window.scrollY;
    location.hash = "#/t/" + slug;
  }

  function goBack() {
    if (state.cameFromList && history.length > 1) history.back();
    else clearHash();
  }
  function clearHash() {
    history.replaceState(null, "", location.pathname + location.search);
    route(); // route 内部依据当前 detailSlug 恢复列表视图
  }

  function sectionTitle(text, n) {
    var h = el("h3", null, text);
    if (n != null) h.appendChild(el("span", "n", String(n)));
    return h;
  }

  function renderDetail(rec) {
    var root = $("detailView");
    root.innerHTML = "";
    var shell = el("div", "shell d-shell");

    /* 顶栏：返回 */
    var top = el("div", "d-top");
    var back = el("button", "d-back");
    back.type = "button";
    back.appendChild(el("span", "d-back-ico", "←"));
    back.appendChild(el("span", null, t("detailBack")));
    back.addEventListener("click", goBack);
    top.appendChild(back);
    shell.appendChild(top);

    /* 标题区 */
    var head = el("header", "d-head");
    head.appendChild(el("h1", "d-title", primaryName(rec)));
    var sub = secondaryName(rec);
    if (sub) head.appendChild(el("p", "d-sub", sub));
    var chips = el("div", "d-chips");
    var catB = el("span", "mini-tag", catLabel(catOf(rec)));
    chips.appendChild(catB);
    tagsOf(rec).slice(0, 4).forEach(function (tag) { chips.appendChild(el("span", "mini-tag", tagLabel(tag))); });
    head.appendChild(chips);
    shell.appendChild(head);

    /* Hero：大图 + 关键信息 */
    var hero = el("div", "d-hero");
    var shotWrap = el("figure", "d-shot-wrap");
    var shot = coverOf(rec);
    if (shot) {
      var dimg = makeImg(shot, primaryName(rec));
      dimg.classList.add("d-shot");
      dimg.addEventListener("click", function () { openLightbox(rec, 0); });
      shotWrap.appendChild(dimg);
      shotWrap.appendChild(el("figcaption", "d-shot-hint", "🔍 " + t("detailScreens")));
      shotWrap.classList.add("has-img");
    } else {
      shotWrap.appendChild(fallbackMedia(rec));
    }
    hero.appendChild(shotWrap);

    var side = el("div", "d-side");
    var latest = (rec.downloads || []).filter(function (d) { return d.latest; })[0] || rec.downloads[0];

    var facts = el("div", "d-facts");
    addBigFact(facts, t("detailLatestVer"), (latest && latest.version) || rec.version || "—");
    addBigFact(facts, t("detailGameUpdated"), rec.last_updated || t("cardNoDate"));
    addBigFact(facts, t("statOptions"), num(rec.options_extracted || 0));
    addBigFact(facts, t("statVersions"), num((rec.downloads || []).length));
    side.appendChild(facts);

    var actions = el("div", "d-actions");
    if (latest && latest.url) {
      actions.appendChild(dlAnchor(latest.url, "btn btn-primary d-dl", t("detailDownloadNow") + " ↓"));
    }
    var site = el("a", "btn btn-ghost", t("detailOpenSite") + " →");
    site.href = rec.url || (ORIGIN + "/trainer/" + rec.slug + "/");
    site.target = "_blank";
    site.rel = "noopener";
    actions.appendChild(site);
    side.appendChild(actions);

    var srcNote = el("p", "d-src", t("detailDataFrom") + " · " + (rec.url || ""));
    if (DATA && DATA.generatedAt) {
      srcNote.textContent += " · " + t("detailDataFetched") + " " + fmtTs(DATA.generatedAt);
    }
    side.appendChild(srcNote);
    hero.appendChild(side);
    shell.appendChild(hero);

    /* 功能选项（紧凑双列） */
    if (rec.options && rec.options.length) {
      var os = el("section", "d-section");
      os.appendChild(sectionTitle(t("detailOptions", { n: rec.options.length }), null));
      var list = el("div", "opt-grid");
      rec.options.forEach(function (o, i) {
        var item = el("div", "opt");
        var hk = hotkeyOf(o.t);
        item.appendChild(el("span", "opt-key", hk || String(i + 1)));
        // 正文 = 去掉热键前缀后的部分
        var rawBody = o.t || "";
        if (hk) rawBody = rawBody.slice(rawBody.indexOf(hk) + hk.length).replace(/^[\s–—-]+/, "");
        var zh = state.lang === "zh" ? TR.option(o.t) : null;
        if (zh && hk) {
          var esc = hk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          var pm = new RegExp("^" + esc + "\\s*[–—-]\\s*").exec(zh);
          if (pm) zh = zh.slice(pm[0].length);
        }
        var wrap = el("div", "opt-text");
        wrap.appendChild(el("span", "opt-main", zh || rawBody));
        if (zh && zh !== rawBody) wrap.appendChild(el("span", "opt-orig", rawBody));
        if (o.n) wrap.appendChild(el("span", "opt-note", o.n));
        item.appendChild(wrap);
        if (zh) item.title = o.t;
        list.appendChild(item);
      });
      os.appendChild(list);
      if (state.lang === "zh") {
        var hint = el("p", "d-hint", t("detailUncertain"));
        os.appendChild(hint);
      }
      shell.appendChild(os);
    }

    /* 下载版本（含链接） */
    if (rec.downloads && rec.downloads.length) {
      var ds = el("section", "d-section");
      ds.appendChild(sectionTitle(t("detailDownloads", { n: rec.downloads.length }), null));
      ds.appendChild(el("p", "d-hint dl-notice", t("dlNotice")));
      var scrollBox = el("div", "dl-scroll");
      var table = el("table", "dl-table");
      var thead = el("thead");
      var hr = el("tr");
      [t("detailFile"), t("cardVersion"), t("detailDate"), t("detailSize"), t("detailCount"), t("detailActionCol")]
        .forEach(function (h) { hr.appendChild(el("th", null, h)); });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el("tbody");
      rec.downloads.forEach(function (d) {
        var tr = el("tr");
        var tdFile = el("td");
        var nameWrap = el("div", "dl-file");
        nameWrap.appendChild(el("span", "dl-badge" + (d.latest ? "" : " old"), d.latest ? t("detailLatest") : t("detailOlder")));
        nameWrap.appendChild(document.createTextNode(d.file));
        tdFile.appendChild(nameWrap);
        tr.appendChild(tdFile);
        var tdVer = el("td");
        tdVer.appendChild(el("span", "dl-ver", d.version || "—"));
        tr.appendChild(tdVer);
        tr.appendChild(el("td", null, d.date || "—"));
        tr.appendChild(el("td", null, d.size || "—"));
        tr.appendChild(el("td", null, d.count == null ? "—" : num(d.count)));
        var tdAct = el("td");
        if (d.url) {
          tdAct.appendChild(dlAnchor(d.url, "dl-btn", t("detailAction") + " ↓"));
        } else {
          tdAct.appendChild(el("span", "dl-none", "—"));
        }
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scrollBox.appendChild(table);
      ds.appendChild(scrollBox);
      shell.appendChild(ds);
    }

    /* 说明 */
    if (rec.notes && rec.notes.length) {
      var ns = el("section", "d-section");
      ns.appendChild(sectionTitle(t("detailNote"), rec.notes.length));
      var nlist = el("div", "note-list");
      rec.notes.forEach(function (n) {
        nlist.appendChild(el("p", "note-item", n));
      });
      ns.appendChild(nlist);
      shell.appendChild(ns);
    }

    /* 预览图 */
    if (rec.screenshots && rec.screenshots.length) {
      var ss = el("section", "d-section");
      ss.appendChild(sectionTitle(t("detailScreens"), rec.screenshots.length));
      var sw = el("div", "d-screens");
      rec.screenshots.forEach(function (s, idx) {
        var url = typeof s === "string" ? s : (s.original_url || s.url || "");
        if (!url) return;
        var fig = el("figure", "d-screen");
        var img = makeImg(url, primaryName(rec));
        img.addEventListener("click", function () {
          // 用图集里的真实下标打开，避免封面占据首位导致错位
          var gi = galleryOf(rec).indexOf(url);
          openLightbox(rec, gi < 0 ? 0 : gi);
        });
        fig.appendChild(img);
        sw.appendChild(fig);
      });
      ss.appendChild(sw);
      shell.appendChild(ss);
    }

    root.appendChild(shell);
  }

  function addBigFact(facts, label, value) {
    var f = el("div", "dfact");
    f.appendChild(el("span", "dfact-k", label));
    f.appendChild(el("span", "dfact-v", value));
    facts.appendChild(f);
  }

  /* ---------------- 路由 ---------------- */
  function route() {
    var m = /^#\/t\/(.+)$/.exec(location.hash || "");
    var slug = m ? decodeURIComponent(m[1]) : null;
    var rec = slug ? bySlug[slug] : null;
    if (rec) {
      state.detailSlug = slug;
      renderDetail(rec);
      $("listView").hidden = true;
      $("detailView").hidden = false;
      $("toTop").hidden = true;
      window.scrollTo(0, 0);
    } else {
      if (state.detailSlug != null) {
        // 从详情返回列表：恢复滚动位置
        $("listView").hidden = false;
        $("detailView").hidden = true;
        $("detailView").innerHTML = "";
        window.scrollTo(0, state.listScroll || 0);
      }
      state.detailSlug = null;
    }
  }

  /* ---------------- Lightbox（滚轮缩放 / 拖动平移 / 双击切换） ---------------- */
  var lb = { scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 };
  var LB_MIN = 1, LB_MAX = 8;

  function lbApply() {
    var img = $("lbImg");
    img.style.transform = "translate(" + lb.tx + "px," + lb.ty + "px) scale(" + lb.scale + ")";
    img.classList.toggle("zoomed", lb.scale > 1.001);
    $("lbZoom").textContent = Math.round(lb.scale * 100) + "%";
  }
  function lbReset() {
    lb.scale = 1; lb.tx = 0; lb.ty = 0;
    var img = $("lbImg");
    img.style.transform = "";
    img.classList.remove("zoomed");
    $("lbZoom").textContent = "100%";
  }
  /* 以屏幕上某点为锚点缩放（cx/cy 为相对图片变换原点的坐标） */
  function lbZoomAt(factor, cx, cy) {
    var next = Math.min(LB_MAX, Math.max(LB_MIN, lb.scale * factor));
    if (Math.abs(next - lb.scale) < 0.001) return;
    var k = next / lb.scale;
    if (cx == null) { cx = 0; cy = 0; }
    lb.tx = cx - k * (cx - lb.tx);
    lb.ty = cy - k * (cy - lb.ty);
    lb.scale = next;
    if (lb.scale <= 1.001) { lb.tx = 0; lb.ty = 0; } // 回到适应窗口时归位
    lbApply();
  }
  /* 屏幕上一点 → 相对图片变换原点（中心）的坐标 */
  function lbPoint(ev) {
    var img = $("lbImg");
    var r = img.getBoundingClientRect();
    var centerX = r.left + r.width / 2;
    var centerY = r.top + r.height / 2;
    return { x: ev.clientX - (centerX - lb.tx), y: ev.clientY - (centerY - lb.ty) };
  }
  function lbZoomCenter(factor) { lbZoomAt(factor, 0, 0); }
  function lbFitReal() { // 1:1 原始尺寸
    var img = $("lbImg");
    if (!img.naturalWidth) return;
    var r = img.getBoundingClientRect();
    var fitted = r.width / lb.scale; // 反推适应窗口时的显示宽度
    lbZoomAt(Math.max(LB_MIN, Math.min(LB_MAX, img.naturalWidth / fitted)), 0, 0);
  }

  function openLightbox(rec, idx) {
    var urls = galleryOf(rec);
    if (!urls.length) return;
    state.lbList = urls;
    state.lbIndex = Math.max(0, Math.min(idx, urls.length - 1));
    showLb();
    $("lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    $("lbClose").focus();
  }
  function showLb() {
    var url = state.lbList[state.lbIndex];
    var img = $("lbImg");
    img.referrerPolicy = "no-referrer";
    img.style.visibility = "visible";
    lbReset();
    if (img.dataset.broken === "1") { img.dataset.broken = "0"; }
    attachImg(img, url, function () {
      img.style.visibility = "hidden";
      var fb = document.querySelector(".lb-fallback");
      if (!fb) {
        fb = el("div", "lb-fallback", "!");
        $("lbStage").appendChild(fb);
      }
    });
    img.alt = "";
    $("lbCount").textContent = (state.lbIndex + 1) + " / " + state.lbList.length;
    var multi = state.lbList.length > 1;
    $("lbPrev").hidden = !multi;
    $("lbNext").hidden = !multi;
  }
  function closeLightbox() {
    $("lightbox").hidden = true;
    document.body.style.overflow = "";
    state.lbList = [];
    state.lbIndex = -1;
    var fb = document.querySelector(".lb-fallback");
    if (fb) fb.remove();
    lbReset();
  }
  function lbMove(step) {
    if (!state.lbList.length) return;
    state.lbIndex = (state.lbIndex + step + state.lbList.length) % state.lbList.length;
    showLb();
  }

  /* ---------------- URL 同步（列表状态） ---------------- */
  function syncUrl() {
    if (state.detailSlug) { ensureRef(); return; } // 详情页只保证 ref 常驻，不动列表参数
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat !== "__all__") p.set("cat", state.cat);
    if (state.tag !== "__all__") p.set("tag", state.tag);
    if (state.sort !== "recent") p.set("sort", state.sort);
    if (state.lang !== "zh") p.set("lang", state.lang);
    if (state.view !== "gallery") p.set("view", state.view);
    if (state.per !== 24) p.set("per", String(state.per));
    if (state.page > 1) p.set("page", String(state.page));
    p.set("ref", REF_TAG); // 源站下载校验需要，保持常驻
    var qs = p.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }
  function readUrl() {
    var p = new URLSearchParams(location.search);
    if (p.get("lang") === "en") state.lang = "en";
    if (p.get("q")) state.q = p.get("q");
    if (p.get("cat")) state.cat = p.get("cat");
    if (p.get("tag")) state.tag = p.get("tag");
    if (["recent", "options", "versions", "name"].indexOf(p.get("sort")) > -1) state.sort = p.get("sort");
    if (p.get("view") === "cats") state.view = "cats";
    var per = parseInt(p.get("per"), 10);
    if (PER_OPTIONS.indexOf(per) > -1) state.per = per;
    var page = parseInt(p.get("page"), 10);
    if (page >= 1) state.page = page;
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    var input = $("searchInput");
    input.value = state.q;
    $("searchClear").hidden = !state.q;

    input.addEventListener("input", debounce(function () {
      state.q = input.value;
      $("searchClear").hidden = !state.q;
      refresh();
    }, 180));

    $("searchClear").addEventListener("click", function () {
      input.value = ""; state.q = ""; $("searchClear").hidden = true;
      refresh(); input.focus();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "/" && document.activeElement !== input && $("lightbox").hidden && state.detailSlug == null) {
        ev.preventDefault();
        if (state.view !== "cats") setView("cats");
        input.focus(); input.select();
      }
      if (ev.key === "Escape") {
        if (!$("lightbox").hidden) closeLightbox();
        else if (state.detailSlug) goBack();
      }
      if (!$("lightbox").hidden) {
        if (ev.key === "ArrowLeft") lbMove(-1);
        if (ev.key === "ArrowRight") lbMove(1);
        if (ev.key === "+" || ev.key === "=") lbZoomCenter(1.25);
        if (ev.key === "-" || ev.key === "_") lbZoomCenter(1 / 1.25);
        if (ev.key === "0") lbReset();
      }
    });

    $("sortSelect").addEventListener("change", function (ev) {
      state.sort = ev.target.value; refresh();
    });
    $("perPageSelect").addEventListener("change", function (ev) {
      setPer(parseInt(ev.target.value, 10));
    });
    $("browseCta").addEventListener("click", function () { setView("cats"); });

    Array.prototype.forEach.call(document.querySelectorAll(".nav-tab"), function (tab) {
      tab.addEventListener("click", function () { setView(tab.dataset.view); });
    });
    $("emptyReset").addEventListener("click", function () {
      state.q = ""; input.value = ""; $("searchClear").hidden = true;
      state.cat = "__all__"; state.tag = "__all__"; refresh();
    });

    $("langToggle").addEventListener("click", function () {
      state.lang = state.lang === "zh" ? "en" : "zh";
      localStorage.setItem("fling.lang", state.lang);
      renderStaticText(); renderTagChips();
      if (state.detailSlug) renderDetail(bySlug[state.detailSlug]);
      else refresh();
    });

    $("themeToggle").addEventListener("click", function () {
      state.theme = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("fling.theme", state.theme);
      document.body.dataset.theme = state.theme;
    });

    window.addEventListener("hashchange", route);

    $("lbClose").addEventListener("click", closeLightbox);
    $("lbPrev").addEventListener("click", function () { lbMove(-1); });
    $("lbNext").addEventListener("click", function () { lbMove(1); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lb-close]"), function (n) {
      n.addEventListener("click", closeLightbox);
    });

    /* 缩放工具条 */
    $("lbZoomIn").addEventListener("click", function () { lbZoomCenter(1.25); });
    $("lbZoomOut").addEventListener("click", function () { lbZoomCenter(1 / 1.25); });
    $("lbFit").addEventListener("click", lbReset);
    $("lbOne").addEventListener("click", lbFitReal);

    /* 滚轮缩放（以光标为锚点） */
    $("lightbox").addEventListener("wheel", function (ev) {
      if ($("lightbox").hidden) return;
      ev.preventDefault();
      var p = lbPoint(ev);
      lbZoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });

    /* 拖动平移（放大后生效） */
    var lbImg = $("lbImg");
    lbImg.addEventListener("pointerdown", function (ev) {
      if (lb.scale <= 1.001) return;
      lb.dragging = true;
      lb.startX = ev.clientX; lb.startY = ev.clientY;
      lb.baseX = lb.tx; lb.baseY = lb.ty;
      lbImg.classList.add("dragging");
      lbImg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    lbImg.addEventListener("pointermove", function (ev) {
      if (!lb.dragging) return;
      lb.tx = lb.baseX + (ev.clientX - lb.startX);
      lb.ty = lb.baseY + (ev.clientY - lb.startY);
      lbApply();
    });
    function lbEndDrag(ev) {
      if (!lb.dragging) return;
      lb.dragging = false;
      lbImg.classList.remove("dragging");
      try { lbImg.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    }
    lbImg.addEventListener("pointerup", lbEndDrag);
    lbImg.addEventListener("pointercancel", lbEndDrag);

    /* 双击：还原 / 放大到 2 倍（以点击处为锚点） */
    lbImg.addEventListener("dblclick", function (ev) {
      ev.preventDefault();
      if (lb.scale > 1.001) { lbReset(); return; }
      var p = lbPoint(ev);
      lbZoomAt(2, p.x, p.y);
    });

    var toTop = $("toTop");
    window.addEventListener("scroll", function () {
      if (state.detailSlug == null) toTop.hidden = window.scrollY < 900;
    }, { passive: true });
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!DATA || !DATA.records || !DATA.records.length) {
      $("loadError").hidden = false;
      $("loadError").textContent = t("loadError");
      return;
    }
    readUrl();
    ensureRef();
    $("sortSelect").value = state.sort;
    $("perPageSelect").value = String(state.per);
    applyView(); // 应用初始视图（含 ?view=cats 深链）
    prepare();
    bind();
    renderStaticText();
    renderCatChips();
    renderTagChips();
    refresh();
    route(); // 处理 #/t/<slug> 深链
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
