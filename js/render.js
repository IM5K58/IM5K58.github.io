// 마크다운 → 안전한 HTML 렌더 파이프라인 + frontmatter 파서
const Render = (() => {
  // frontmatter: 문서 맨 앞의 --- ... --- 블록. key: value 단순 문법만 지원.
  function parseFrontmatter(md) {
    const meta = {};
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta, body: md };

    m[1].split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (!key) return;

      if (key === "tags") {
        // tags: [a, b] 또는 tags: a, b
        value = value.replace(/^\[|\]$/g, "");
        meta.tags = value
          .split(",")
          .map((t) => t.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        return;
      }
      if (value === "true" || value === "false") {
        meta[key] = value === "true";
        return;
      }
      if (value.startsWith('"')) {
        try {
          meta[key] = JSON.parse(value);
          return;
        } catch (_) {
          /* 그대로 문자열 처리 */
        }
      }
      meta[key] = value.replace(/^["']|["']$/g, "");
    });
    return { meta, body: md.slice(m[0].length) };
  }

  // 글 저장 시 사용할 frontmatter 문자열 생성 (admin에서 사용)
  function buildFrontmatter(meta) {
    const lines = ["---"];
    lines.push(`title: ${JSON.stringify(meta.title)}`);
    lines.push(`date: ${meta.date}`);
    lines.push(`updated: ${meta.updated}`);
    lines.push(`category: ${meta.category}`);
    lines.push(`tags: [${(meta.tags || []).join(", ")}]`);
    lines.push(`summary: ${JSON.stringify(meta.summary || "")}`);
    if (meta.thumbnail) lines.push(`thumbnail: ${meta.thumbnail}`);
    lines.push(`draft: ${!!meta.draft}`);
    lines.push("---");
    return lines.join("\n");
  }

  // 마크다운 본문 → sanitize된 HTML. 반드시 이 함수를 거쳐서만 innerHTML에 넣는다.
  // (XSS = localStorage의 GitHub 토큰 탈취로 직결되므로 sanitize 생략 금지)
  function toHtml(mdBody) {
    marked.setOptions({ gfm: true, breaks: true });
    const raw = marked.parse(mdBody);
    return DOMPurify.sanitize(raw);
  }

  // 렌더 후처리: 코드 하이라이팅 + 외부 링크 새 탭
  function enhance(rootEl) {
    rootEl.querySelectorAll("pre code").forEach((el) => {
      if (window.hljs) hljs.highlightElement(el);
    });
    rootEl.querySelectorAll("a[href^='http']").forEach((a) => {
      if (a.host !== location.host) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });
  }

  return { parseFrontmatter, buildFrontmatter, toHtml, enhance };
})();
