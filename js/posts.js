// @ts-check
// 글 목록 데이터 로드 + 검색/필터 (공개 페이지용)
const Posts = (() => {
  let cache = null;

  // Pages 캐시(max-age=600) 때문에 캐시버스터 필수 — 없으면 새 글이 10분간 안 보임
  async function load() {
    if (cache) return cache;
    const res = await fetch(`/posts/index.json?v=${Date.now()}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`index.json 로드 실패 (${res.status})`);
    const data = await res.json();
    cache = (data.posts || [])
      .filter((p) => p && p.slug && p.title)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    buildHueMap(cache);
    return cache;
  }

  // 공개된 글만. 이때 색인 번호(p.index)를 박아둔다 — 최신 글이 001이다.
  // 목록·아카이브·글 상세가 같은 번호를 보여야 "색인"이 의미를 갖기 때문에,
  // 화면마다 세지 않고 여기서 한 번만 정한다. 임시글은 번호를 차지하지 않는다.
  function published(posts) {
    const list = posts.filter((p) => !p.draft);
    list.forEach((p, i) => {
      p.index = i + 1;
    });
    return list;
  }

  // 카테고리는 "상위/하위" 경로 문자열 (하위 1단계). 표시할 땐 " › "로 변환.
  function topOf(path) {
    return (path || "미분류").split("/")[0];
  }

  function catDisplay(path) {
    return (path || "미분류").split("/").join(" › ");
  }

  // 상위 카테고리별 글 수 (하위 카테고리 글 포함)
  function categories(posts) {
    const map = new Map();
    posts.forEach((p) => {
      const c = topOf(p.category);
      map.set(c, (map.get(c) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  // 태그별 글 수. 많이 쓴 태그가 위, 같으면 가나다순 — 순서가 흔들리면
  // 태그 화면에서 같은 태그를 매번 다른 자리에서 찾게 된다.
  function tags(posts) {
    const map = new Map();
    posts.forEach((p) => (p.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  }

  // 특정 상위 카테고리의 하위 카테고리별 글 수
  function subcategories(posts, parent) {
    const map = new Map();
    posts.forEach((p) => {
      const c = p.category || "미분류";
      if (c.startsWith(parent + "/")) {
        const child = c.slice(parent.length + 1);
        map.set(child, (map.get(child) || 0) + 1);
      }
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function filter(posts, { query = "", category = "", tag = "" } = {}) {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (category) {
        // 상위 카테고리 선택 시 하위 글도 포함
        const c = p.category || "미분류";
        if (c !== category && !c.startsWith(category + "/")) return false;
      }
      if (tag && !(p.tags || []).includes(tag)) return false;
      if (q) {
        const haystack = [p.title, p.summary, p.category, ...(p.tags || [])]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  // 카테고리마다 고유한 색을 준다. 이름을 해시해 고정 팔레트에서 고르므로
  // 새 카테고리가 생겨도 설정 없이 자동으로 색이 정해지고, 항상 같은 색을 유지한다.
  // 상위 카테고리 기준이라 AI/DeepLearning 과 AI/Vision 은 같은 계열로 묶인다.
  const CAT_HUES = [258, 300, 350, 25, 70, 145, 190, 220];

  // 이름 해시로 색을 고르면 카테고리가 몇 개 없을 때 서로 겹친다
  // (실제로 "AI"와 "Chaos"가 같은 색이 됐다). 대신 상위 카테고리를
  // 가나다순으로 줄 세워 팔레트를 차례로 배정한다 — 8개까지 겹치지 않는다.
  let hueMap = null;

  function buildHueMap(posts) {
    const tops = [...new Set(posts.map((p) => topOf(p.category)))].sort((a, b) =>
      a.localeCompare(b, "ko")
    );
    hueMap = new Map(tops.map((t, i) => [t, CAT_HUES[i % CAT_HUES.length]]));
  }

  function catHue(path) {
    return hueMap?.get(topOf(path)) ?? CAT_HUES[0];
  }

  // 최근 2주 안에 올린 글은 목록에서 표시해 준다
  function isNew(iso, days = 14) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t < days * 86400000;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // 글 상세 메타 표용. 글은 KST 기준으로 쓰므로 표시도 KST로 고정한다 —
  // 브라우저 표준시를 따라가면 같은 글이 사람마다 다른 시각으로 보인다.
  function formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const kst = new Date(d.getTime() + 9 * 3600000);
    const p = (n) => String(n).padStart(2, "0");
    return (
      `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}` +
      ` ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())} KST`
    );
  }

  // 목록에 붙는 색인 번호 (001, 002 …)
  function num(i) {
    return String(i).padStart(3, "0");
  }

  // 글 주소. post.html?slug= 대신 글마다 따로 만들어 둔 껍데기를 가리킨다 —
  // 카톡·슬랙 같은 미리보기 크롤러는 JS를 돌리지 않아서, 한 파일로는 모든 글이
  // 같은 제목으로 보인다. 껍데기는 tools/build-meta 가 만든다.
  // 아직 안 만들어졌으면 404.html이 post.html?slug= 로 되돌려 준다.
  function url(slug) {
    return `/p/${encodeURIComponent(slug)}.html`;
  }

  // 히어로에 얹는 수치. 색인 표지처럼 규모를 먼저 보여준다.
  function stats(posts) {
    const latest = posts.reduce((acc, p) => {
      const t = p.updated || p.date;
      return t > acc ? t : acc;
    }, "");
    return {
      entries: posts.length,
      categories: new Set(posts.map((p) => topOf(p.category))).size,
      updated: latest ? formatDate(latest) : "",
    };
  }

  // 색인 순서상의 앞/뒤 글. posts는 최신순이므로 prev가 더 새 글이다.
  function neighbors(posts, slug) {
    const i = posts.findIndex((p) => p.slug === slug);
    if (i === -1) return { index: 0, prev: null, next: null };
    return { index: i + 1, prev: posts[i - 1] || null, next: posts[i + 1] || null };
  }

  return {
    load,
    published,
    categories,
    subcategories,
    tags,
    topOf,
    catDisplay,
    catHue,
    isNew,
    filter,
    formatDate,
    formatDateTime,
    num,
    url,
    stats,
    neighbors,
  };
})();
