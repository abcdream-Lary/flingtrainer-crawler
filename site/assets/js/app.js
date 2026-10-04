/* 风灵图鉴 · 展示逻辑（纯前端，无构建、无依赖）
 * 数据：window.FLING_DATA（scripts/build_web_data.py 生成）
 * 汉化：window.FLING_CATALOG（人工维护，缺失回退英文名）
 */
(function () {
  "use strict";

  var DATA = window.FLING_DATA || null;
  var CATALOG = window.FLING_CATALOG || { categories: [], entries: {} };
  var I18N = window.FLING_I18N || { zh: {}, en: {} };
  var BATCH = 36;
  var ORIGIN = "https://flingtrainer.com";

  /* ---------------- state ---------------- */
  var state = {
    lang: localStorage.getItem("fling.lang") || "zh",
    theme: localStorage.getItem("fling.theme") ||
      (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    q: "", cat: "__all__", tag: "__all__", sort: "recent",
    shown: 0,
    filtered: [],
    io: null
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

  /* ---------------- 数据准备 ---------------- */
  var records = [];
  var tagIndex = {};   // tag -> count

  function prepare() {
    records = (DATA && DATA.records) || [];
    records.forEach(function (r) {
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
        var hay = [r.name, zhName(r), r.slug].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var byDateDesc = function (a, b) { return (b.last_updated || "").localeCompare(a.last_updated || ""); };
    if (state.sort === "recent") out.sort(byDateDesc);
    else if (state.sort === "options") out.sort(function (a, b) { return b.options_extracted - a.options_extracted; });
    else if (state.sort === "versions") out.sort(function (a, b) { return b.downloads.length - a.downloads.length; });
    else if (state.sort === "name") out.sort(function (a, b) {
      return (primaryName(a) || "").localeCompare(primaryName(b) || "", state.lang === "zh" ? "zh-Hans-CN" : "en");
    });
    return out;
  }

  /* ---------------- 渲染：hero / 筛选栏 ---------------- */
  function renderStaticText() {
    document.documentElement.lang = t("htmlLang");
    document.body.dataset.lang = state.lang;
    document.body.dataset.theme = state.theme;

    $("brandName").textContent = t("brand");
    $("brandSub").textContent = t("brandSub");
    $("heroEyebrow").textContent = t("brandSub");
    $("heroTitle").innerHTML = "";
    // 主标题做渐变点缀
    var parts = t("heroTitle").split("·");
    if (parts.length > 1) {
      $("heroTitle").appendChild(el("span", null, parts[0].trim()));
      var em = el("em", null, "·" + parts.slice(1).join("·").trim());
      $("heroTitle").appendChild(em);
    } else {
      $("heroTitle").textContent = t("heroTitle");
    }
    $("heroLead").textContent = t("heroLead");
    $("heroCta").textContent = t("heroCta");
    $("navRepoText").textContent = t("navRepo");
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

    // hero 统计
    if (DATA && DATA.stats) {
      var s = DATA.stats;
      setStat("statGames", num(s.games));
      setStat("statOptions", num(s.options));
      setStat("statVersions", num(s.downloads));
      setStat("statUpdated", s.last_updated || "—", true);
    }
  }
  function num(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function setStat(id, value, isDate) {
    var dd = $(id).nextElementSibling;
    dd.textContent = "";
    dd.appendChild(document.createTextNode(value));
  }

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

  /* ---------------- 渲染：卡片 ---------------- */
  function cardNode(rec, delayIdx) {
    var card = el("article", "card");
    card.tabIndex = 0;
    card.style.animationDelay = Math.min(delayIdx * 26, 320) + "ms";
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", primaryName(rec));

    var media = el("div", "card-media");
    var shot = (rec.screenshots && rec.screenshots[0]) || "";
    if (shot) {
      var img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.alt = primaryName(rec);
      img.src = shot;
      img.addEventListener("error", function () {
        media.innerHTML = "";
        media.appendChild(fallbackMedia(rec));
      });
      media.appendChild(img);
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
      tags.slice(0, 3).forEach(function (tag) { tw.appendChild(el("span", "mini-tag", tag)); });
      body.appendChild(tw);
    }

    var meta = el("div", "card-meta");
    addMeta(meta, t("cardVersion"), rec.version || "—");
    addMeta(meta, null, (rec.options_extracted || 0) + " " + t("cardOptions"));
    addMeta(meta, null, rec.downloads.length + " " + t("cardVersions"));
    addMeta(meta, t("cardUpdated"), rec.last_updated || t("cardNoDate"));
    body.appendChild(meta);
    card.appendChild(body);

    function open() { openModal(rec); }
    card.addEventListener("click", open);
    card.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); }
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

  /* ---------------- 渲染：列表 ---------------- */
  function refresh(keepScroll) {
    state.filtered = buildFiltered();
    state.shown = 0;
    var grid = $("grid");
    grid.innerHTML = "";

    var count = state.filtered.length;
    $("resultCount").textContent = t("resultCount", { n: num(count) });
    $("empty").hidden = count !== 0;
    $("loadError").hidden = true;

    renderCatChips();      // 未分类计数可能随语言变化
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

  /* ---------------- 详情弹窗 ---------------- */
  function openModal(rec) {
    var body = $("modalBody");
    body.innerHTML = "";

    var head = el("div", "m-head");
    head.appendChild(el("div", "m-name-zh", primaryName(rec)));
    var sub = secondaryName(rec);
    if (sub) head.appendChild(el("div", "m-name-en", sub));
    body.appendChild(head);

    var facts = el("div", "m-facts");
    addFact(facts, t("cardVersion"), rec.version || "—");
    addFact(facts, t("detailOptions", { n: rec.options_extracted || 0 }), null, true);
    addFact(facts, t("detailPublished"), rec.published_date || "—");
    addFact(facts, t("cardUpdated"), rec.last_updated || t("cardNoDate"));
    body.appendChild(facts);

    if (rec.notes && rec.notes.length) {
      var ns = el("div", "m-section");
      ns.appendChild(sectionTitle(t("detailNote"), rec.notes.length));
      var nlist = el("div", "opt-list");
      rec.notes.forEach(function (n) {
        var item = el("div", "opt");
        item.appendChild(el("div", "opt-text", n));
        nlist.appendChild(item);
      });
      ns.appendChild(nlist);
      body.appendChild(ns);
    }

    if (rec.screenshots && rec.screenshots.length) {
      var ss = el("div", "m-section");
      ss.appendChild(sectionTitle(t("detailScreens"), rec.screenshots.length));
      var sw = el("div", "m-screens");
      rec.screenshots.forEach(function (url) {
        var img = document.createElement("img");
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.alt = primaryName(rec);
        img.src = url;
        sw.appendChild(img);
      });
      ss.appendChild(sw);
      body.appendChild(ss);
    }

    if (rec.options && rec.options.length) {
      var os = el("div", "m-section");
      os.appendChild(sectionTitle(t("detailOptions", { n: rec.options.length }), null));
      var list = el("div", "opt-list");
      rec.options.forEach(function (o, i) {
        var item = el("div", "opt");
        var key = el("span", "opt-key", hotkeyOf(o.t) || String(i + 1));
        var wrap = el("div", "opt-text");
        wrap.appendChild(document.createTextNode(o.t));
        if (o.n) wrap.appendChild(el("span", "opt-note", o.n));
        item.appendChild(key);
        item.appendChild(wrap);
        list.appendChild(item);
      });
      os.appendChild(list);
      body.appendChild(os);
    }

    if (rec.downloads && rec.downloads.length) {
      var ds = el("div", "m-section");
      ds.appendChild(sectionTitle(t("detailDownloads", { n: rec.downloads.length }), null));
      var table = el("table", "dl-table");
      var thead = el("thead");
      var hr = el("tr");
      [t("detailFile"), t("cardVersion"), t("detailDate"), t("detailSize"), t("detailCount")]
        .forEach(function (h) { hr.appendChild(el("th", null, h)); });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el("tbody");
      rec.downloads.forEach(function (d) {
        var tr = el("tr");
        var tdFile = el("td");
        var nameWrap = el("div", "dl-file");
        var badge = el("span", "dl-badge" + (d.latest ? "" : " old"), d.latest ? t("detailLatest") : t("detailOlder"));
        nameWrap.appendChild(badge);
        nameWrap.appendChild(document.createTextNode(d.file));
        tdFile.appendChild(nameWrap);
        tr.appendChild(tdFile);
        var tdVer = el("td");
        tdVer.appendChild(el("span", "dl-ver", d.version || "—"));
        tr.appendChild(tdVer);
        tr.appendChild(el("td", null, d.date || "—"));
        tr.appendChild(el("td", null, d.size || "—"));
        tr.appendChild(el("td", null, d.count == null ? "—" : num(d.count)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      ds.appendChild(table);
      body.appendChild(ds);
    }

    var link = el("a", "m-link", t("detailOpenSite") + " →");
    link.href = rec.url || (ORIGIN + "/trainer/" + rec.slug + "/");
    link.target = "_blank";
    link.rel = "noopener";
    body.appendChild(link);
    body.appendChild(el("p", "m-src", t("detailDataFrom") + ": " + (rec.url || "")));

    $("modal").hidden = false;
    document.body.style.overflow = "hidden";
    $(".modal-close").focus();
  }

  function addFact(facts, label, value, valueIsWhole) {
    var f = el("span", "fact");
    if (valueIsWhole) { f.appendChild(el("b", null, label)); }
    else {
      f.appendChild(document.createTextNode(label + " "));
      f.appendChild(el("b", null, value));
    }
    facts.appendChild(f);
  }
  function sectionTitle(text, n) {
    var h = el("h3", null, text);
    if (n != null) h.appendChild(el("span", "n", String(n)));
    return h;
  }
  function hotkeyOf(text) {
    var m = /^(Num(?:pad)?\s*\.?\s*\d|Ctrl\+Num[^–—-]*|Alt\+Num[^–—-]*|Shift\+Num[^–—-]*|F\d{1,2}|Numpad\s*\d)/i.exec(text || "");
    if (m) return m[1];
    m = /^(Ctrl|Alt|Shift)\+[^\s–—-]+/i.exec(text || "");
    return m ? m[1] + "+" : "";
  }

  function closeModal() {
    $("modal").hidden = true;
    document.body.style.overflow = "";
  }

  /* ---------------- URL 同步 ---------------- */
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat !== "__all__") p.set("cat", state.cat);
    if (state.tag !== "__all__") p.set("tag", state.tag);
    if (state.sort !== "recent") p.set("sort", state.sort);
    if (state.lang !== "zh") p.set("lang", state.lang);
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
      if (ev.key === "/" && document.activeElement !== input) {
        ev.preventDefault(); input.focus(); input.select();
      }
      if (ev.key === "Escape" && !$("modal").hidden) closeModal();
    });

    $("sortSelect").addEventListener("change", function (ev) {
      state.sort = ev.target.value; refresh();
    });
    $("emptyReset").addEventListener("click", function () {
      state.q = ""; input.value = ""; $("searchClear").hidden = true;
      state.cat = "__all__"; state.tag = "__all__"; refresh();
    });

    $("langToggle").addEventListener("click", function () {
      state.lang = state.lang === "zh" ? "en" : "zh";
      localStorage.setItem("fling.lang", state.lang);
      renderStaticText(); renderTagChips(); refresh();
    });

    $("themeToggle").addEventListener("click", function () {
      state.theme = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("fling.theme", state.theme);
      document.body.dataset.theme = state.theme;
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (n) {
      n.addEventListener("click", closeModal);
    });

    var toTop = $("toTop");
    window.addEventListener("scroll", function () {
      toTop.hidden = window.scrollY < 900;
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
    prepare();
    bind();
    renderStaticText();
    renderCatChips();
    renderTagChips();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
