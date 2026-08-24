// archive.html 진입점: 전체 글을 연도별로 묶어 보여주고 카테고리로 걸러낸다
(async () => {
  const bodyEl = document.getElementById("archive-body");
  const countEl = document.getElementById("archive-count");
  const tabsEl = document.getElementById("category-tabs");
  const subTabsEl = document.getElementById("subcategory-tabs");

  const state = { category: "" };
  let allPosts = [];

  function esc(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
  }

  const tab = (label, value, count, active) => `
    <button class="tab ${active ? "active" : ""}" data-category="${esc(value)}">
      ${esc(label)}${count != null ? `<span class="count">${count}</span>` : ""}
    </button>`;

  function renderTabs() {
    const cats = Posts.categories(allPosts);
    const activeTop = state.category ? Posts.topOf(state.category) : "";
    tabsEl.innerHTML =
      tab("전체", "", allPosts.length, !state.category) +
      cats.map(([c, n]) => tab(c, c, n, activeTop === c)).join("");

    const subs = activeTop ? Posts.subcategories(allPosts, activeTop) : [];
    subTabsEl.innerHTML = subs.length
      ? tab("전체", activeTop, null, state.category === activeTop) +
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
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  function renderList() {
    const posts = Posts.filter(allPosts, { category: state.category });
    countEl.textContent = state.category
      ? `${Posts.catDisplay(state.category)} · ${posts.length}편`
      : `${allPosts.length}편`;

    if (!posts.length) {
      bodyEl.innerHTML = `<div class="empty-state"><p>이 카테고리에는 아직 글이 없어요.</p></div>`;
      return;
    }

    bodyEl.innerHTML = groupByYear(posts)
      .map(
        ([year, list]) => `
      <section class="archive-year">
        <h2 class="archive-year-label">${year}<span class="archive-year-count">${list.length}편</span></h2>
        <ul class="archive-list">
          ${list
            .map(
              (p) => `
            <li>
              <a class="archive-row" href="/post.html?slug=${encodeURIComponent(p.slug)}">
                <span class="archive-date">${monthDay(p.date)}</span>
                <span class="archive-title">${esc(p.title)}</span>
                <span class="archive-cat">${esc(Posts.catDisplay(p.category))}</span>
              </a>
            </li>`
            )
            .join("")}
        </ul>
      </section>`
      )
      .join("");
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
    countEl.textContent = "";
    bodyEl.innerHTML = `<div class="empty-state"><p>글 목록을 불러오지 못했어요.<br>${esc(err.message)}</p></div>`;
  }
})();
