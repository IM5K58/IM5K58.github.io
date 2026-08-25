// @ts-check
// tags.html 진입점: 태그 목록을 한눈에 보여주고, 고른 태그의 글을 표로 내린다.
// 아무것도 안 고르면 전체 글을 보여준다 — 아래가 비면 화면 절반이 죽는다.
(async () => {
  const cloudEl = document.getElementById("tag-cloud");
  const bodyEl = document.getElementById("tag-body");
  const countEl = document.getElementById("tag-count");

  // ui.js 를 못 읽으면(캐시된 예전 HTML에 새 스크립트가 얹힌 경우) 아래가 전부
  // 죽어서 빈 화면만 남는다. 무엇을 해야 하는지라도 알린다.
  if (typeof UI === "undefined") {
    if (bodyEl) bodyEl.innerHTML =
      '<div class="empty-state">화면을 새로 고쳐 주세요 (Ctrl+Shift+R)</div>';
    return;
  }

  // 글 상세의 TAGS 줄에서 넘어올 수 있게 ?tag= 을 받는다
  const state = { tag: new URLSearchParams(location.search).get("tag") || "" };
  let allPosts = [];

  function render() {
    const all = Posts.tags(allPosts);
    cloudEl.innerHTML =
      UI.chip("ALL", "", allPosts.length, !state.tag, "data-tag") +
      all.map(([t, n]) => UI.chip(`#${t}`, t, n, state.tag === t, "data-tag")).join("");

    const posts = state.tag ? Posts.filter(allPosts, { tag: state.tag }) : allPosts;
    countEl.textContent = state.tag
      ? `#${state.tag} · ${Posts.num(posts.length)}`
      : `${Posts.num(all.length)} TAGS · ${Posts.num(allPosts.length)} ENTRIES`;

    bodyEl.innerHTML = posts.length
      ? UI.postTable(posts)
      : UI.empty("이 태그가 붙은 글이 없습니다");

    // 주소를 상태에 맞춰 둔다 — 이 화면은 링크로 건네주기 위한 곳이라
    // 지금 보고 있는 것이 주소에 그대로 담겨야 한다. 뒤로가기는 남기지 않는다.
    const url = state.tag ? `?tag=${encodeURIComponent(state.tag)}` : location.pathname;
    history.replaceState(null, "", url);
  }

  cloudEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tag]");
    if (!btn) return;
    state.tag = btn.dataset.tag;
    render();
  });

  try {
    allPosts = Posts.published(await Posts.load());
    render();
  } catch (err) {
    if (countEl) countEl.textContent = "";
    UI.fail(bodyEl, err);
  }
})();
