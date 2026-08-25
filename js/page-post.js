// @ts-check
// post.html 진입점: ?slug= 글을 fetch → 렌더 → giscus 로드
(async () => {
  const crumbEl = document.getElementById("post-crumb");
  const headEl = document.getElementById("post-head");
  const specEl = document.getElementById("post-spec");
  const navEl = document.getElementById("post-nav");
  const bodyEl = document.getElementById("post-body");
  const loadingEl = document.getElementById("post-loading");

  // 두 경로로 들어온다: 생성된 껍데기(/p/<slug>.html, body[data-slug])와
  // 예전 주소(post.html?slug=). 껍데기가 아직 없을 때 404가 되돌려 보내는 곳이라
  // 쿼리 방식도 계속 살려 둔다.
  const slug =
    new URLSearchParams(location.search).get("slug") || document.body.dataset.slug || "";

  // 속성 값 안에서도 안전하도록 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 " 를 그대로 흘려보내서, 제목에 따옴표가
  // 하나만 있어도 data-*/href/src 속성이 끊기고 마크업이 깨진다.
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  // 예전 HTML이 캐시에서 뜨면 요소가 없을 수 있다 — 오류 처리까지 죽지 않게 한다
  function fail(msg) {
    if (!loadingEl) return;
    loadingEl.innerHTML = `${esc(msg)}<br><br><a href="/">← 목록으로</a>`;
  }

  if (!slug) {
    fail("잘못된 주소입니다 (slug 없음)");
    return;
  }

  const specRow = (label, value, weak) =>
    `<div class="spec-row"><dt>${label}</dt><dd${weak ? ' class="weak"' : ""}>${value}</dd></div>`;

  try {
    const res = await fetch(`/posts/${encodeURIComponent(slug)}.md?v=${Date.now()}`, {
      cache: "no-cache",
    });
    if (!res.ok) throw new Error("글을 찾을 수 없습니다");
    const md = await res.text();

    const { meta, body } = Render.parseFrontmatter(md);
    const title = meta.title || slug;

    document.title = `${title} — ${CONFIG.blogTitle}`;

    // 색인 정보(번호·이전/다음 글)는 index.json에서 온다. 없어도 본문은 보여야
    // 하므로 실패를 삼키고 조판 장치만 생략한다.
    let place = { index: 0, prev: null, next: null };
    try {
      place = Posts.neighbors(Posts.published(await Posts.load()), slug);
    } catch (_) {
      /* 색인을 못 읽으면 번호와 이전/다음 글만 빠진다 */
    }

    const catPath = meta.category || "미분류";
    const hue = Posts.catHue(catPath);

    crumbEl.innerHTML =
      `<a href="/">index</a>` +
      catPath
        .split("/")
        .map(
          (seg, i, arr) =>
            `<span class="sep">/</span><a href="/archive.html?cat=${encodeURIComponent(
              arr.slice(0, i + 1).join("/")
            )}">${esc(seg)}</a>`
        )
        .join("") +
      `<span class="sep">/</span><span class="here">${esc(slug)}</span>`;

    headEl.style.setProperty("--cat-hue", String(hue));
    headEl.innerHTML = `
      <div class="label-row">
        ${place.index ? `<span class="index">${Posts.num(place.index)}</span>` : ""}
        <span class="category">${esc(Posts.catDisplay(catPath))}</span>
      </div>
      <h1>${esc(title)}</h1>`;

    const edited = meta.updated && meta.updated !== meta.date;
    specEl.innerHTML =
      specRow("WRITTEN", Posts.formatDateTime(meta.date) || "—") +
      (edited ? specRow("UPDATED", Posts.formatDateTime(meta.updated)) : "") +
      ((meta.tags || []).length
        ? specRow("TAGS", meta.tags.map((t) => `#${esc(t)}`).join("&nbsp; "))
        : "") +
      (meta.source
        ? specRow(
            "SOURCE",
            esc(meta.source) + (meta.syncVersion ? ` · sync v${esc(meta.syncVersion)}` : ""),
            true
          )
        : "") +
      (meta.draft ? specRow("STATE", `<span class="badge-draft">DRAFT</span>`) : "");

    bodyEl.innerHTML = Render.toHtml(body);
    Render.enhance(bodyEl);

    // 색인 순서상의 앞/뒤 글. 한쪽이 없으면 빈 칸을 둬서 좌우가 헷갈리지 않게 한다.
    const navCard = (p, dir, label) =>
      p
        ? `<a class="${dir}" href="${Posts.url(p.slug)}">
             <span class="dir">${label}</span>
             <span class="name">${esc(p.title)}</span>
           </a>`
        : `<span class="blank"></span>`;
    if (place.prev || place.next) {
      navEl.innerHTML =
        navCard(place.prev, "prev", `← PREV ${Posts.num(place.index - 1)}`) +
        navCard(place.next, "next", `NEXT ${Posts.num(place.index + 1)} →`);
    }

    loadingEl.remove();
    document.getElementById("post-footer").style.display = "";

    loadGiscus();
  } catch (err) {
    fail(err.message);
  }

  function loadGiscus() {
    const g = CONFIG.giscus;
    if (!g.enabled || !g.repoId || !g.categoryId) return;

    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    // mapping=specific + term=slug: URL 구조가 바뀌어도 댓글이 유지된다
    Object.entries({
      "data-repo": g.repo,
      "data-repo-id": g.repoId,
      "data-category": g.category,
      "data-category-id": g.categoryId,
      "data-mapping": "specific",
      "data-term": slug,
      "data-reactions-enabled": "1",
      "data-input-position": "top",
      "data-theme": Theme.current() === "dark" ? "dark" : "light",
      "data-lang": "ko",
      crossorigin: "anonymous",
    }).forEach(([k, v]) => script.setAttribute(k, v));
    script.async = true;
    document.getElementById("comments").appendChild(script);
  }
})();
