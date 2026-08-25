// @ts-check
// 다크모드 관리 — <head>에서 동기 로드해야 FOUC(깜빡임)가 없다
(function () {
  const stored = localStorage.getItem("theme");
  const theme =
    stored ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
})();

const Theme = {
  current() {
    return document.documentElement.dataset.theme || "light";
  },

  toggle() {
    const next = this.current() === "dark" ? "light" : "dark";
    const root = document.documentElement;
    // 전환(transition)이 걸린 채로 색 토큰이 바뀌면 box-shadow 같은 값이
    // 이전 값에 고착되는 브라우저 문제가 있다. 바뀌는 순간만 전환을 끈다.
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    // 백그라운드 탭에서는 rAF가 멈춰서 클래스가 그대로 남고, 그러면 그 페이지의
    // 전환이 전부 죽는다. 타이머로 한 번 더 걷어낸다.
    const done = () => root.classList.remove("theme-switching");
    requestAnimationFrame(() => requestAnimationFrame(done));
    setTimeout(done, 300);
    this.syncExtras();
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
  },

  // 테마를 따라가야 하는 외부 부속: giscus 댓글 iframe
  syncExtras() {
    const dark = this.current() === "dark";
    const giscus = /** @type {HTMLIFrameElement|null} */ (
      document.querySelector("iframe.giscus-frame")
    );
    giscus?.contentWindow?.postMessage(
      { giscus: { setConfig: { theme: dark ? "dark" : "light" } } },
      "https://giscus.app"
    );
  },

  // 토글 버튼 연결. 좁은 화면에서는 헤더가 꽉 차서 버튼이 푸터로 내려가므로
  // 페이지에 두 개가 있고 CSS가 하나씩만 보여준다 — 둘 다 연결한다.
  // #theme-toggle 도 함께 잡는 건 캐시된 예전 HTML에는 속성이 없기 때문이다.
  bindToggle() {
    document
      .querySelectorAll("#theme-toggle, [data-theme-toggle]")
      .forEach((btn) => btn.addEventListener("click", () => this.toggle()));
  },
};

document.addEventListener("DOMContentLoaded", () => {
  Theme.syncExtras();
  Theme.bindToggle();
});
