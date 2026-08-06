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
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    this.syncExtras();
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
  },

  // 테마에 따라오는 부속들: highlight.js 스타일시트, giscus iframe
  syncExtras() {
    const dark = this.current() === "dark";
    const lightCss = document.getElementById("hljs-light");
    const darkCss = document.getElementById("hljs-dark");
    if (lightCss) lightCss.disabled = dark;
    if (darkCss) darkCss.disabled = !dark;

    const giscus = document.querySelector("iframe.giscus-frame");
    if (giscus) {
      giscus.contentWindow.postMessage(
        { giscus: { setConfig: { theme: dark ? "dark" : "light" } } },
        "https://giscus.app"
      );
    }
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
