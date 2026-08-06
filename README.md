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

## 구조

```
index.html / post.html / admin.html / 404.html
css/    theme.css(디자인 토큰) base.css components.css post.css admin.css
js/     config.js(전역 설정) theme.js(다크모드) posts.js render.js
        github-api.js(Contents API 래퍼) admin.js page-index.js page-post.js
posts/  index.json(글 목록 매니페스트) + {slug}.md(글 본문, frontmatter 포함)
assets/ images/{yyyy}/{mm}/(업로드 이미지), favicon.svg
```

- 라이브러리는 전부 CDN: Toast UI Editor(에디터), marked(마크다운),
  DOMPurify(XSS 방어), highlight.js(코드 하이라이팅), Pretendard(폰트)
- 댓글은 giscus — 사용하려면 저장소 Discussions 활성화 + [giscus 앱](https://github.com/apps/giscus)
  설치 후 https://giscus.app 에서 받은 값을 `js/config.js`에 기입

## 로컬 실행

```
python -m http.server 8000
```
