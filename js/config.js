// @ts-check
// 사이트 전역 설정 — 값만 바꾸면 다른 계정/저장소에서도 그대로 동작
const CONFIG = {
  owner: "IM5K58",
  repo: "IM5K58.github.io",
  branch: "main",
  siteUrl: "https://im5k58.github.io",

  blogTitle: "Kyumswriting",
  blogDescription: "공부한 것들을 정리하는 공간",

  // giscus 댓글 (https://giscus.app 에서 발급받은 값 기입 후 enabled: true)
  // 사전 작업: 저장소 Discussions 활성화 + giscus 앱 설치
  giscus: {
    enabled: false,
    repo: "IM5K58/IM5K58.github.io",
    repoId: "",
    category: "Announcements",
    categoryId: "",
  },
};
