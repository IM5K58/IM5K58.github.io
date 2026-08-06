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
    return cache;
  }

  function published(posts) {
    return posts.filter((p) => !p.draft);
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

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  return {
    load,
    published,
    categories,
    subcategories,
    topOf,
    catDisplay,
    filter,
    formatDate,
  };
})();
