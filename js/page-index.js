// @ts-check
// index.html 진입점: 카드 목록 렌더 + 검색/카테고리/태그 필터.
// 탭·이스케이프는 목록 화면 셋이 함께 쓰는 것이라 ui.js 에 있다.
(async () => {
  const listEl = document.getElementById("post-list");
  const tabsEl = document.getElementById("category-tabs");
  const subTabsEl = document.getElementById("subcategory-tabs");
  const statsEl = document.getElementById("hero-stats");
  const searchEl = /** @type {HTMLInputElement} */ (document.getElementById("search-input"));
  const tagBarEl = document.getElementById("active-tag-bar");
  const tagNameEl = document.getElementById("active-tag-name");

  // ui.js 를 못 읽으면(캐시된 예전 HTML에 새 스크립트가 얹힌 경우) 아래가 전부
  // 죽어서 빈 화면만 남는다. 무엇을 해야 하는지라도 알린다.
  if (typeof UI === "undefined") {
    if (listEl) listEl.innerHTML =
      '<div class="empty-state">화면을 새로 고쳐 주세요 (Ctrl+Shift+R)</div>';
    return;
  }

  const state = { query: "", category: "", tag: "" };
  let allPosts = [];
  const esc = UI.esc;

  function renderStats() {
    const s = Posts.stats(allPosts);
    statsEl.innerHTML = `
      <span>ENTRIES ${Posts.num(s.entries)}</span>
      <span>CATEGORIES ${UI.pad2(s.categories)}</span>
      <span>UPDATED ${esc(s.updated)}</span>`;
  }

  function renderList() {
    const posts = Posts.filter(allPosts, state);
    if (!posts.length) {
      listEl.innerHTML = UI.empty(
        allPosts.length ? "조건에 맞는 글이 없습니다" : "아직 작성된 글이 없습니다"
      );
      return;
    }
    // 카드는 <a>가 아니라 <article>이다. 태그 칩이 버튼이라, 링크 안에 버튼을
    // 넣으면 유효하지 않은 HTML이 된다(인터랙티브 요소 중첩). 대신 제목 링크가
    // ::after로 카드 전체를 덮어 클릭 범위를 유지하고, 태그 칩은 그 위로 올린다.
    //
    // 메타 줄은 본문이 아니라 카드 전체 폭에 걸친다. 본문 안에 두면 썸네일이
    // 있는 카드에서만 줄이 짧아져 NEW 가 카드마다 다른 자리에 놓인다.
    listEl.innerHTML = posts
      .map(
        (p, i) => `
      <article class="post-card" style="--cat-hue: ${Posts.catHue(p.category)}">
        <div class="meta">
          <span class="category">${esc(Posts.catDisplay(p.category))}</span>
          <span class="date">${Posts.formatDate(p.date)}</span>
          ${Posts.isNew(p.date) ? `<span class="badge-new">NEW</span>` : ""}
        </div>
        <div class="row">
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
          ${
            p.thumbnail
              ? // 첫 카드 그림은 화면에 바로 보인다 — lazy를 걸면 오히려 늦게 뜬다
                `<img class="figure" src="${esc(p.thumbnail)}" alt=""${
                  i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'
                }>`
              : ""
          }
        </div>
      </article>`
      )
      .join("");
  }

  function syncTagBar() {
    tagBarEl.classList.toggle("show", !!state.tag);
    if (state.tag) {
      tagNameEl.textContent = `#${state.tag}`;
      tagNameEl.setAttribute("href", `/tags.html?tag=${encodeURIComponent(state.tag)}`);
    }
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
    UI.renderCategoryTabs(tabsEl, subTabsEl, allPosts, state.category);
    renderList();
  };
  tabsEl.addEventListener("click", onTabClick);
  subTabsEl.addEventListener("click", onTabClick);

  // 태그 칩은 링크 바깥에 있어서 이동을 막을 필요가 없다 (덮개 위로 올라와 있다)
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
    UI.renderCategoryTabs(tabsEl, subTabsEl, allPosts, state.category);
    renderList();
  } catch (err) {
    // 캐시 때문에 예전 HTML이 새 스크립트와 함께 뜨면 여기 요소들이 없을 수 있다.
    // 그때 오류 처리까지 같이 죽으면 "불러오는 중"에서 멈춰 버린다.
    if (statsEl) statsEl.innerHTML = "";
    UI.fail(listEl, err);
  }
})();
