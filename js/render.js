// @ts-check
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

  // ---------- 수식 (KaTeX) ----------
  // marked 토크나이저 확장이라 코드블록/인라인코드 안의 $는 건드리지 않는다
  let markedReady = false;
  function configureMarked() {
    if (markedReady) return;
    markedReady = true;
    marked.setOptions({ gfm: true, breaks: true });
    if (!window.katex) return; // katex를 로드하지 않는 페이지면 수식 확장 생략

    const tex = (src, displayMode) =>
      katex.renderToString(src, { displayMode, throwOnError: false });

    marked.use({
      extensions: [
        {
          name: "mathBlock",
          level: "block",
          start(src) {
            const i = src.indexOf("$$");
            return i === -1 ? undefined : i;
          },
          tokenizer(src) {
            const m = src.match(/^\$\$([\s\S]+?)\$\$(?:\n+|$)/);
            if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim() };
          },
          renderer(token) {
            return `<div class="math-block">${tex(token.text, true)}</div>\n`;
          },
        },
        {
          name: "mathInline",
          level: "inline",
          start(src) {
            const i = src.indexOf("$");
            return i === -1 ? undefined : i;
          },
          tokenizer(src) {
            // $ 바로 안쪽이 공백이면 수식으로 안 봄 ("$100 and $200" 오인 방지)
            const m = src.match(/^\$(?=\S)([^$\n]*?\S)\$/);
            if (m) return { type: "mathInline", raw: m[0], text: m[1] };
          },
          renderer(token) {
            return tex(token.text, false);
          },
        },
      ],
    });
  }

  // 마크다운 본문 → sanitize된 HTML. 반드시 이 함수를 거쳐서만 innerHTML에 넣는다.
  // (XSS = localStorage의 GitHub 토큰 탈취로 직결되므로 sanitize 생략 금지)
  function toHtml(mdBody) {
    configureMarked();
    const raw = marked.parse(mdBody);
    return DOMPurify.sanitize(raw);
  }

  // 렌더 후처리: 조판 장치(절 번호·도판·코드 머리줄·표 감싸기) + 링크 + 콜아웃.
  // 전부 DOM 조작이라 마크다운 원문에는 아무 글자도 들어가지 않는다 —
  // 노션에서 쓴 글이 그대로 왕복해야 하기 때문이다.
  function enhance(rootEl) {
    // 절 제목: 번호는 CSS 카운터가 붙이고, 규칙선은 제목 글자에만 깔려야 하므로
    // 글자를 span으로 감싼다 (h2 자체가 flex 컨테이너가 된다)
    rootEl.querySelectorAll("h2").forEach((h) => {
      if (h.querySelector(".h-text")) return;
      const span = document.createElement("span");
      span.className = "h-text";
      while (h.firstChild) span.append(h.firstChild);
      h.append(span);
    });

    // 단독 이미지 문단 → figure + figcaption(alt). 캡션 번호는 CSS 카운터.
    // 노션 동기화는 블록 캡션을 alt로 넣지만, 캡션이 없으면 "image"가 들어온다.
    // 그런 껍데기 alt는 캡션으로 쓰지 않고 번호만 남긴다.
    const GENERIC_ALT = /^(image|img|untitled|이미지|사진)$/i;
    rootEl.querySelectorAll("p > img").forEach((img) => {
      const p = img.parentElement;
      if (!p || p.children.length !== 1 || p.textContent.trim()) return;
      const alt = (img.getAttribute("alt") || "").trim();
      const fig = document.createElement("figure");
      const cap = document.createElement("figcaption");
      cap.textContent = GENERIC_ALT.test(alt) ? "" : alt;
      p.replaceWith(fig);
      fig.append(img, cap);
    });

    // 코드 블록: 언어 머리줄을 얹는다. 하이라이터가 class를 건드리기 전에 읽는다.
    rootEl.querySelectorAll("pre").forEach((pre) => {
      if (pre.parentElement?.classList.contains("code-block")) return;
      const code = pre.querySelector("code");
      const lang = code?.className.match(/language-([\w+#.-]+)/);
      const wrap = document.createElement("div");
      wrap.className = "code-block";
      pre.replaceWith(wrap);
      if (lang) {
        const head = document.createElement("div");
        head.className = "code-head";
        head.textContent = lang[1].toUpperCase();
        wrap.append(head);
      }
      wrap.append(pre);
    });

    // 표는 좁은 화면에서 가로로 넘치므로 자기 상자 안에서만 스크롤되게 감싼다
    rootEl.querySelectorAll("table").forEach((t) => {
      if (t.parentElement?.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      t.replaceWith(wrap);
      wrap.append(t);
    });

    rootEl.querySelectorAll("pre code").forEach((el) => {
      if (window.hljs) hljs.highlightElement(el);
    });
    rootEl.querySelectorAll("a[href^='http']").forEach((a) => {
      if (a.host !== location.host) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });

    // 콜아웃: "> [!NOTE] 내용" 형태의 인용구를 색상 박스로 변환.
    // 종류 표시는 색으로만 하고 라벨은 붙이지 않는다 (노션 원본에 없는 글자라서)
    rootEl.querySelectorAll("blockquote").forEach((bq) => {
      const first = bq.querySelector(":scope > p:first-child");
      if (!first) return;
      const m = first.textContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
      if (!m) return;

      first.innerHTML = first.innerHTML.replace(/^\s*\[!\w+\]\s*(<br\s*\/?>\s*)?/i, "");
      if (!first.textContent.trim() && !first.children.length) first.remove();

      bq.classList.add("callout", `callout-${m[1].toLowerCase()}`);
    });
  }

  return { parseFrontmatter, buildFrontmatter, toHtml, enhance };
})();
