# Kyumswriting

공부한 것들을 정리하는 개인 학습 블로그. https://im5k58.github.io

빌드 과정 없는 순수 정적 사이트(HTML/CSS/JS)로, 글은 마크다운으로 저장되고
브라우저에서 렌더링됩니다. 글 작성/수정/삭제는 사이트 내 관리자 페이지에서
GitHub Contents API로 직접 커밋하는 방식입니다.

## 사용법

- **글 읽기**: https://im5k58.github.io
- **글 쓰기**: https://im5k58.github.io/admin.html
  - 최초 1회 GitHub Fine-grained 토큰 등록 필요 (페이지 안내 참고)
  - 토큰 권한: 이 저장소만, `Contents: Read and write`만

## 노션 연동

노션 데이터베이스에 글을 쓰면 GitHub Actions가 15분마다 가져와 자동 발행한다.
설정 방법은 [tools/notion-sync/README.md](tools/notion-sync/README.md) 참고.
노션에서 온 글은 노션이 원본이라 admin에서 수정하지 않는다(다음 동기화에 덮어써짐).

## 구조

```
index.html      홈 (최신 글 목록 · 검색 · 카테고리 필터)
post.html       글 상세 (?slug=...)
archive.html    전체 글을 연도별로
admin.html      글 관리 (작성 · 수정 · 삭제)
404.html

css/     theme.css(디자인 토큰) base.css components.css post.css admin.css
js/      config.js(전역 설정) theme.js(다크모드) posts.js(목록·필터)
         render.js(마크다운→HTML) github-api.js(Contents API 래퍼)
         page-index.js page-post.js page-archive.js admin.js
posts/   index.json(글 목록 매니페스트) + {slug}.md(frontmatter 포함)
assets/  images/(업로드 이미지) vendor/(에디터 번들) favicon.svg
tools/   notion-sync/(노션 → md 변환) editor-build/(에디터 번들 빌드)
.github/workflows/notion-sync.yml   15분마다 노션 동기화
```

**에디터는 CDN이 아니라 로컬 번들입니다.** admin의 노션식 에디터는
[Milkdown Crepe](https://milkdown.dev)를 `tools/editor-build`에서 esbuild로 묶어
`assets/vendor/editor.bundle.js`로 커밋한 것을 씁니다. CDN 런타임 번들러(esm.sh 등)가
codemirror 의존성과 CSS `@import`를 깨뜨려서 이 방식이 됐습니다.
에디터 버전을 올릴 때만 재빌드하며, 방법은 [tools/editor-build/README.md](tools/editor-build/README.md)에 있습니다.

CDN에서 받는 것은 공개 페이지용 네 가지뿐입니다 — marked(마크다운), DOMPurify(XSS 방어),
KaTeX(수식), Pretendard(폰트). 전부 버전을 고정하고 SRI 무결성 해시를 붙였습니다.

- 댓글은 giscus — 사용하려면 저장소 Discussions 활성화 + [giscus 앱](https://github.com/apps/giscus)
  설치 후 https://giscus.app 에서 받은 값을 `js/config.js`에 기입

## 로컬 실행

```
python -m http.server 8000
```

의존성 설치가 필요 없습니다. 사이트 자체에는 빌드 단계가 없고,
`tools/` 아래 두 도구만 Node를 씁니다.

## 설계 기록

무엇을 **하지 않기로 했는지**와 그 결정을 뒤집을 조건은
[docs/decisions.md](docs/decisions.md)에 있습니다.
