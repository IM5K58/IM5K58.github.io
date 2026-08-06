// post.html 진입점: ?slug= 글을 fetch → 렌더 → giscus 로드
(async () => {
  const headEl = document.getElementById("post-head");
  const bodyEl = document.getElementById("post-body");
  const loadingEl = document.getElementById("post-loading");

  const slug = new URLSearchParams(location.search).get("slug");

  function esc(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
  }

  function fail(msg) {
    loadingEl.innerHTML = `${esc(msg)}<br><br><a class="back-link" href="/">← 목록으로</a>`;
  }

  if (!slug) {
    fail("잘못된 주소예요. (slug 없음)");
    return;
  }

  try {
    const res = await fetch(`/posts/${encodeURIComponent(slug)}.md?v=${Date.now()}`, {
      cache: "no-cache",
    });
    if (!res.ok) throw new Error("글을 찾을 수 없어요.");
    const md = await res.text();

    const { meta, body } = Render.parseFrontmatter(md);
    const title = meta.title || slug;

    document.title = `${title} — ${CONFIG.blogTitle}`;

    headEl.innerHTML = `
      <div class="category">${esc(Posts.catDisplay(meta.category))}</div>
      <h1>${esc(title)}</h1>
      <div class="meta">
        <span>${Posts.formatDate(meta.date)}</span>
        ${
          meta.updated && meta.updated !== meta.date
            ? `<span>·</span><span>수정 ${Posts.formatDate(meta.updated)}</span>`
            : ""
        }
        ${meta.draft ? `<span class="badge-draft">임시글</span>` : ""}
      </div>
      ${
        (meta.tags || []).length
          ? `<div class="tags">${meta.tags
              .map((t) => `<span class="tag-chip">${esc(t)}</span>`)
              .join("")}</div>`
          : ""
      }
      <hr class="divider">`;

    bodyEl.innerHTML = Render.toHtml(body);
    Render.enhance(bodyEl);

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
