// @ts-check
// index.html 진입점: 목록 렌더 + 검색/카테고리/태그 필터
(async () => {
  const listEl = document.getElementById("post-list");
  const tabsEl = document.getElementById("category-tabs");
  const subTabsEl = document.getElementById("subcategory-tabs");
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

  const tab = (label, value, count, active) => `
    <button class="tab ${active ? "active" : ""}" data-category="${esc(value)}">
      ${esc(label)}${count != null ? `<span class="count">${count}</span>` : ""}
    </button>`;

  function renderTabs() {
    const cats = Posts.categories(allPosts); // 상위 카테고리 (하위 글 수 포함)
    const activeTop = state.category ? Posts.topOf(state.category) : "";
    tabsEl.innerHTML =
      tab("전체", "", allPosts.length, !state.category) +
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
      tab("전체", top, null, state.category === top) +
      subs
        .map(([child, n]) => tab(child, `${top}/${child}`, n, state.category === `${top}/${child}`))
        .join("");
  }

  function renderList() {
    const posts = Posts.filter(allPosts, state);
    if (!posts.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>${allPosts.length ? "조건에 맞는 글이 없어요." : "아직 작성된 글이 없어요."}</p>
        </div>`;
      return;
    }
    listEl.innerHTML = posts
      .map(
        (p) => `
      <a class="post-card" style="--cat-hue: ${Posts.catHue(p.category)}" href="/post.html?slug=${encodeURIComponent(p.slug)}">
        <div class="body">
          <div class="meta">
            <span class="category">${esc(Posts.catDisplay(p.category))}</span>
            <span class="meta-sep">·</span>
            <span>${Posts.formatDate(p.date)}</span>
            ${Posts.isNew(p.date) ? `<span class="badge-new">New</span>` : ""}
          </div>
          <h2>${esc(p.title)}</h2>
          <p class="summary">${esc(p.summary || "")}</p>
          ${
            (p.tags || []).length
              ? `<div class="tags">${p.tags
                  .map((t) => `<button class="tag-chip" data-tag="${esc(t)}">${esc(t)}</button>`)
                  .join("")}</div>`
              : ""
          }
          <span class="card-cta">글 읽기<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
        </div>
        ${
          p.thumbnail
            ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="" loading="lazy">`
            : `<span class="thumb thumb-empty" aria-hidden="true">${esc(Posts.topOf(p.category).slice(0, 2))}</span>`
        }
      </a>`
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

  listEl.addEventListener("click", (e) => {
    const chip = /** @type {HTMLElement|null} */ (
      /** @type {Element} */ (e.target).closest("[data-tag]")
    );
    if (!chip) return;
    e.preventDefault(); // 카드 링크 이동 막고 태그 필터 적용
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
    renderTabs();
    renderList();
  } catch (err) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>글 목록을 불러오지 못했어요.<br>${esc(err.message)}</p>
      </div>`;
  }
})();
