// @ts-check
// 없는 주소로 들어왔을 때의 안전망.
//
// 글을 올리면 커밋이 두 번 일어난다 — 글 자체, 그리고 미리보기 껍데기(p/*.html).
// 그 사이 1~2분 동안 목록의 링크는 아직 없는 껍데기를 가리킨다. 그 짧은 창에
// 링크를 눌러도 막다른 길이 되지 않게, 항상 있는 뷰어로 넘긴다.
// (CSP가 인라인 스크립트를 막으므로 별도 파일이어야 한다)
(() => {
  const m = location.pathname.match(/^\/p\/(.+)\.html$/);
  if (!m) return;
  let slug;
  try {
    slug = decodeURIComponent(m[1]);
  } catch (_) {
    return; // 주소가 깨졌으면 그냥 404를 보여준다
  }
  location.replace(`/post.html?slug=${encodeURIComponent(slug)}`);
})();
