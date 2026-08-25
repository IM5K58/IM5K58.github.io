// @ts-check
// 목록 화면 세 곳(홈·아카이브·태그)이 함께 쓰는 조각들.
//
// 모듈(ESM)로 쪼개지 않고 Posts/Render/Theme 와 같은 전역 객체 방식을 쓴다.
// 설계 기록에는 "세 번째 목록 페이지가 생기면 공통화하려면 모듈이 필요하다"고
// 적어 뒀지만, 실제로 와서 보니 그 전제가 틀렸다 — 이 파일 하나로 끝난다.
// 빌드가 없다는 게 이 저장소의 가장 큰 자산이라 그 값을 치를 이유가 없다.
const UI = (() => {
  // 속성 값 안에서도 안전하도록 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 " 를 그대로 흘려보내서, 제목에 따옴표가
  // 하나만 있어도 data-*/href/src 속성이 끊기고 마크업이 깨진다.
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  const pad2 = (n) => String(n).padStart(2, "0");

  /**
   * 필터 칩 하나. 선택 상태를 색으로만 알리면 스크린리더로는 알 수 없어
   * aria-pressed 를 함께 낸다.
   */
  function chip(label, value, count, active, attr = "data-category") {
    return `
    <button class="tab ${active ? "active" : ""}" aria-pressed="${active ? "true" : "false"}" ${attr}="${esc(value)}">
      ${esc(label)}${count != null ? `<span class="count">${pad2(count)}</span>` : ""}
    </button>`;
  }

  /** 상위 카테고리 줄 + (선택된 상위에 하위가 있으면) 하위 줄 */
  function renderCategoryTabs(tabsEl, subTabsEl, posts, category) {
    const activeTop = category ? Posts.topOf(category) : "";
    tabsEl.innerHTML =
      chip("ALL", "", posts.length, !category) +
      Posts.categories(posts)
        .map(([c, n]) => chip(c, c, n, activeTop === c))
        .join("");

    if (!subTabsEl) return;
    const subs = activeTop ? Posts.subcategories(posts, activeTop) : [];
    subTabsEl.innerHTML = subs.length
      ? chip("ALL", activeTop, null, category === activeTop) +
        subs
          .map(([c, n]) => chip(c, `${activeTop}/${c}`, n, category === `${activeTop}/${c}`))
          .join("")
      : "";
  }

  /** 같은 해에 쓴 글끼리 묶는다 (최신 연도가 위) */
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
    return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  }

  /** 연도별로 묶은 글 표. 아카이브와 태그 화면이 같은 표를 쓴다. */
  function postTable(posts) {
    return `<div class="archive-wrap">${groupByYear(posts)
      .map(
        ([year, list]) => `
      <section class="archive-year">
        <h2 class="archive-year-label">${year}<span class="archive-year-count">${pad2(
          list.length
        )} ENTRIES</span></h2>
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

  function empty(message) {
    return `<div class="empty-state">${esc(message)}</div>`;
  }

  /** 캐시된 예전 HTML이 새 스크립트와 뜨면 요소가 없을 수 있다 — 오류 처리까지 죽지 않게 */
  function fail(el, err) {
    if (el) el.innerHTML = empty(`글 목록을 불러오지 못했습니다 · ${err.message}`);
  }

  return { esc, pad2, chip, renderCategoryTabs, groupByYear, monthDay, postTable, empty, fail };
})();
