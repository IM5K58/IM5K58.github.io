// @ts-check
// archive.html 진입점: 전체 글을 연도별로 묶어 표로 보여주고 카테고리로 걸러낸다
(async () => {
  const bodyEl = document.getElementById("archive-body");
  const countEl = document.getElementById("archive-count");
  const tabsEl = document.getElementById("category-tabs");
  const subTabsEl = document.getElementById("subcategory-tabs");

  // 글 상세의 위치 표시(index / ai / …)에서 넘어올 수 있게 ?cat= 을 받는다
  const state = { category: new URLSearchParams(location.search).get("cat") || "" };
  let allPosts = [];

  // 속성 값 안에서도 안전하도록 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 " 를 그대로 흘려보내서, 제목에 따옴표가
  // 하나만 있어도 data-*/href/src 속성이 끊기고 마크업이 깨진다.
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  const tab = (label, value, count, active) => `
    <button class="tab ${active ? "active" : ""}" data-category="${esc(value)}">
      ${esc(label)}${count != null ? `<span class="count">${String(count).padStart(2, "0")}</span>` : ""}
    </button>`;

  function renderTabs() {
    const cats = Posts.categories(allPosts);
    const activeTop = state.category ? Posts.topOf(state.category) : "";
    tabsEl.innerHTML =
      tab("ALL", "", allPosts.length, !state.category) +
      cats.map(([c, n]) => tab(c, c, n, activeTop === c)).join("");

    const subs = activeTop ? Posts.subcategories(allPosts, activeTop) : [];
    subTabsEl.innerHTML = subs.length
      ? tab("ALL", activeTop, null, state.category === activeTop) +
        subs
          .map(([c, n]) =>
            tab(c, `${activeTop}/${c}`, n, state.category === `${activeTop}/${c}`)
          )
          .join("")
      : "";
  }

  // 같은 해에 쓴 글끼리 묶는다 (최신 연도가 위)
  function groupByYear(posts) {
    const map = new Map();
    posts.forEach((p) => {
      const year = new Date(p.date).getFullYear();
      if (!map.has(year)) map.set(year, []);
      map.get(year).push(p);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }

  function monthDay(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  function renderList() {
    const posts = Posts.filter(allPosts, { category: state.category });
    countEl.textContent = state.category
      ? `${Posts.catDisplay(state.category)} · ${Posts.num(posts.length)}`
      : `TOTAL ${Posts.num(posts.length)}`;

    if (!posts.length) {
      bodyEl.innerHTML = `<div class="empty-state">이 카테고리에는 아직 글이 없습니다</div>`;
      return;
    }

    bodyEl.innerHTML = `<div class="archive-wrap">${groupByYear(posts)
      .map(
        ([year, list]) => `
      <section class="archive-year">
        <h2 class="archive-year-label">${year}<span class="archive-year-count">${String(
          list.length
        ).padStart(2, "0")} ENTRIES</span></h2>
        <ul class="archive-list">
          ${list
            .map(
              (p) => `
            <li>
              <a class="archive-row" style="--cat-hue: ${Posts.catHue(p.category)}" href="${Posts.url(p.slug)}">
                <span class="archive-index">${Posts.num(p.index)}</span>
                <span class="archive-date">${monthDay(p.date)}</span>
                <span class="archive-title">${esc(p.title)}</span>
                <span class="archive-cat"><span>${esc(Posts.catDisplay(p.category))}</span></span>
              </a>
            </li>`
            )
            .join("")}
        </ul>
      </section>`
      )
      .join("")}</div>`;
  }

  const onTabClick = (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    state.category = btn.dataset.category;
    renderTabs();
    renderList();
  };
  tabsEl.addEventListener("click", onTabClick);
  subTabsEl.addEventListener("click", onTabClick);

  try {
    allPosts = Posts.published(await Posts.load());
    renderTabs();
    renderList();
  } catch (err) {
    // 예전 HTML이 캐시에서 뜨면 요소가 없을 수 있다 — 오류 처리까지 죽지 않게 한다
    if (countEl) countEl.textContent = "";
    if (bodyEl) {
      bodyEl.innerHTML = `<div class="empty-state">글 목록을 불러오지 못했습니다 · ${esc(err.message)}</div>`;
    }
  }
})();
