// index.html 진입점: 목록 렌더 + 검색/카테고리/태그 필터
(async () => {
  const listEl = document.getElementById("post-list");
  const tabsEl = document.getElementById("category-tabs");
  const searchEl = document.getElementById("search-input");
  const tagBarEl = document.getElementById("active-tag-bar");
  const tagNameEl = document.getElementById("active-tag-name");

  const state = { query: "", category: "", tag: "" };
  let allPosts = [];

  function esc(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
  }

  function renderTabs() {
    const cats = Posts.categories(allPosts);
    const tab = (label, value, count) => `
      <button class="tab ${state.category === value ? "active" : ""}" data-category="${esc(value)}">
        ${esc(label)}${count != null ? `<span class="count">${count}</span>` : ""}
      </button>`;
    tabsEl.innerHTML =
      tab("전체", "", allPosts.length) +
      cats.map(([c, n]) => tab(c, c, n)).join("");
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
      <a class="post-card" href="/post.html?slug=${encodeURIComponent(p.slug)}">
        <div class="body">
          <div class="meta">
            <span class="category">${esc(p.category || "미분류")}</span>
            <span>·</span>
            <span>${Posts.formatDate(p.date)}</span>
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
        </div>
        ${p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="" loading="lazy">` : ""}
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

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    state.category = btn.dataset.category;
    renderTabs();
    renderList();
  });

  listEl.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tag]");
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
