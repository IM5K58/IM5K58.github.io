// admin 에디터 번들 엔트리.
// Crepe 전체 + 커스텀(콜아웃 데코레이션, 슬래시 항목)에 필요한 kit 내부 API를
// "같은 모듈 인스턴스"로 노출한다 — 별도 CDN 로드 시 인스턴스가 갈라져 ctx가 깨짐.
export { Crepe, CrepeFeature } from "@milkdown/crepe";

export { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
export {
  blockquoteSchema,
  clearTextInCurrentBlockCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
export {
  NodeSelection,
  TextSelection,
  Plugin,
  PluginKey,
} from "@milkdown/kit/prose/state";
export { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
export { $prose } from "@milkdown/kit/utils";
