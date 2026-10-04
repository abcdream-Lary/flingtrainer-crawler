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
  var BATCH = 36;
  var ORIGIN = "https://flingtrainer.com";
  var IMG_PROXY = "https://wsrv.nl/?url=";   // 加载失败的图片代理兜底

  /* ---------------- state ---------------- */
  var state = {
    lang: localStorage.getItem("fling.lang") || "zh",
    theme: localStorage.getItem("fling.theme") || "light",
    q: "", cat: "__all__", tag: "__all__", sort: "recent",
    view: "gallery",
    shown: 0, filtered: [], io: null,
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
    $("navRepoText").textContent = t("navRepo");
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
    $("loadingText").textContent = t("loading");
    $("footerNote").textContent = t("footerNote");
    $("footerRobots").textContent = t("footerRobots");
    $("langToggle").textContent = t("langButton");
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
    var shot = shotUrl(rec, 0);
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

  /* ---------------- 列表渲染 ---------------- */
  function refresh(keepScroll) {
    state.filtered = buildFiltered();
    state.shown = 0;
    var grid = $("grid");
    grid.innerHTML = "";

    var count = state.filtered.length;
    $("resultCount").textContent = t("resultCount", { n: num(count) });
    $("empty").hidden = count !== 0;
    $("loadError").hidden = true;

    renderCatChips();
    renderMore();
    syncUrl();
  }

  function renderMore() {
    var grid = $("grid");
    var next = state.filtered.slice(state.shown, state.shown + BATCH);
    next.forEach(function (rec, i) {
      grid.appendChild(cardNode(rec, state.shown === 0 ? i : 0));
    });
    state.shown += next.length;
    $("sentinel").hidden = state.shown >= state.filtered.length;
    observeSentinel();
  }

  function observeSentinel() {
    if (!("IntersectionObserver" in window)) return;
    if (!state.io) {
      state.io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && state.shown < state.filtered.length) renderMore();
      }, { rootMargin: "600px 0px" });
    }
    state.io.disconnect();
    if (state.shown < state.filtered.length) state.io.observe($("sentinel"));
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
    var shot = shotUrl(rec, 0);
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
      var dl = el("a", "btn btn-primary d-dl", t("detailAction") + " · " + t("detailLatest"));
      dl.href = latest.url;
      dl.target = "_blank";
      dl.rel = "noopener";
      actions.appendChild(dl);
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
          var a = el("a", "dl-btn", t("detailAction") + " ↓");
          a.href = d.url;
          a.target = "_blank";
          a.rel = "noopener";
          tdAct.appendChild(a);
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
        img.addEventListener("click", function () { openLightbox(rec, idx); });
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

  /* ---------------- Lightbox ---------------- */
  function openLightbox(rec, idx) {
    var urls = (rec.screenshots || []).map(function (s) {
      return typeof s === "string" ? s : (s.original_url || s.url || "");
    }).filter(Boolean);
    if (!urls.length) return;
    state.lbList = urls;
    state.lbIndex = idx;
    showLb();
    $("lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    $("lbClose").focus();
  }
  function showLb() {
    var url = state.lbList[state.lbIndex];
    var img = $("lbImg");
    img.referrerPolicy = "no-referrer";
    attachImg(img, url, function () {
      img.replaceWith(el("div", "lb-fallback", "!"));
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
  }
  function lbMove(step) {
    if (!state.lbList.length) return;
    state.lbIndex = (state.lbIndex + step + state.lbList.length) % state.lbList.length;
    showLb();
  }

  /* ---------------- URL 同步（列表状态） ---------------- */
  function syncUrl() {
    if (state.detailSlug) return; // 详情页不改列表参数
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat !== "__all__") p.set("cat", state.cat);
    if (state.tag !== "__all__") p.set("tag", state.tag);
    if (state.sort !== "recent") p.set("sort", state.sort);
    if (state.lang !== "zh") p.set("lang", state.lang);
    if (state.view !== "gallery") p.set("view", state.view);
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
        ev.preventDefault(); input.focus(); input.select();
      }
      if (ev.key === "Escape") {
        if (!$("lightbox").hidden) closeLightbox();
        else if (state.detailSlug) goBack();
      }
      if (!$("lightbox").hidden) {
        if (ev.key === "ArrowLeft") lbMove(-1);
        if (ev.key === "ArrowRight") lbMove(1);
      }
    });

    $("sortSelect").addEventListener("change", function (ev) {
      state.sort = ev.target.value; refresh();
    });

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
      $("sentinel").hidden = true;
      return;
    }
    readUrl();
    $("sortSelect").value = state.sort;
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
