// @ts-check
// archive.html 진입점: 전체 글을 연도별로 묶어 표로 보여주고 카테고리로 걸러낸다.
// 탭·표·이스케이프는 목록 화면 셋이 함께 쓰는 것이라 ui.js 에 있다.
(async () => {
  const bodyEl = document.getElementById("archive-body");
  const countEl = document.getElementById("archive-count");
  const tabsEl = document.getElementById("category-tabs");
  const subTabsEl = document.getElementById("subcategory-tabs");

  // ui.js 를 못 읽으면(캐시된 예전 HTML에 새 스크립트가 얹힌 경우) 아래가 전부
  // 죽어서 빈 화면만 남는다. 무엇을 해야 하는지라도 알린다.
  if (typeof UI === "undefined") {
    if (bodyEl) bodyEl.innerHTML =
      '<div class="empty-state">화면을 새로 고쳐 주세요 (Ctrl+Shift+R)</div>';
    return;
  }

  // 글 상세의 위치 표시(index / ai / …)에서 넘어올 수 있게 ?cat= 을 받는다
  const state = { category: new URLSearchParams(location.search).get("cat") || "" };
  let allPosts = [];

  function render() {
    UI.renderCategoryTabs(tabsEl, subTabsEl, allPosts, state.category);

    const posts = Posts.filter(allPosts, { category: state.category });
    countEl.textContent = state.category
      ? `${Posts.catDisplay(state.category)} · ${Posts.num(posts.length)}`
      : `TOTAL ${Posts.num(posts.length)}`;

    bodyEl.innerHTML = posts.length
      ? UI.postTable(posts)
      : UI.empty("이 카테고리에는 아직 글이 없습니다");
  }

  const onTabClick = (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    state.category = btn.dataset.category;
    render();
  };
  tabsEl.addEventListener("click", onTabClick);
  subTabsEl.addEventListener("click", onTabClick);

  try {
    allPosts = Posts.published(await Posts.load());
    render();
  } catch (err) {
    if (countEl) countEl.textContent = "";
    UI.fail(bodyEl, err);
  }
})();
