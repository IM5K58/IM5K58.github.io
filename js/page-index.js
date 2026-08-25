// @ts-check
// index.html 진입점: 목록 렌더 + 검색/카테고리/태그 필터
(async () => {
  const listEl = document.getElementById("post-list");
  const tabsEl = document.getElementById("category-tabs");
  const subTabsEl = document.getElementById("subcategory-tabs");
  const statsEl = document.getElementById("hero-stats");
  const searchEl = /** @type {HTMLInputElement} */ (document.getElementById("search-input"));
  const tagBarEl = document.getElementById("active-tag-bar");
  const tagNameEl = document.getElementById("active-tag-name");

  const state = { query: "", category: "", tag: "" };
  let allPosts = [];

  // 속성 값 안에서도 안전하도록 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 " 를 그대로 흘려보내서, 제목에 따옴표가
  // 하나만 있어도 data-*/href/src 속성이 끊기고 마크업이 깨진다.
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  // 선택 상태를 색으로만 알리면 스크린리더에서는 어느 필터가 켜졌는지 알 수 없다
  const tab = (label, value, count, active) => `
    <button class="tab ${active ? "active" : ""}" aria-pressed="${active ? "true" : "false"}" data-category="${esc(value)}">
      ${esc(label)}${count != null ? `<span class="count">${String(count).padStart(2, "0")}</span>` : ""}
    </button>`;

  function renderStats() {
    const s = Posts.stats(allPosts);
    statsEl.innerHTML = `
      <span>ENTRIES ${Posts.num(s.entries)}</span>
      <span>CATEGORIES ${String(s.categories).padStart(2, "0")}</span>
      <span>UPDATED ${esc(s.updated)}</span>`;
  }

  function renderTabs() {
    const cats = Posts.categories(allPosts); // 상위 카테고리 (하위 글 수 포함)
    const activeTop = state.category ? Posts.topOf(state.category) : "";
    tabsEl.innerHTML =
      tab("ALL", "", allPosts.length, !state.category) +
      cats.map(([c, n]) => tab(c, c, n, activeTop === c)).join("");
    renderSubTabs();
  }

  // 선택된 상위 카테고리에 하위가 있으면 두 번째 탭 줄 표시
  function renderSubTabs() {
    const top = state.category ? Posts.topOf(state.category) : "";
    const subs = top ? Posts.subcategories(allPosts, top) : [];
    if (!subs.length) {
      subTabsEl.innerHTML = "";
      return;
    }
    subTabsEl.innerHTML =
      tab("ALL", top, null, state.category === top) +
      subs
        .map(([child, n]) => tab(child, `${top}/${child}`, n, state.category === `${top}/${child}`))
        .join("");
  }

  function renderList() {
    const posts = Posts.filter(allPosts, state);
    if (!posts.length) {
      listEl.innerHTML = `
        <div class="empty-state">${
          allPosts.length ? "조건에 맞는 글이 없습니다" : "아직 작성된 글이 없습니다"
        }</div>`;
      return;
    }
    // 카드는 <a>가 아니라 <article>이다. 태그 칩이 버튼이라, 링크 안에 버튼을
    // 넣으면 유효하지 않은 HTML이 된다(인터랙티브 요소 중첩). 대신 제목 링크가
    // ::after로 카드 전체를 덮어 클릭 범위를 유지하고, 태그 칩은 그 위로 올린다.
    listEl.innerHTML = posts
      .map(
        (p, i) => `
      <article class="post-card" style="--cat-hue: ${Posts.catHue(p.category)}">
        <div class="body">
          <div class="meta">
            <span class="index">${Posts.num(p.index)}</span>
            <span class="category">${esc(Posts.catDisplay(p.category))}</span>
            <span class="date">${Posts.formatDate(p.date)}</span>
            ${Posts.isNew(p.date) ? `<span class="badge-new">NEW</span>` : ""}
          </div>
          <div class="content">
            <h2><a class="card-link" href="${Posts.url(p.slug)}">${esc(p.title)}</a></h2>
            <p class="summary">${esc(p.summary || "")}</p>
            ${
              (p.tags || []).length
                ? `<div class="tags">${p.tags
                    .map((t) => `<button class="tag-chip" data-tag="${esc(t)}">#${esc(t)}</button>`)
                    .join("")}</div>`
                : ""
            }
          </div>
        </div>
        ${
          p.thumbnail
            ? // 첫 카드 그림은 화면에 바로 보인다 — lazy를 걸면 오히려 늦게 뜬다
              `<img class="figure" src="${esc(p.thumbnail)}" alt=""${
                i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'
              }>`
            : ""
        }
      </article>`
      )
      .join("");
  }

  function syncTagBar() {
    tagBarEl.classList.toggle("show", !!state.tag);
    if (state.tag) tagNameEl.textContent = `#${state.tag}`;
  }

  // ---------- 이벤트 ----------
  let debounce;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = searchEl.value;
      renderList();
    }, 150);
  });

  const onTabClick = (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    state.category = btn.dataset.category;
    renderTabs();
    renderList();
  };
  tabsEl.addEventListener("click", onTabClick);
  subTabsEl.addEventListener("click", onTabClick);

  // 태그 칩은 이제 링크 바깥에 있어서 이동을 막을 필요가 없다 (덮개 위로 올라와 있다)
  listEl.addEventListener("click", (e) => {
    const chip = /** @type {HTMLElement|null} */ (
      /** @type {Element} */ (e.target).closest("[data-tag]")
    );
    if (!chip) return;
    state.tag = chip.dataset.tag;
    syncTagBar();
    renderList();
  });

  document.getElementById("clear-tag").addEventListener("click", () => {
    state.tag = "";
    syncTagBar();
    renderList();
  });

  // ---------- 초기화 ----------
  try {
    allPosts = Posts.published(await Posts.load());
    renderStats();
    renderTabs();
    renderList();
  } catch (err) {
    // 캐시 때문에 예전 HTML이 새 스크립트와 함께 뜨면 여기 요소들이 없을 수 있다.
    // 그때 오류 처리까지 같이 죽으면 "불러오는 중"에서 멈춰 버리므로 ?. 로 넘긴다.
    if (statsEl) statsEl.innerHTML = "";
    if (listEl) {
      listEl.innerHTML = `
        <div class="empty-state">글 목록을 불러오지 못했습니다 · ${esc(err.message)}</div>`;
    }
  }
})();
