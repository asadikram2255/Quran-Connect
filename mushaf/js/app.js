/* Read Mushaf — page-by-page reader over the standard 604-page Madani layout.
   Data: ../data/mushaf/pages.json (built by scripts/build_mushaf.py) plus
   ../data/meta/sura_meta.json for the surah dropdown. No network beyond those
   two files — works identically in the browser and in the Android WebView. */

(function () {
  "use strict";

  // Arabic fonts offered here (same families as Explore Quran; the extra two
  // are self-hosted via ../assets/quran-fonts.css).
  var AR_FONTS = [
    { id: "",          label: "Amiri Quran (default)", stack: "" },
    { id: "almushaf",  label: "Al Mushaf (Uthmani)",   stack: '"Al Mushaf", "Amiri Quran", serif' },
    { id: "noorehuda", label: "Noore Huda (IndoPak)",  stack: '"Noore Huda", "Amiri Quran", serif' },
    { id: "naskh",     label: "Noto Naskh Arabic",     stack: '"Noto Naskh Arabic", "Amiri", serif' },
  ];

  var JUZ_LABEL = "Juz";

  var App = {
    data: null,          // pages.json
    suraMeta: [],        // index -> record
    page: 1,
    font: "",
    juzFirstPage: {},    // juz -> first page number

    async init() {
      try {
        // Shared with Explore Quran (and the native Settings default) so the
        // Quran-text font is consistent across modules; falls back to any older
        // Mushaf-only choice a reader made before the keys were unified.
        this.font = localStorage.getItem("explore-font-ar") ||
          localStorage.getItem("mushaf-font-ar") || "";
      } catch (e) {}

      var base = "../data/";
      var [pages, meta] = await Promise.all([
        fetch(base + "mushaf/pages.json?v=1").then(r => r.json()),
        fetch(base + "meta/sura_meta.json?v=1").then(r => r.json()),
      ]);
      this.data = pages;
      meta.forEach(m => { this.suraMeta[m.index] = m; });

      // juz -> first page
      pages.pages.forEach(p => {
        if (p.juz && this.juzFirstPage[p.juz] === undefined) {
          this.juzFirstPage[p.juz] = p.p;
        }
      });

      this._applyFont();
      this._buildSuraSelect();
      this._buildJuzSelect();
      this._buildFontSelect();
      this._bind();

      document.getElementById("loading").hidden = true;

      this.goto(this._initialPage(), { push: false });
    },

    _initialPage() {
      var url = new URL(location.href);
      var qp = parseInt(url.searchParams.get("page"), 10);
      if (qp >= 1 && qp <= 604) return qp;
      var qs = parseInt(url.searchParams.get("sura"), 10);
      if (qs >= 1 && qs <= 114 && this.suraMeta[qs] && this.suraMeta[qs].page) {
        return this.suraMeta[qs].page;
      }
      var h = parseInt((location.hash || "").replace("#", ""), 10);
      if (h >= 1 && h <= 604) return h;
      try {
        var last = parseInt(localStorage.getItem("mushaf-last-page"), 10);
        if (last >= 1 && last <= 604) return last;
      } catch (e) {}
      return 1;
    },

    // ── page number in Arabic-Indic digits ─────────────────────────────
    arNum(n) {
      var d = "٠١٢٣٤٥٦٧٨٩";
      return String(n).replace(/[0-9]/g, c => d[+c]);
    },

    // ── render one page ────────────────────────────────────────────────
    render() {
      var pg = this.data.pages[this.page - 1];
      var el = document.getElementById("mushaf-page");
      var html = "";
      var lastSura = null;

      pg.ayaat.forEach(a => {
        // A sura opening on this page gets an ornamental band + bismillah.
        if (a.a === 1) {
          var sb = (pg.suraStart || []).find(s => s.n === a.s) || {};
          var revTxt = sb.rev === "makki" ? "Makki" : sb.rev === "madani" ? "Madani" : "";
          html +=
            '<div class="sura-band">' +
              '<div class="s-name">' + esc(sb.name || "") + "</div>" +
              '<div class="s-meta">' + esc(sb.n + ". " + (sb.tname || "")) +
                (sb.en ? " — " + esc(sb.en) : "") +
                (revTxt ? '<span class="s-rev">' + revTxt + "</span>" : "") +
              "</div>" +
            "</div>";
          if (sb.bismillah) {
            html += '<div class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>';
          }
        }
        lastSura = a.s;
        html +=
          '<span class="ayah" data-ref="' + a.s + ":" + a.a + '">' +
            esc(a.t) + " " +
            '<span class="ayah-end"><span class="num">' + this.arNum(a.a) + "</span></span>" +
          "</span> ";
      });

      el.innerHTML = html;

      // footer
      document.getElementById("page-juz").textContent =
        pg.juz ? JUZ_LABEL + " " + pg.juz : "";
      document.getElementById("page-num").textContent =
        "Page " + pg.p + " · صفحة " + this.arNum(pg.p);
      var footSura = this.suraMeta[lastSura];
      document.getElementById("page-sura-foot").textContent =
        footSura ? footSura.name : "";

      // controls reflect state
      document.getElementById("page-input").value = pg.p;
      document.getElementById("nav-prev").disabled = pg.p <= 1;
      document.getElementById("nav-next").disabled = pg.p >= 604;

      // keep the surah dropdown in sync with whatever sura the page opens with
      var firstSura = pg.ayaat[0].s;
      var sel = document.getElementById("sura-select");
      if (sel && +sel.value !== firstSura) sel.value = firstSura;

      // scroll page into view (top)
      document.getElementById("page-wrap").scrollIntoView({ block: "start" });
    },

    goto(n, opts) {
      opts = opts || {};
      n = Math.min(604, Math.max(1, n | 0));
      this.page = n;
      this.render();
      try { localStorage.setItem("mushaf-last-page", String(n)); } catch (e) {}
      if (opts.push !== false) {
        history.replaceState(null, "", "?page=" + n);
      }
    },

    // ── controls ────────────────────────────────────────────────────────
    _buildSuraSelect() {
      var sel = document.getElementById("sura-select");
      sel.innerHTML = this.suraMeta
        .filter(Boolean)
        .map(m => '<option value="' + m.index + '">' +
          m.index + ". " + esc(m.tname) + "</option>")
        .join("");
    },

    _buildJuzSelect() {
      var sel = document.getElementById("juz-select");
      var opts = "";
      for (var j = 1; j <= 30; j++) {
        opts += '<option value="' + j + '">' + JUZ_LABEL + " " + j + "</option>";
      }
      sel.innerHTML = opts;
    },

    _buildFontSelect() {
      var sel = document.getElementById("font-select");
      sel.innerHTML = AR_FONTS
        .map(f => '<option value="' + f.id + '">' + esc(f.label) + "</option>")
        .join("");
      sel.value = this.font;
    },

    _applyFont() {
      var f = AR_FONTS.find(x => x.id === this.font) || AR_FONTS[0];
      if (f.stack) {
        document.documentElement.style.setProperty("--font-ar", f.stack);
      } else {
        document.documentElement.style.removeProperty("--font-ar");
      }
    },

    _bind() {
      var self = this;
      document.getElementById("nav-prev").onclick = () => self.goto(self.page - 1);
      document.getElementById("nav-next").onclick = () => self.goto(self.page + 1);

      var pageInput = document.getElementById("page-input");
      pageInput.onchange = () => { var v = parseInt(pageInput.value, 10); if (v) self.goto(v); };

      document.getElementById("sura-select").onchange = e => {
        var m = self.suraMeta[+e.target.value];
        if (m && m.page) self.goto(m.page);
      };
      document.getElementById("juz-select").onchange = e => {
        var p = self.juzFirstPage[+e.target.value];
        if (p) self.goto(p);
      };
      document.getElementById("font-select").onchange = e => {
        self.font = e.target.value;
        // Written to the shared key so the choice carries into Explore Quran too.
        try { localStorage.setItem("explore-font-ar", self.font); } catch (err) {}
        self._applyFont();
      };

      // The native Settings screen writes the shared font key and fires this;
      // re-read and apply live. Inert on the website (nothing dispatches it).
      window.addEventListener("quran-reader-defaults", () => {
        var f = "";
        try { f = localStorage.getItem("explore-font-ar") || ""; } catch (err) {}
        if (f === self.font) return;
        self.font = f;
        var sel = document.getElementById("font-select");
        if (sel) sel.value = f;
        self._applyFont();
      });

      // Keyboard — RTL reading, matching the book viewer: ← next, → previous.
      document.addEventListener("keydown", e => {
        if (/input|select|textarea/i.test((e.target.tagName || ""))) return;
        if (e.key === "ArrowLeft") self.goto(self.page + 1);
        else if (e.key === "ArrowRight") self.goto(self.page - 1);
      });

      // Theme toggle (shared key across modules).
      var tt = document.getElementById("theme-toggle");
      if (tt) tt.onclick = () => {
        var dark = document.documentElement.getAttribute("data-theme") === "dark";
        if (dark) {
          document.documentElement.removeAttribute("data-theme");
          try { localStorage.setItem("theme", "light"); } catch (e) {}
        } else {
          document.documentElement.setAttribute("data-theme", "dark");
          try { localStorage.setItem("theme", "dark"); } catch (e) {}
        }
      };
    },
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.mushaf = App;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init());
  } else {
    App.init();
  }
})();
