// @ts-check
// 히어로 제목을 "그려지는" 글자로 바꾼다.
//
// 글자마다 윤곽선이 획처럼 그어진 뒤 안이 채워진다. HTML 글자로는 불가능해서
// (-webkit-text-stroke 는 굵기도 색도 애니메이션이 안 된다) SVG 로 겹쳐 그린다.
//
// h1 의 진짜 글자는 그대로 둔 채 색만 투명하게 만든다. 그래야
//  · 스크린리더가 제목을 정상으로 읽고
//  · JS 가 죽거나 글꼴이 안 오면 평범한 글자가 그대로 보인다
//  · 레이아웃이 1px도 안 움직인다
//
// SVG 는 h1 바깥(.hero-title)에 넣는다. h1 안에 두면 aria-hidden 을 걸어도
// 제목의 접근성 이름 계산에 글자가 두 번씩 섞여 들어간다 — 실제로 확인했다.
const HeroDraw = (() => {
  const NS = "http://www.w3.org/2000/svg";

  const mk = (tag, attrs, text) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    // append() 는 undefined 를 돌려주므로 만든 요소를 여기서 반환한다
    if (text != null) el.appendChild(document.createTextNode(text));
    return el;
  };

  /** 줄 상자 안에서 글자 기준선이 놓이는 높이 */
  function baselineOffset(font, lineHeight) {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return lineHeight * 0.75;
    ctx.font = font;
    const m = ctx.measureText("가");
    const asc = m.fontBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent;
    if (!asc || !desc) return lineHeight * 0.75;
    return (lineHeight - (asc + desc)) / 2 + asc;
  }

  function build(h1) {
    const lines = [...h1.querySelectorAll(".ln")];
    if (!lines.length || !h1.parentElement) return null;

    const cs = getComputedStyle(h1);
    const size = parseFloat(cs.fontSize);
    const lineH = parseFloat(cs.lineHeight);
    const font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const glyphCss =
      `font-family:${cs.fontFamily};font-size:${size}px;` +
      `font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing}`;
    const base = baselineOffset(font, lineH);

    const box = h1.getBoundingClientRect();
    const svg = mk("svg", {
      class: "hero-svg",
      width: box.width,
      height: box.height,
      viewBox: `0 0 ${box.width} ${box.height}`,
      "aria-hidden": "true",
      focusable: "false",
    });

    // 글자 위치를 재기 위한 보이지 않는 텍스트. SVG 의 getExtentOfChar 로
    // 글자마다 실제 자리와 크기를 얻는다 — 폭을 짐작하지 않는다.
    const rulers = lines.map((ln, i) =>
      svg.appendChild(
        mk("text", {
          x: 0,
          y: (i * lineH + base).toFixed(2),
          style: glyphCss + ";visibility:hidden",
        }, ln.textContent || "")
      )
    );
    const layer = svg.appendChild(mk("g", { class: "hero-glyphs" }));
    (h1.parentElement || h1).appendChild(svg);

    let n = 0;
    const STEP = 0.075; // 글자 사이 간격(초)
    rulers.forEach((ruler) => {
      const text = ruler.textContent || "";
      for (let i = 0; i < text.length; i++) {
        if (!text[i].trim()) continue; // 공백은 건너뛴다
        const p = ruler.getStartPositionOfChar(i);
        const delay = (0.35 + n * STEP).toFixed(3);
        const attrs = { x: p.x.toFixed(2), y: p.y.toFixed(2), style: glyphCss };
        layer.appendChild(
          mk("text", { ...attrs, class: "gs", style: glyphCss + `;animation-delay:${delay}s` }, text[i])
        );
        layer.appendChild(
          mk("text", { ...attrs, class: "gf", style: glyphCss + `;animation-delay:${+delay + 0.45}s` }, text[i])
        );
        n++;
      }
    });

    // 자리를 다 읽었으면 측정용 텍스트는 지운다. visibility:hidden 만으로는
    // 접근성 트리에 그대로 남는 경우가 있어 실제로 제목이 두 번 읽혔다.
    rulers.forEach((r) => r.remove());

    if (!n) {
      svg.remove();
      return null;
    }
    return svg;
  }

  function init() {
    const h1 = document.querySelector(".hero h1");
    if (!h1) return;

    // 움직임을 원치 않으면 평범한 글자 그대로 둔다
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let svg = null;
    const teardown = () => {
      if (svg) svg.remove();
      svg = null;
      h1.classList.remove("drawing");
    };

    const start = () => {
      try {
        svg = build(h1);
        if (svg) h1.classList.add("drawing"); // 진짜 글자를 투명하게
      } catch (_) {
        teardown(); // 무슨 일이 있어도 평범한 글자는 남는다
      }
    };

    // 글꼴이 오기 전에 재면 글자 폭이 틀어진다
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);

    // 화면 폭이 바뀌면 글자 자리가 달라진다. 다시 그리지 않고 원래 글자로 되돌린다 —
    // 애니메이션은 이미 한 번 봤고, 크기 바뀔 때마다 다시 재생되면 성가시다.
    let t;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(t);
        t = setTimeout(teardown, 150);
      },
      { passive: true }
    );
  }

  document.addEventListener("DOMContentLoaded", init);
  return { init };
})();
