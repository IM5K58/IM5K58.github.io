# 에디터 번들 빌드

admin 페이지의 노션식 에디터(Milkdown Crepe)는 CDN 런타임 번들러(esm.sh 등)가
의존성(codemirror exports, CSS @import)을 깨뜨리는 문제가 있어, **로컬에서 한 번
번들해서 정적 파일로 커밋**한다. 사이트 자체는 여전히 빌드 없이 서빙된다.

산출물 (커밋 대상):
- `/assets/vendor/editor.bundle.js` — Crepe + kit 내부 API (ESM)
- `/assets/vendor/editor.bundle.css` — 에디터 전체 CSS (KaTeX 폰트 내장)

## 재빌드 방법 (에디터 버전 업그레이드 시에만 필요)

```
cd tools/editor-build
npm install
npm run build
```

버전을 올릴 땐 package.json의 @milkdown/crepe, @milkdown/kit 버전을 함께 맞추고,
빌드 후 admin에서 코드 블록/수식 블록/콜아웃/슬래시 메뉴가 동작하는지 확인할 것.
