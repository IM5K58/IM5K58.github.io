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
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove("theme-switching"))
    );
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

  // 헤더의 토글 버튼 연결 (모든 페이지 공통)
  bindToggle() {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.addEventListener("click", () => this.toggle());
  },
};

document.addEventListener("DOMContentLoaded", () => {
  Theme.syncExtras();
  Theme.bindToggle();
});
