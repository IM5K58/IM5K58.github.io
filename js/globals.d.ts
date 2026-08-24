// CDN에서 전역으로 들어오는 라이브러리들의 형태만 알려준다.
// 실행에는 아무 영향이 없고, 각 js 파일 맨 위의 // @ts-check 가
// 에디터에서 오타·널 역참조를 잡아줄 때만 쓰인다.

declare const marked: {
  parse(src: string): string;
  setOptions(options: Record<string, unknown>): void;
  use(extension: Record<string, unknown>): void;
};

declare const DOMPurify: {
  sanitize(html: string): string;
};

declare const katex: {
  renderToString(tex: string, options?: Record<string, unknown>): string;
};

declare const hljs: {
  highlightElement(el: Element): void;
};

interface Window {
  katex?: typeof katex;
  hljs?: typeof hljs;
}
