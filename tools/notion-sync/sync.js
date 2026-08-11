// 노션 DB → 블로그 마크다운 동기화.
// 발행 체크된 페이지만 posts/*.md 로 변환하고, 노션 호스팅 이미지는
// (URL이 만료되므로) 내려받아 저장소에 함께 커밋한다.
import { Client } from "@notionhq/client";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const POSTS_DIR = path.join(ROOT, "posts");
const INDEX_PATH = path.join(POSTS_DIR, "index.json");
const IMG_ROOT = path.join(ROOT, "assets", "images", "notion");

const { NOTION_TOKEN, NOTION_DB_ID } = process.env;

let _notion = null;
const notion = () => (_notion ??= new Client({ auth: NOTION_TOKEN }));

/* ---------------- DB 속성 읽기 ---------------- */

// 속성 이름은 한글/영문 어느 쪽으로 만들어도 인식되게 후보를 여러 개 둔다
const PROP_ALIASES = {
  slug: ["Slug", "slug", "슬러그", "주소"],
  category: ["카테고리", "Category", "category", "분류"],
  tags: ["태그", "Tags", "tags"],
  summary: ["요약", "Summary", "summary", "설명"],
  published: ["발행", "Published", "published", "공개", "게시"],
  thumbnail: ["썸네일", "Thumbnail", "thumbnail", "커버"],
  date: ["날짜", "Date", "date", "작성일"],
};

function prop(page, key) {
  for (const name of PROP_ALIASES[key]) {
    if (page.properties[name]) return page.properties[name];
  }
  return null;
}

function propText(page, key) {
  const p = prop(page, key);
  if (!p) return "";
  if (p.type === "rich_text") return plainText(p.rich_text);
  if (p.type === "title") return plainText(p.title);
  if (p.type === "select") return p.select?.name || "";
  if (p.type === "url") return p.url || "";
  if (p.type === "formula") return p.formula?.string || "";
  if (p.type === "files") {
    const f = p.files?.[0];
    return f?.external?.url || f?.file?.url || "";
  }
  if (p.type === "date") return p.date?.start || "";
  return "";
}

function pageTitle(page) {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  return plainText(titleProp?.title || []) || "제목 없음";
}

function plainText(rich) {
  return (rich || []).map((t) => t.plain_text).join("");
}

// 노션은 UTC로 시각을 주므로 KST 표기로 변환한다.
// (날짜만 있는 값 "2026-08-10" 은 그날 0시 KST로 본다)
function toKstIso(input) {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00+09:00` : input);
  if (isNaN(d)) return toKstIso(new Date().toISOString());
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}` +
    `T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}+09:00`
  );
}

/* ---------------- 리치 텍스트 → 마크다운 ---------------- */

// 마크다운은 닫는 기호 바로 앞이 공백이면 서식으로 인식하지 않는다.
// (노션에서 "끌개 " 처럼 공백까지 굵게 잡으면 `**끌개 **` 가 되어 글자 그대로 나옴)
// → 앞뒤 공백을 기호 바깥으로 빼낸다.
function emphasize(s, marker) {
  const [, lead, core, trail] = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!core) return s; // 공백뿐이면 서식을 걸지 않는다
  return `${lead}${marker}${core}${marker}${trail}`;
}

function richText(rich) {
  return (rich || [])
    .map((t) => {
      if (t.type === "equation") return `$${t.equation.expression}$`;

      let s = t.plain_text;
      const a = t.annotations || {};
      // 코드가 가장 안쪽 — 코드 안에서는 다른 서식이 의미 없다
      if (a.code) s = `\`${s}\``;
      else {
        if (a.bold) s = emphasize(s, "**");
        if (a.italic) s = emphasize(s, "*");
        if (a.strikethrough) s = emphasize(s, "~~");
      }
      if (t.href) s = `[${s}](${t.href})`;
      return s;
    })
    .join("");
}

/* ---------------- 블록 가져오기 ---------------- */

// 변환 규칙을 고치면 이 번호를 올린다. 그러면 노션에서 안 고친 글도
// 다음 동기화 때 한 번 다시 변환된다.
const CONVERTER_VERSION = 2;

const MAX_SUBPAGE_DEPTH = 2; // 하위 페이지를 따라 들어가는 최대 단계

async function fetchChildren(blockId, pageDepth = 0) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion().blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  for (const b of blocks) {
    if (!b.has_children) continue;
    const isSubPage = b.type === "child_page";
    if (isSubPage && pageDepth >= MAX_SUBPAGE_DEPTH) continue; // 무한 중첩 방지
    b.__children = await fetchChildren(b.id, pageDepth + (isSubPage ? 1 : 0));
  }
  return blocks;
}

/* ---------------- 이미지 ---------------- */

// 노션 호스팅 파일은 URL이 만료되므로 내려받아 저장소에 넣는다.
// 파일명을 내용 해시로 지으면 내용이 그대로일 때 git diff가 생기지 않는다.
async function downloadImage(url, slug) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);

  let ext = path.extname(new URL(url).pathname).toLowerCase();
  if (!/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) ext = ".png";

  const dir = path.join(IMG_ROOT, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, hash + ext), buf);
  return `/assets/images/notion/${slug}/${hash}${ext}`;
}

async function resolveImage(fileObj, slug) {
  if (!fileObj) return "";
  if (fileObj.type === "external") return fileObj.external.url; // 외부 링크는 그대로
  try {
    return await downloadImage(fileObj.file.url, slug);
  } catch (err) {
    console.warn(`  ! 이미지 처리 실패: ${err.message}`);
    return "";
  }
}

/* ---------------- 콜아웃 종류 판별 ---------------- */

const CALLOUT_BY_EMOJI = {
  "💡": "tip",
  "✅": "tip",
  "⚠️": "warning",
  "🚧": "warning",
  "❗": "caution",
  "❌": "caution",
  "🚨": "caution",
  "🔥": "caution",
  "📌": "important",
  "⭐": "important",
};

const CALLOUT_BY_COLOR = {
  red: "caution",
  orange: "warning",
  yellow: "warning",
  green: "tip",
  purple: "important",
  pink: "important",
  blue: "note",
  gray: "note",
  brown: "note",
  default: "note",
};

function calloutKind(block) {
  const emoji = block.callout.icon?.emoji;
  if (emoji && CALLOUT_BY_EMOJI[emoji]) return CALLOUT_BY_EMOJI[emoji];
  const color = (block.callout.color || "default").replace("_background", "");
  return CALLOUT_BY_COLOR[color] || "note";
}

/* ---------------- 블록 → 마크다운 ---------------- */

const LIST_TYPES = ["bulleted_list_item", "numbered_list_item", "to_do"];

async function renderBlocks(blocks, slug, indent = "") {
  const parts = []; // { text, listType }
  let counter = 0;

  for (const b of blocks) {
    if (b.type !== "numbered_list_item") counter = 0;
    const num = b.type === "numbered_list_item" ? ++counter : 0;
    const text = await renderBlock(b, slug, indent, num);
    if (text == null || text.trim() === "") continue;
    parts.push({ text, listType: LIST_TYPES.includes(b.type) ? b.type : null });
  }

  // 같은 종류의 연속된 목록 항목은 한 줄 간격으로 붙여 하나의 목록으로 만든다
  let out = "";
  parts.forEach((p, i) => {
    if (i > 0) out += p.listType && p.listType === parts[i - 1].listType ? "\n" : "\n\n";
    out += p.text;
  });
  return out;
}

async function renderBlock(b, slug, indent, num) {
  const kids = b.__children || [];
  const childMd = async (extraIndent) =>
    kids.length ? await renderBlocks(kids, slug, indent + extraIndent) : "";

  switch (b.type) {
    case "paragraph": {
      const body = indent + richText(b.paragraph.rich_text);
      const inner = await childMd("  ");
      return inner ? `${body}\n\n${inner}` : body;
    }

    // 글 제목이 이미 h1이므로 노션 H1은 본문의 ## 로 내린다 (노션 내보내기와 동일)
    case "heading_1":
      return `${indent}## ${richText(b.heading_1.rich_text)}`;
    case "heading_2":
      return `${indent}### ${richText(b.heading_2.rich_text)}`;
    case "heading_3":
      return `${indent}#### ${richText(b.heading_3.rich_text)}`;

    case "bulleted_list_item": {
      const line = `${indent}* ${richText(b.bulleted_list_item.rich_text)}`;
      const inner = await childMd("  ");
      return inner ? `${line}\n${inner}` : line;
    }
    case "numbered_list_item": {
      const line = `${indent}${num}. ${richText(b.numbered_list_item.rich_text)}`;
      const inner = await childMd("   ");
      return inner ? `${line}\n${inner}` : line;
    }
    case "to_do": {
      const mark = b.to_do.checked ? "x" : " ";
      const line = `${indent}* [${mark}] ${richText(b.to_do.rich_text)}`;
      const inner = await childMd("  ");
      return inner ? `${line}\n${inner}` : line;
    }

    case "quote": {
      const lines = [richText(b.quote.rich_text), await childMd("")]
        .filter(Boolean)
        .join("\n\n");
      return quoteWrap(lines, indent);
    }

    case "callout": {
      const kind = calloutKind(b).toUpperCase();
      const body = [richText(b.callout.rich_text), await childMd("")]
        .filter(Boolean)
        .join("\n\n");
      return quoteWrap(`[!${kind}]\n${body}`, indent);
    }

    case "code": {
      const lang = (b.code.language || "").toLowerCase();
      const text = plainText(b.code.rich_text);
      // 노션에서 코드 블록 언어를 LaTeX로 둔 경우는 수식으로 취급
      if (lang === "latex") return `${indent}$$\n${text}\n$$`;
      const fence = lang && lang !== "plain text" ? lang : "";
      return `${indent}\`\`\`${fence}\n${text}\n\`\`\``;
    }

    case "equation":
      return `${indent}$$\n${b.equation.expression}\n$$`;

    case "divider":
      return `${indent}---`;

    case "image": {
      const src = await resolveImage(b.image, slug);
      if (!src) return null;
      const caption = richText(b.image.caption) || "image";
      return `${indent}![${caption}](${src})`;
    }

    case "video":
    case "file":
    case "pdf": {
      const f = b[b.type];
      const url = f.type === "external" ? f.external.url : f.file?.url;
      return url ? `${indent}<${url}>` : null;
    }

    case "bookmark":
    case "embed":
    case "link_preview": {
      const url = b[b.type].url;
      const caption = richText(b[b.type].caption || []);
      return url ? `${indent}${caption ? `[${caption}](${url})` : `<${url}>`}` : null;
    }

    case "table":
      return renderTable(b, indent);

    case "toggle": {
      const summary = richText(b.toggle.rich_text);
      const inner = await childMd("");
      return `${indent}<details>\n${indent}<summary>${summary}</summary>\n\n${inner}\n\n${indent}</details>`;
    }

    // 컬럼 레이아웃은 세로로 펼친다
    case "column_list":
    case "column":
    case "synced_block":
      return await childMd("");

    // 하위 페이지는 제목을 소제목으로 삼아 내용을 그 자리에 이어붙인다.
    // (조용히 사라지면 글이 통째로 유실되므로)
    case "child_page": {
      const title = b.child_page?.title || "";
      const inner = await childMd("");
      if (!title && !inner) return null;
      return inner ? `${indent}## ${title}\n\n${inner}` : `${indent}## ${title}`;
    }

    case "table_of_contents":
    case "breadcrumb":
    case "child_database":
    case "unsupported":
      return null;

    default: {
      const rich = b[b.type]?.rich_text;
      return rich ? indent + richText(rich) : null;
    }
  }
}

function quoteWrap(text, indent) {
  return text
    .split("\n")
    .map((line) => `${indent}>${line ? " " + line : ""}`)
    .join("\n");
}

function renderTable(b, indent) {
  const rows = (b.__children || []).filter((r) => r.type === "table_row");
  if (!rows.length) return null;

  const cell = (c) => richText(c).replace(/\|/g, "\\|").trim() || " ";
  const line = (cells) => `${indent}| ${cells.map(cell).join(" | ")} |`;
  const width = b.table.table_width || rows[0].table_row.cells.length;

  const out = [];
  if (b.table.has_column_header) {
    out.push(line(rows[0].table_row.cells));
    out.push(`${indent}| ${Array(width).fill("---").join(" | ")} |`);
    rows.slice(1).forEach((r) => out.push(line(r.table_row.cells)));
  } else {
    out.push(`${indent}| ${Array(width).fill(" ").join(" | ")} |`);
    out.push(`${indent}| ${Array(width).fill("---").join(" | ")} |`);
    rows.forEach((r) => out.push(line(r.table_row.cells)));
  }
  return out.join("\n");
}

/* ---------------- frontmatter ---------------- */

function buildFrontmatter(meta) {
  const lines = ["---"];
  lines.push(`title: ${JSON.stringify(meta.title)}`);
  lines.push(`date: ${meta.date}`);
  lines.push(`updated: ${meta.updated}`);
  lines.push(`category: ${meta.category}`);
  lines.push(`tags: [${meta.tags.join(", ")}]`);
  lines.push(`summary: ${JSON.stringify(meta.summary)}`);
  if (meta.thumbnail) lines.push(`thumbnail: ${meta.thumbnail}`);
  lines.push(`draft: false`);
  lines.push(`source: notion`);
  lines.push(`notionId: ${meta.notionId}`);
  lines.push(`notionUrl: ${meta.notionUrl}`);
  lines.push("---");
  return lines.join("\n");
}

/* ---------------- 메인 ---------------- */

// DB를 못 찾을 때: 인테그레이션이 실제로 볼 수 있는 대상을 나열해준다.
// 연결을 안 했으면 아무것도 안 나오고, ID를 잘못 넣었으면 올바른 ID가 보인다.
async function diagnoseAccess() {
  console.log("\n---- 진단: 이 인테그레이션이 볼 수 있는 항목 ----");
  try {
    const res = await notion().search({ page_size: 50 });
    if (!res.results.length) {
      console.log("(없음) → 노션에서 표 페이지의 [⋯ → 연결]에 인테그레이션을 추가해야 합니다.");
      return;
    }
    for (const item of res.results) {
      const title =
        plainText(item.title) ||
        plainText(Object.values(item.properties || {}).find((p) => p.type === "title")?.title) ||
        "(제목 없음)";
      console.log(`  [${item.object === "database" ? "DB" : "페이지"}] ${title}`);
      console.log(`      id: ${item.id.replace(/-/g, "")}`);
    }
    console.log("\n위 목록에 [DB] 항목이 있으면 그 id 를 NOTION_DB_ID 로 넣으세요.");
    console.log("[페이지]만 보인다면 표(데이터베이스)가 아니라 페이지를 연결한 것입니다.");
  } catch (err) {
    console.log("진단 실패:", err.message);
  }
}

// NOTION_DB_ID 에 표 ID 대신 그 표를 담고 있는 페이지 ID를 넣기 쉬우므로,
// 페이지가 들어오면 그 안의 표를 찾아 대신 사용한다.
async function resolveDatabaseId(id) {
  try {
    await notion().databases.retrieve({ database_id: id });
    return id;
  } catch (err) {
    if (err.code !== "validation_error" && err.code !== "object_not_found") throw err;
  }

  try {
    const res = await notion().blocks.children.list({ block_id: id, page_size: 100 });
    const db = res.results.find((b) => b.type === "child_database");
    if (db) {
      const name = db.child_database.title || "(제목 없음)";
      console.log(`입력한 ID는 페이지였습니다 → 그 안의 표 "${name}" 를 사용합니다.`);
      console.log(`  (NOTION_DB_ID 를 ${db.id.replace(/-/g, "")} 로 바꿔두면 이 단계가 생략됩니다)`);
      return db.id;
    }
  } catch (err) {
    console.log(`페이지 내부 조회 실패: ${err.message}`);
  }
  return null;
}

async function queryPublishedPages(databaseId) {
  const pages = [];
  let cursor;
  do {
    const res = await notion().databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return pages.filter((p) => {
    const pub = prop(p, "published");
    // 발행 속성이 없으면 전부 발행으로 간주
    return !pub || pub.type !== "checkbox" || pub.checkbox === true;
  });
}

function slugOf(page) {
  const raw = propText(page, "slug").trim();
  const safe = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (safe) return safe;
  // Slug 미입력 시 날짜 + 페이지 id 앞자리로 자동 생성
  const d = (propText(page, "date") || page.created_time).slice(0, 10);
  return `${d}-${page.id.replace(/-/g, "").slice(0, 8)}`;
}

async function main() {
  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    // 둘 중 무엇이 비었는지 알려줘야 설정 실수를 바로 찾을 수 있다
    console.log("동기화를 건너뜁니다. 설정 상태:");
    console.log(`  NOTION_TOKEN : ${NOTION_TOKEN ? "OK" : "없음"}`);
    console.log(`  NOTION_DB_ID : ${NOTION_DB_ID ? "OK" : "없음"}`);
    console.log("");
    console.log("확인할 것:");
    console.log("  1. Settings → Secrets and variables → Actions 의 [Secrets] 탭인지");
    console.log("     ([Variables] 탭에 넣으면 인식되지 않습니다)");
    console.log("  2. 이름이 정확히 NOTION_TOKEN / NOTION_DB_ID 인지 (대소문자·공백)");
    console.log("  3. 시크릿을 등록한 뒤에 실행한 것인지 (등록 전 실행은 반영 안 됨)");
    return;
  }

  console.log("노션 DB 조회 중...");
  const databaseId = await resolveDatabaseId(NOTION_DB_ID);
  if (!databaseId) {
    console.error("\nNOTION_DB_ID 로 표(데이터베이스)를 찾지 못했습니다.");
    await diagnoseAccess();
    throw new Error("데이터베이스를 찾을 수 없음");
  }

  let pages;
  try {
    pages = await queryPublishedPages(databaseId);
  } catch (err) {
    if (["object_not_found", "unauthorized", "validation_error"].includes(err.code)) {
      console.error(`\nDB에 접근할 수 없습니다: ${err.message}`);
      await diagnoseAccess();
    }
    throw err;
  }
  console.log(`발행 대상 ${pages.length}개`);

  const index = JSON.parse(await fs.readFile(INDEX_PATH, "utf8"));
  const existing = new Map(
    index.posts.filter((p) => p.source === "notion").map((p) => [p.slug, p])
  );

  const synced = [];
  const seenSlugs = new Set();

  for (const page of pages) {
    const title = pageTitle(page);
    const slug = slugOf(page);
    if (seenSlugs.has(slug)) {
      console.warn(`! slug 중복으로 건너뜀: ${slug} (${title}) — 노션에서 Slug를 다르게 지정하세요`);
      continue;
    }
    seenSlugs.add(slug);

    const prev = existing.get(slug);
    // 수정 시각이 그대로이고 변환 규칙도 그대로면 본문을 다시 받지 않는다
    if (
      prev &&
      prev.notionEdited === page.last_edited_time &&
      prev.syncVersion === CONVERTER_VERSION
    ) {
      synced.push(prev);
      console.log(`= ${title} (변경 없음)`);
      continue;
    }

    console.log(`↓ ${title}`);
    // 이 글의 이미지 폴더를 비우고 새로 받는다 (내용 해시 파일명이라 같은 그림은 diff 없음)
    await fs.rm(path.join(IMG_ROOT, slug), { recursive: true, force: true });

    const blocks = await fetchChildren(page.id);
    const body = await renderBlocks(blocks, slug);

    // 썸네일: 속성(URL/파일) → 없으면 페이지 커버 순으로 찾는다.
    // 노션에 업로드된 파일은 URL이 만료되므로 반드시 내려받아야 한다.
    let thumbnail = "";
    const thumbProp = prop(page, "thumbnail");
    if (thumbProp?.type === "url") thumbnail = thumbProp.url || "";
    else if (thumbProp?.type === "rich_text") thumbnail = plainText(thumbProp.rich_text);
    else if (thumbProp?.type === "files" && thumbProp.files?.[0]) {
      thumbnail = await resolveImage(thumbProp.files[0], slug);
    }
    if (!thumbnail && page.cover) thumbnail = await resolveImage(page.cover, slug);

    const tagsProp = prop(page, "tags");
    const meta = {
      slug,
      title,
      date: toKstIso(propText(page, "date") || page.created_time),
      updated: toKstIso(page.last_edited_time),
      category: propText(page, "category") || "미분류",
      tags: tagsProp?.multi_select?.map((t) => t.name) || [],
      summary:
        propText(page, "summary") ||
        body.replace(/[#>*`$\[\]!\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 120),
      thumbnail,
      draft: false,
      source: "notion",
      notionId: page.id,
      notionUrl: page.url,
      notionEdited: page.last_edited_time,
      syncVersion: CONVERTER_VERSION,
    };

    await fs.writeFile(
      path.join(POSTS_DIR, `${slug}.md`),
      `${buildFrontmatter(meta)}\n\n${body.trim()}\n`,
      "utf8"
    );
    synced.push(meta);
  }

  // 노션에서 발행 해제/삭제된 글은 저장소에서도 지운다
  for (const [slug] of existing) {
    if (seenSlugs.has(slug)) continue;
    console.log(`× ${slug} (노션에서 내려감 → 삭제)`);
    await fs.rm(path.join(POSTS_DIR, `${slug}.md`), { force: true });
    await fs.rm(path.join(IMG_ROOT, slug), { recursive: true, force: true });
  }

  // index.json 갱신 — admin에서 직접 쓴 글(source 없음)은 그대로 둔다
  const others = index.posts.filter((p) => p.source !== "notion");
  index.posts = [...others, ...synced].sort((a, b) => (a.date < b.date ? 1 : -1));

  const cats = new Set(index.categories || []);
  synced.forEach((p) => {
    if (!p.category || p.category === "미분류") return;
    cats.add(p.category);
    if (p.category.includes("/")) cats.add(p.category.split("/")[0]);
  });
  index.categories = [...cats].sort((a, b) => a.localeCompare(b, "ko"));

  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`완료: 노션 글 ${synced.length}개, 그 외 ${others.length}개`);
}

// 직접 실행할 때만 동기화 (테스트에서 import 가능하도록)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("동기화 실패:", err.message);
    process.exit(1);
  });
}

export { renderBlocks, richText, renderTable, calloutKind, slugOf, buildFrontmatter, toKstIso };
