// @ts-check
// 좌측 서랍 메뉴 — 헤더의 ☰ 를 누르면 왼쪽에서 밀려 나온다.
//
// 헤더 가로줄에 메뉴를 다 넣으면 폭이 모자란다(태그 메뉴를 더했을 때 실제로
// 넘쳤다). 서랍은 그 압력을 없애는 동시에, 가로줄에는 못 넣던 것 —
// 카테고리를 상위/하위로 펼친 목차 — 를 보여준다.
//
// 카테고리 목록은 index.json 에서 온다. 못 읽어도 서랍 자체는 열려야 하므로
// 링크를 먼저 그리고 목차는 나중에 채운다.
const Menu = (() => {
  let drawer, scrim, btn, closeBtn, lastFocus;

  const PAGES = [
    { href: "/", label: "index", match: /^\/(index\.html)?$/ },
    { href: "/archive.html", label: "archive", match: /^\/archive\.html$/ },
    { href: "/tags.html", label: "tags", match: /^\/tags\.html$/ },
    { href: "/admin.html", label: "write", match: /^\/admin\.html$/ },
  ];

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );

  const pad2 = (n) => String(n).padStart(2, "0");

  function build() {
    scrim = document.createElement("div");
    scrim.className = "drawer-scrim";

    drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.id = "drawer";
    drawer.setAttribute("aria-label", "메뉴");
    drawer.innerHTML = `
      <div class="drawer-head">
        <span class="drawer-title">MENU</span>
        <button class="drawer-close" aria-label="메뉴 닫기">✕</button>
      </div>
      <nav class="drawer-nav">
        ${PAGES.map(
          (p) =>
            `<a href="${p.href}" class="${p.match.test(location.pathname) ? "here" : ""}">${p.label}</a>`
        ).join("")}
      </nav>
      <div class="drawer-tree" id="drawer-tree"></div>`;

    document.body.append(scrim, drawer);
    closeBtn = drawer.querySelector(".drawer-close");

    scrim.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    btn.addEventListener("click", () => (isOpen() ? close() : open()));

    // 서랍 안에서 링크를 누르면 어차피 페이지가 바뀌지만, 같은 주소면
    // 아무 일도 안 일어난 것처럼 보인다 — 닫아 준다.
    drawer.addEventListener("click", (e) => {
      if (/** @type {Element} */ (e.target).closest("a")) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) close();
    });
  }

  const isOpen = () => drawer.classList.contains("open");

  function open() {
    lastFocus = document.activeElement;
    drawer.classList.add("open");
    scrim.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("drawer-open");
    closeBtn.focus();
  }

  function close() {
    drawer.classList.remove("open");
    scrim.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
    // 열기 전 자리로 초점을 돌려놔야 키보드로 쓰던 흐름이 끊기지 않는다
    if (lastFocus && document.contains(lastFocus)) /** @type {HTMLElement} */ (lastFocus).focus();
  }

  /** 상위 카테고리 아래 하위를 들여 쓴 목차. 티스토리식 카테고리 트리. */
  function renderTree(posts) {
    const treeEl = document.getElementById("drawer-tree");
    if (!treeEl) return;

    const tops = Posts.categories(posts);
    if (!tops.length) return;

    treeEl.innerHTML =
      `<div class="drawer-title">CATEGORY</div>` +
      tops
        .map(([top, count]) => {
          const fresh = posts.some(
            (p) => Posts.topOf(p.category) === top && Posts.isNew(p.date)
          );
          const subs = Posts.subcategories(posts, top);
          return `
      <div class="tree-group">
        <a class="tree-top" href="/archive.html?cat=${encodeURIComponent(top)}">
          <span class="name">${esc(top)}</span>
          ${fresh ? `<span class="badge-new">NEW</span>` : ""}
          <span class="count">${pad2(count)}</span>
        </a>
        ${subs
          .map(
            ([child, n]) => `
        <a class="tree-sub" href="/archive.html?cat=${encodeURIComponent(top + "/" + child)}">
          <span class="name">${esc(child)}</span>
          <span class="count">${pad2(n)}</span>
        </a>`
          )
          .join("")}
      </div>`;
        })
        .join("");
  }

  async function init() {
    btn = document.getElementById("menu-btn");
    if (!btn) return; // 캐시된 예전 HTML이면 버튼이 없다 — 조용히 넘어간다
    build();

    // 목차는 있으면 좋은 것이지 서랍의 전제가 아니다. 실패해도 링크는 남는다.
    try {
      if (typeof Posts !== "undefined") renderTree(Posts.published(await Posts.load()));
    } catch (_) {
      /* 목차만 빠진다 */
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  return { open, close };
})();
