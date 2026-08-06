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

  function categories(posts) {
    const map = new Map();
    posts.forEach((p) => {
      const c = p.category || "미분류";
      map.set(c, (map.get(c) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function filter(posts, { query = "", category = "", tag = "" } = {}) {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (category && (p.category || "미분류") !== category) return false;
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

  return { load, published, categories, filter, formatDate };
})();
