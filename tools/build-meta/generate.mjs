// 글마다 "미리보기 메타가 박힌 껍데기 HTML"을 만든다.
//
// 왜 필요한가: 카톡·슬랙·디스코드·트위터의 링크 미리보기 크롤러는 JS를 돌리지
// 않는다. post.html 은 제목을 JS로 넣으므로, 크롤러 눈에는 모든 글이 똑같이
// "Kyumswriting" 이다. 정적 호스팅에서 주소 하나로 글마다 다른 <head>를 내주는
// 방법은 없으므로, 글마다 파일을 미리 하나씩 만들어 두는 수밖에 없다.
//
// 만들어지는 것: p/<slug>.html · sitemap.xml · robots.txt
// 껍데기는 post.html 을 그대로 복사하고 <head>만 채운 것이다. 본문은 여전히
// 브라우저가 .md 를 받아 그린다 — 렌더러를 Node로 옮기지 않는 게 핵심이다.
// 그래야 이 스크립트가 실패해도 사이트는 멀쩡하고, 미리보기만 빠진다.
//
// 의존성 없음(Node 내장만). npm install 도 락파일도 없다.
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_DIR = path.join(ROOT, "p");
const MARK_START = "<!-- meta:start -->";
const MARK_END = "<!-- meta:end -->";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** 미리보기 설명은 한 줄이어야 한다 — 줄바꿈이 들어가면 잘려 보이는 클라이언트가 있다 */
const oneLine = (s, max = 160) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};

/**
 * js/config.js 에서 값을 꺼낸다. eval 하지 않고 필요한 키만 뽑는다 —
 * 브라우저용 파일이라 언젠가 window 참조가 들어가도 이 스크립트가 안 깨지게.
 */
async function readConfig() {
  const src = await readFile(path.join(ROOT, "js/config.js"), "utf8");
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}\\s*:\\s*"([^"]*)"`));
    if (!m) throw new Error(`js/config.js 에서 ${key} 를 찾지 못했습니다`);
    return m[1];
  };
  return {
    siteUrl: pick("siteUrl").replace(/\/+$/, ""),
    blogTitle: pick("blogTitle"),
    blogDescription: pick("blogDescription"),
  };
}

/** 상대 경로 이미지를 미리보기에 쓸 수 있는 절대 주소로 */
const absUrl = (siteUrl, u) => {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return siteUrl + (u.startsWith("/") ? u : "/" + u);
};

function buildHead(post, cfg) {
  const title = post.title || post.slug;
  const desc = oneLine(post.summary) || cfg.blogDescription;
  const canonical = `${cfg.siteUrl}/p/${encodeURIComponent(post.slug)}.html`;
  const image = absUrl(cfg.siteUrl, post.thumbnail);

  const tags = [
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${esc(cfg.blogTitle)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:locale" content="ko_KR">`,
  ];
  if (image) tags.push(`<meta property="og:image" content="${esc(image)}">`);
  if (post.date) tags.push(`<meta property="article:published_time" content="${esc(post.date)}">`);
  if (post.updated) tags.push(`<meta property="article:modified_time" content="${esc(post.updated)}">`);
  if (post.category) tags.push(`<meta property="article:section" content="${esc(post.category)}">`);
  for (const t of post.tags || []) tags.push(`<meta property="article:tag" content="${esc(t)}">`);

  // 이미지가 없으면 큰 카드를 요청하지 않는다 — 빈 회색 판이 뜨는 것보다 낫다
  tags.push(`<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`);
  tags.push(`<meta name="twitter:title" content="${esc(title)}">`);
  tags.push(`<meta name="twitter:description" content="${esc(desc)}">`);
  if (image) tags.push(`<meta name="twitter:image" content="${esc(image)}">`);

  return tags.map((t) => "  " + t).join("\n");
}

/** 템플릿에서 딱 세 곳만 바꾼다. 못 바꾸면 조용히 넘어가지 말고 죽는다. */
function renderShell(template, post, cfg) {
  const title = `${post.title || post.slug} — ${cfg.blogTitle}`;
  let out = template;

  const replaceOnce = (pattern, value, what) => {
    const before = out;
    out = out.replace(pattern, value);
    if (out === before) {
      throw new Error(`post.html 구조가 바뀌어 ${what} 를 넣지 못했습니다`);
    }
  };

  replaceOnce(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "제목");
  replaceOnce(
    new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`),
    `${MARK_START}\n${buildHead(post, cfg)}\n  ${MARK_END}`,
    "미리보기 메타"
  );
  replaceOnce(/<body(?=[\s>])/, `<body data-slug="${esc(post.slug)}"`, "slug");

  return out;
}

function buildSitemap(posts, cfg) {
  const day = (iso) => (iso || "").slice(0, 10);
  const newest = posts.reduce((a, p) => ((p.updated || p.date) > a ? p.updated || p.date : a), "");
  const entry = (loc, lastmod, priority) =>
    `  <url>\n    <loc>${esc(loc)}</loc>` +
    (lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : "") +
    `\n    <priority>${priority}</priority>\n  </url>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [
      entry(cfg.siteUrl + "/", day(newest), "1.0"),
      entry(cfg.siteUrl + "/archive.html", day(newest), "0.5"),
      ...posts.map((p) =>
        entry(`${cfg.siteUrl}/p/${encodeURIComponent(p.slug)}.html`, day(p.updated || p.date), "0.8")
      ),
    ].join("\n") +
    `\n</urlset>\n`
  );
}

async function main() {
  const cfg = await readConfig();
  const index = JSON.parse(await readFile(path.join(ROOT, "posts/index.json"), "utf8"));
  const template = await readFile(path.join(ROOT, "post.html"), "utf8");

  // 임시글은 껍데기도 사이트맵도 만들지 않는다 — 주소가 새 나가면 안 되니까
  const posts = (index.posts || [])
    .filter((p) => p && p.slug && p.title && !p.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  const keep = new Set();
  for (const post of posts) {
    const file = `${post.slug}.html`;
    keep.add(file);
    const html = renderShell(template, post, cfg);
    const target = path.join(OUT_DIR, file);
    // 내용이 같으면 건드리지 않는다 — 안 바뀐 파일이 커밋에 섞이지 않게
    const prev = existsSync(target) ? await readFile(target, "utf8") : null;
    if (prev !== html) {
      await writeFile(target, html, "utf8");
      written++;
    }
  }

  // 지워진 글의 껍데기 정리
  let removed = 0;
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith(".html") && !keep.has(f)) {
      await unlink(path.join(OUT_DIR, f));
      removed++;
    }
  }

  await writeFile(path.join(ROOT, "sitemap.xml"), buildSitemap(posts, cfg), "utf8");
  await writeFile(
    path.join(ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /admin.html\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`,
    "utf8"
  );

  console.log(
    `글 ${posts.length}편 · 껍데기 ${written}개 갱신 · ${removed}개 삭제 · sitemap.xml, robots.txt 작성`
  );
}

main().catch((err) => {
  console.error("미리보기 메타 생성 실패:", err.message);
  process.exit(1);
});
