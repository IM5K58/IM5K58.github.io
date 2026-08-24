// @ts-check
// 관리자 페이지: 토큰 인증 → 글 목록 관리 → 작성/수정/삭제 (GitHub API 커밋)
(() => {
  const INDEX_PATH = "posts/index.json";

  // 이 헬퍼는 input·select·button·div를 두루 반환해서 하나의 정확한 타입을
  // 줄 수 없다. 여기서만 검사를 느슨하게 두고, 대신 널 역참조·잘못된 인자 같은
  // 로직 쪽 검사는 살린다.
  /** @type {(id: string) => any} */
  const $ = (id) => document.getElementById(id);
  const views = {
    login: $("login-view"),
    list: $("list-view"),
    cats: $("cats-view"),
    editor: $("editor-view"),
  };

  let index = { version: 1, posts: [] }; // posts/index.json 내용
  let editing = null; // 수정 중인 글의 기존 메타 (신규면 null)
  let crepe = null; // Crepe 에디터 인스턴스
  let CrepeLib = null; // 동적 import된 에디터 번들 모듈 캐시
  let pollTimer = null;
  let bannerTimer = null;

  const EDITOR_BUNDLE_URL = "/assets/vendor/editor.bundle.js";
  const RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}`;

  // ---------- 공통 UI ----------
  function showView(name) {
    Object.entries(views).forEach(([k, el]) => el.classList.toggle("show", k === name));
    banner(); // 뷰 전환 시 배너 정리
  }

  function banner(type, html) {
    const el = $("banner");
    clearTimeout(bannerTimer);
    if (!type) {
      el.className = "banner";
      return;
    }
    el.className = `banner show ${type}`;
    el.innerHTML =
      (type === "info" ? `<span class="spinner"></span>` : "") + html;
    if (type === "success") bannerTimer = setTimeout(() => banner(), 8000);
  }

  // 속성 값 안에서도 안전하도록 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 " 를 그대로 흘려보내서, 제목에 따옴표가
  // 하나만 있어도 data-*/href/src 속성이 끊기고 마크업이 깨진다.
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  function isoNow() {
    const d = new Date();
    const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, "0");
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
      `${sign}${p(off / 60)}:${p(off % 60)}`
    );
  }

  // ---------- 로그인 ----------
  async function enter() {
    try {
      banner("info", "저장소 연결 확인 중...");
      await GH.verifyToken();
      await loadIndex();
      renderList();
      showView("list");
    } catch (err) {
      // 토큰을 버리는 건 토큰이 실제로 무효할 때(401)뿐이다.
      // index.json 손상이나 일시적 네트워크 오류로 자격증명까지 지우면,
      // 그걸 고치러 들어온 사람이 로그인 단계에서 튕겨나간다.
      if (err.status === 401) GH.clearToken();
      showView("login");
      $("token-error").textContent = err.message;
    }
  }

  async function loadIndex() {
    const file = await GH.getFile(INDEX_PATH);
    if (!file) {
      index = { version: 1, categories: [], posts: [] };
      return;
    }
    try {
      index = JSON.parse(file.text);
    } catch (err) {
      throw new Error("posts/index.json 을 읽을 수 없어요 (형식 오류). 인덱스 재빌드로 복구할 수 있습니다.");
    }
    index.posts = index.posts || [];
    // 예전 index.json엔 categories가 없을 수 있음 → 글에서 파생해 초기화
    if (!index.categories) {
      index.categories = [...new Set(index.posts.map((p) => p.category).filter(Boolean))];
    }
  }

  // ---------- 글 목록 ----------
  function renderList() {
    const listEl = $("manage-list");
    if (!index.posts.length) {
      listEl.innerHTML = `<div class="empty-state"><p>아직 글이 없어요. 첫 글을 써보세요!</p></div>`;
      return;
    }
    listEl.innerHTML = index.posts
      .map(
        (p) => `
      <div class="manage-row" data-slug="${esc(p.slug)}">
        <div class="info">
          <div class="title">${esc(p.title)}${p.draft ? '<span class="badge-draft">임시글</span>' : ""}${
            p.source === "notion" ? '<span class="badge-notion">노션</span>' : ""
          }</div>
          <div class="sub"><span class="category">${esc(Posts.catDisplay(p.category))}</span> · ${Posts.formatDate(p.date)} · ${esc(p.slug)}</div>
        </div>
        <div class="row-actions">
          <a class="btn btn-ghost btn-sm" href="/post.html?slug=${encodeURIComponent(p.slug)}" target="_blank">보기</a>
          ${
            // 노션이 원본인 글은 여기서 고치면 다음 동기화에 덮어써지므로 노션으로 보낸다
            p.source === "notion"
              ? `<a class="btn btn-primary btn-sm" href="${esc(p.notionUrl || "https://notion.so")}" target="_blank" rel="noopener">노션에서 편집 ↗</a>`
              : `<button class="btn btn-ghost btn-sm" data-action="edit">수정</button>
          <button class="btn btn-danger btn-sm" data-action="delete">삭제</button>`
          }
        </div>
      </div>`
      )
      .join("");
  }

  // ---------- 카테고리 관리 ----------
  // 카테고리는 "상위" 또는 "상위/하위" 경로 문자열 (하위 1단계)
  function sortCats() {
    index.categories.sort((a, b) => a.localeCompare(b, "ko"));
  }

  // 해당 카테고리(하위 포함)를 쓰는 글 수
  function categoryUsage(cat) {
    return index.posts.filter((p) => {
      const c = p.category || "미분류";
      return c === cat || c.startsWith(cat + "/");
    }).length;
  }

  function hasChildren(cat) {
    return index.categories.some((c) => c.startsWith(cat + "/"));
  }

  function renderCatParentSelect() {
    const tops = index.categories.filter((c) => !c.includes("/"));
    $("new-cat-parent").innerHTML =
      `<option value="">최상위로 추가</option>` +
      tops.map((c) => `<option value="${esc(c)}">${esc(c)} 아래에</option>`).join("");
  }

  function renderCats() {
    renderCatParentSelect();
    const listEl = $("cats-list");
    if (!index.categories.length) {
      listEl.innerHTML = `<div class="empty-state"><p>아직 카테고리가 없어요. 위에서 추가해 보세요.</p></div>`;
      return;
    }
    sortCats();
    listEl.innerHTML = index.categories
      .map((c) => {
        const isChild = c.includes("/");
        const n = categoryUsage(c);
        const blocked = n > 0 || hasChildren(c);
        const blockedTitle =
          n > 0 ? "글이 있는 카테고리는 삭제할 수 없어요" : "하위 카테고리가 있으면 삭제할 수 없어요";
        return `
      <div class="manage-row ${isChild ? "child-row" : ""}" data-cat="${esc(c)}">
        <div class="info">
          <div class="title">${esc(isChild ? c.split("/")[1] : c)}</div>
          <div class="sub">글 ${n}개${isChild ? ` · ${esc(c.split("/")[0])}의 하위` : ""}</div>
        </div>
        <div class="row-actions">
          ${isChild ? "" : `<button class="btn btn-ghost btn-sm" data-action="add-child">+ 하위 추가</button>`}
          <button class="btn btn-danger btn-sm" data-action="del-cat" ${blocked ? `disabled title="${blockedTitle}"` : ""}>삭제</button>
        </div>
      </div>`;
      })
      .join("");
  }

  async function addCategory() {
    const name = $("new-cat").value.trim();
    const parent = $("new-cat-parent").value;
    if (!name) return;
    if (name.includes("/")) return banner("error", "카테고리 이름에는 / 를 쓸 수 없어요.");
    const path = parent ? `${parent}/${name}` : name;
    if (index.categories.includes(path)) return banner("error", "이미 있는 카테고리예요.");
    try {
      banner("info", "카테고리 저장 중...");
      index.categories.push(path);
      sortCats();
      await GH.putFile(INDEX_PATH, JSON.stringify(index, null, 2), `categories: ${path} 추가`);
      $("new-cat").value = "";
      renderCats();
      banner("success", `"${esc(Posts.catDisplay(path))}" 카테고리를 추가했어요.`);
    } catch (err) {
      index.categories = index.categories.filter((c) => c !== path);
      banner("error", `저장 실패: ${esc(err.message)}`);
    }
  }

  async function removeCategory(name) {
    if (categoryUsage(name) || hasChildren(name)) return;
    if (!confirm(`"${Posts.catDisplay(name)}" 카테고리를 삭제할까요?`)) return;
    const before = index.categories;
    try {
      banner("info", "카테고리 저장 중...");
      index.categories = index.categories.filter((c) => c !== name);
      await GH.putFile(INDEX_PATH, JSON.stringify(index, null, 2), `categories: ${name} 삭제`);
      renderCats();
      banner("success", "삭제했어요.");
    } catch (err) {
      index.categories = before;
      banner("error", `저장 실패: ${esc(err.message)}`);
    }
  }

  // ---------- 에디터 (Milkdown Crepe: 노션식 "/" 블록 메뉴) ----------
  // setMarkdown이 없어서 글을 열 때마다 destroy 후 defaultValue로 재생성한다
  async function createEditor(markdown) {
    if (!CrepeLib) {
      banner("info", "에디터 로딩 중...");
      CrepeLib = await import(EDITOR_BUNDLE_URL);
      banner();
    }
    const { Crepe } = CrepeLib;
    if (crepe) {
      await crepe.destroy().catch(() => {});
      crepe = null;
    }
    $("editor").innerHTML = "";

    crepe = new Crepe({
      root: $("editor"),
      defaultValue: markdown,
      features: {
        [Crepe.Feature.Latex]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "내용을 입력하세요. '/'를 누르면 블록 메뉴가 열려요.",
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: uploadImage,
          // md에는 /assets/... 상대경로가 저장되고, 편집 화면 표시만 raw URL로 프록시
          // (커밋 직후엔 Pages 배포 전이라 상대경로가 아직 404이기 때문)
          proxyDomURL: (url) =>
            url && url.startsWith("/assets/") ? RAW_BASE + url : url,
          blockUploadButton: "파일 선택",
          inlineUploadButton: "파일 선택",
          blockUploadPlaceholderText: "또는 이미지 주소 붙여넣기",
          inlineUploadPlaceholderText: "또는 주소 붙여넣기",
          blockCaptionPlaceholderText: "이미지 설명 (선택)",
          blockConfirmButton: "확인",
        },
        [Crepe.Feature.BlockEdit]: {
          // 라벨의 영문 병기는 "/h1", "/code" 같은 영문 검색도 매칭되게 하기 위함
          // (슬래시 메뉴 필터가 라벨 문자열 포함 여부로 동작)
          textGroup: {
            label: "텍스트",
            text: { label: "본문 (text)" },
            h1: { label: "제목 1 (h1)" },
            h2: { label: "제목 2 (h2)" },
            h3: { label: "제목 3 (h3)" },
            h4: { label: "제목 4 (h4)" },
            h5: null,
            h6: null,
            quote: { label: "인용구 (quote)" },
            divider: { label: "구분선 (divider)" },
          },
          listGroup: {
            label: "목록",
            bulletList: { label: "글머리 목록 (list)" },
            orderedList: { label: "번호 목록 (number)" },
            taskList: { label: "할 일 목록 (todo)" },
          },
          advancedGroup: {
            label: "블록",
            image: { label: "이미지 (image)" },
            codeBlock: { label: "코드 블록 (code)" },
            table: { label: "표 (table)" },
            math: { label: "수식 블록 (math)" },
          },
          buildMenu(builder) {
            // 콜아웃: 인용구로 감싸고 [!NOTE] 마커를 삽입 (번들에 포함된 kit API 사용)
            const M = CrepeLib;
            builder.getGroup("text").addItem("callout", {
              label: "콜아웃 (callout)",
              icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h.01M11 12h6" stroke-linecap="round"/></svg>`,
              onRun: (ctx) => {
                const commands = ctx.get(M.commandsCtx);
                commands.call(M.clearTextInCurrentBlockCommand.key);
                commands.call(M.wrapInBlockTypeCommand.key, {
                  nodeType: M.blockquoteSchema.type(ctx),
                });
                const view = ctx.get(M.editorViewCtx);
                view.dispatch(view.state.tr.insertText("[!NOTE] ", view.state.selection.from));
                view.focus();
              },
            });
          },
        },
      },
    });
    crepe.editor.use(makeCalloutPlugin());
    await crepe.create();
  }

  // 에디터 안 콜아웃 실시간 시각화 — ProseMirror 네이티브 데코레이션.
  // (외부에서 DOM에 클래스를 붙이면 PM이 즉시 되돌리지만, 데코레이션은 PM이 직접 관리)
  function makeCalloutPlugin() {
    const M = CrepeLib;
    return M.$prose(
      () =>
        new M.Plugin({
          props: {
            decorations(state) {
              const decos = [];
              state.doc.descendants((node, pos) => {
                if (node.type.name !== "blockquote") return;
                const m = node.textContent
                  .trimStart()
                  .match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
                if (m) {
                  decos.push(
                    M.Decoration.node(pos, pos + node.nodeSize, {
                      class: `callout-bq callout-${m[1].toLowerCase()}`,
                    })
                  );
                }
              });
              return M.DecorationSet.create(state.doc, decos);
            },
          },
        })
    );
  }

  // ---------- 이미지 업로드 ----------
  const MAX_EDGE = 1600; // 본문 최대 폭의 2배. 고해상도 화면에서도 충분하다
  const SKIP_BYTES = 500 * 1024; // 이미 작은 도표를 다시 인코딩할 이유는 없다
  const WEBP_QUALITY = 0.85;

  // 스크린샷을 원본 그대로 커밋하면 한 장에 2MB가 넘는다. 커밋된 이미지는
  // 히스토리에서 사라지지 않으므로, 들어오는 시점에 줄이는 게 유일한 방어다.
  async function shrinkImage(file) {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return null;

    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return null;

    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= MAX_EDGE && file.size < SKIP_BYTES) {
      bitmap.close();
      return null; // 이미 충분히 작다
    }

    const scale = Math.min(1, MAX_EDGE / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", WEBP_QUALITY));
    if (!blob || blob.size >= file.size) return null; // 되레 커지면 원본을 쓴다
    return blob;
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Crepe ImageBlock onUpload: 파일을 저장소에 커밋하고 md에 넣을 경로를 반환
  async function uploadImage(file) {
    try {
      banner("info", "이미지 처리 중...");
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");

      const shrunk = await shrinkImage(file);
      const payload = shrunk || file;
      const baseName =
        (file.name || "image.png")
          .toLowerCase()
          .replace(/[^a-z0-9.]+/g, "-")
          .replace(/^-+|-+$/g, "") || "image.png";
      const safeName = shrunk ? baseName.replace(/\.[a-z0-9]+$/, "") + ".webp" : baseName;
      const path = `assets/images/${d.getFullYear()}/${p(d.getMonth() + 1)}/${Date.now()}-${safeName}`;

      const kb = (n) => Math.round(n / 1024).toLocaleString();
      banner(
        "info",
        shrunk
          ? `이미지 업로드 중... (${kb(file.size)}KB → ${kb(shrunk.size)}KB)`
          : "이미지 업로드 중..."
      );

      const b64 = await toBase64(payload);
      await GH.putFile(path, b64, `image: ${safeName} 업로드`, { isBase64: true });
      const url = `/${path}`;
      if (!$("f-thumbnail").value) $("f-thumbnail").value = url;
      banner(
        "success",
        shrunk
          ? `이미지 업로드 완료 — ${Math.round((1 - shrunk.size / file.size) * 100)}% 절약`
          : "이미지 업로드 완료"
      );
      return url;
    } catch (err) {
      banner("error", `이미지 업로드 실패: ${esc(err.message)}`);
      throw err;
    }
  }

  async function openEditor(post) {
    // await 이전에 이전 인스턴스를 반드시 정리한다.
    // 아래 GH.getFile()이 실패하면 화면만 새 글로 바뀌고 에디터는 이전 글을
    // 그대로 들고 있어, 저장 시 A글 본문이 B글로 커밋되는 사고가 난다.
    if (crepe) {
      await crepe.destroy().catch(() => {});
      crepe = null;
    }
    $("editor").innerHTML = "";
    $("btn-save").disabled = true; // createEditor 성공 후 다시 연다

    editing = post || null;
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");

    $("editor-title").textContent = post ? "글 수정" : "새 글 쓰기";
    $("f-title").value = post ? post.title : "";
    $("f-slug").value = post ? post.slug : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-`;
    $("f-slug").disabled = !!post; // slug 변경은 삭제 후 재작성으로 유도
    $("f-tags").value = post ? (post.tags || []).join(", ") : "";
    $("f-summary").value = post ? post.summary || "" : "";
    $("f-thumbnail").value = post ? post.thumbnail || "" : "";
    $("f-draft").checked = post ? !!post.draft : false;
    $("slug-error").textContent = "";

    // 카테고리 선택란: 등록된 카테고리 + (수정 시) 이 글의 기존 카테고리
    sortCats();
    const current = post ? post.category || "미분류" : "미분류";
    const options = [...new Set(["미분류", ...index.categories, current])];
    $("f-category").innerHTML = options
      .map(
        (c) =>
          `<option value="${esc(c)}" ${c === current ? "selected" : ""}>${esc(Posts.catDisplay(c))}</option>`
      )
      .join("");

    showView("editor");

    try {
      let body = "";
      if (post) {
        banner("info", "글 내용 불러오는 중...");
        const file = await GH.getFile(`posts/${post.slug}.md`);
        if (!file) throw new Error("md 파일이 없습니다. 인덱스 재빌드를 해보세요.");
        body = Render.parseFrontmatter(file.text).body;
        banner();
      }
      await createEditor(body);
      $("btn-save").disabled = false;
    } catch (err) {
      // 저장 버튼은 잠긴 채로 둔다 — 빈 에디터를 덮어쓰는 것보다 낫다
      banner("error", `${esc(err.message)} — 목록으로 돌아갔다 다시 열어 주세요.`);
    }
  }

  // ---------- 저장 ----------
  async function save() {
    const slug = $("f-slug").value.trim();
    const title = $("f-title").value.trim();
    const category = $("f-category").value.trim() || "미분류";

    $("slug-error").textContent = "";
    if (!title) return banner("error", "제목을 입력하세요.");
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
      $("slug-error").textContent = "slug는 영문 소문자/숫자/하이픈만 가능해요. 예: 2026-08-06-js-closure";
      return;
    }
    if (!editing && index.posts.some((x) => x.slug === slug)) {
      $("slug-error").textContent = "이미 같은 slug의 글이 있어요.";
      return;
    }
    // 이 저장소에서 실제로 두 번 난 사고는 "같은 글이 서로 다른 slug로 두 벌"이었다.
    // slug가 다르면 위 검사에 안 걸리므로 제목으로 한 번 더 물어본다.
    const twin = index.posts.find(
      (x) => x.slug !== slug && x.title.trim() === title
    );
    if (twin) {
      const where = twin.source === "notion" ? "노션에서 온 글" : "admin에서 쓴 글";
      if (!confirm(`제목이 같은 글이 이미 있어요.

  "${twin.title}" (${twin.slug} · ${where})

그래도 새로 만들까요?`))
        return;
    }

    const now = isoNow();
    const meta = {
      slug,
      title,
      date: editing ? editing.date : now,
      updated: now,
      category,
      tags: $("f-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
      summary: $("f-summary").value.trim(),
      thumbnail: $("f-thumbnail").value.trim(),
      draft: $("f-draft").checked,
    };

    const saveBtn = $("btn-save");
    saveBtn.disabled = true;
    try {
      banner("info", "글 커밋 중... (1/2)");
      if (!crepe) throw new Error("에디터가 아직 준비되지 않았어요.");
      const md = Render.buildFrontmatter(meta) + "\n\n" + crepe.getMarkdown().trim() + "\n";
      await GH.putFile(`posts/${slug}.md`, md, `post: ${title}`);

      banner("info", "목록 갱신 중... (2/2)");
      // 메모리에 든 사본은 로그인 시점 것이다. 그 사이 노션 동기화(15분 주기)가
      // 추가한 글을 덮어쓰지 않도록, 쓰기 직전에 최신본을 다시 읽는다.
      await loadIndex();
      const i = index.posts.findIndex((x) => x.slug === slug);
      if (i >= 0) index.posts[i] = meta;
      else index.posts.push(meta);
      index.posts.sort((a, b) => (a.date < b.date ? 1 : -1));
      await GH.putFile(INDEX_PATH, JSON.stringify(index, null, 2), `index: ${title}`);

      editing = meta;
      $("f-slug").disabled = true;
      renderList();
      pollDeploy(slug, meta.updated, title);
    } catch (err) {
      banner("error", `저장 실패: ${esc(err.message)}`);
    } finally {
      saveBtn.disabled = false;
    }
  }

  // 커밋 후 Pages 배포 반영(수십 초)을 폴링.
  // 주의: 배포 전에 새 글의 md URL을 두드리면 404 응답이 CDN에 캐시될 수 있으므로,
  // 항상 200인 index.json에 새 updated 타임스탬프가 보이는지로 확인한다.
  function pollDeploy(slug, updatedIso, title) {
    clearInterval(pollTimer);
    banner("info", `<b>${esc(title)}</b> 커밋 완료 — GitHub Pages 배포 중... (보통 1분 이내)`);
    let tries = 0;

    pollTimer = setInterval(async () => {
      if (++tries > 36) {
        clearInterval(pollTimer);
        banner("error", "배포 확인 시간 초과 — 잠시 후 사이트에서 직접 확인해 주세요.");
        return;
      }
      try {
        const res = await fetch(`${CONFIG.siteUrl}/posts/index.json?v=${Date.now()}`, {
          cache: "no-cache",
        });
        if (!res.ok) return;
        const data = await res.json();
        const p = (data.posts || []).find((x) => x.slug === slug);
        if (p && p.updated === updatedIso) {
          clearInterval(pollTimer);
          banner(
            "success",
            `배포 완료! <a href="${CONFIG.siteUrl}/post.html?slug=${encodeURIComponent(slug)}" target="_blank">글 보기 →</a>`
          );
        }
      } catch (_) {
        /* 네트워크 일시 오류는 다음 폴링에서 재시도 */
      }
    }, 5000);
  }

  // ---------- 삭제 ----------
  // 순서 중요: index에서 먼저 제거해야 목록에 죽은 링크가 안 생김
  async function remove(slug) {
    const post = index.posts.find((x) => x.slug === slug);
    if (!post) return;
    if (!confirm(`"${post.title}" 글을 삭제할까요?\n삭제하면 되돌릴 수 없어요. (본문에 쓴 이미지는 저장소에 남습니다)`)) return;

    try {
      banner("info", "목록에서 제거 중... (1/2)");
      await loadIndex(); // 저장과 같은 이유로 최신본 기준에서 지운다
      index.posts = index.posts.filter((x) => x.slug !== slug);
      await GH.putFile(INDEX_PATH, JSON.stringify(index, null, 2), `index: ${post.title} 삭제`);

      banner("info", "글 파일 삭제 중... (2/2)");
      await GH.deleteFile(`posts/${slug}.md`, `post: ${post.title} 삭제`);

      renderList();
      banner("success", "삭제 완료");
    } catch (err) {
      banner("error", `삭제 실패: ${esc(err.message)}`);
      await loadIndex().catch(() => {});
      renderList();
    }
  }

  // ---------- 인덱스 재빌드 (순차 커밋 실패 시 안전망) ----------
  async function rebuildIndex() {
    if (!confirm("posts/ 폴더의 md 파일들을 전부 읽어 index.json을 다시 만듭니다. 진행할까요?")) return;
    try {
      banner("info", "md 파일 목록 조회 중...");
      const files = (await GH.listDir("posts")).filter((f) => f.name.endsWith(".md"));
      const posts = [];
      for (let i = 0; i < files.length; i++) {
        banner("info", `frontmatter 읽는 중... (${i + 1}/${files.length})`);
        const file = await GH.getFile(files[i].path);
        if (!file) continue; // 조회 중 삭제된 파일 — 통째로 죽이지 않고 건너뛴다
        const { meta } = Render.parseFrontmatter(file.text);
        const slug = files[i].name.replace(/\.md$/, "");
        const entry = {
          slug,
          title: meta.title || slug,
          date: meta.date || isoNow(),
          updated: meta.updated || meta.date || isoNow(),
          category: meta.category || "미분류",
          tags: meta.tags || [],
          summary: meta.summary || "",
          thumbnail: meta.thumbnail || "",
          draft: !!meta.draft,
        };
        // 노션 출처 표시를 반드시 살려야 한다. 떨어뜨리면 이 글이 admin 글로 보여
        // 다음 동기화에서 같은 slug가 두 벌로 늘어나고, 수정 잠금도 풀린다.
        if (meta.source) {
          entry.source = meta.source;
          if (meta.notionId) entry.notionId = meta.notionId;
          if (meta.notionUrl) entry.notionUrl = meta.notionUrl;
          if (meta.notionEdited) entry.notionEdited = meta.notionEdited;
          // frontmatter 파서는 문자열만 돌려준다. 숫자로 넣지 않으면
          // sync.js의 엄격 비교("2" !== 2)가 어긋나 전량 재변환이 돈다.
          if (meta.syncVersion) entry.syncVersion = Number(meta.syncVersion);
        }
        posts.push(entry);
      }
      posts.sort((a, b) => (a.date < b.date ? 1 : -1));
      // 글에서 발견된 카테고리는 상위 경로까지 함께 등록
      const fromPosts = posts
        .map((p) => p.category)
        .filter((c) => c && c !== "미분류")
        .flatMap((c) => (c.includes("/") ? [c.split("/")[0], c] : [c]));
      const cats = [...new Set([...(index.categories || []), ...fromPosts])].sort((a, b) =>
        a.localeCompare(b, "ko")
      );
      index = { version: 1, categories: cats, posts };
      banner("info", "index.json 커밋 중...");
      await GH.putFile(INDEX_PATH, JSON.stringify(index, null, 2), "index: 재빌드");
      renderList();
      banner("success", `인덱스 재빌드 완료 (글 ${posts.length}개)`);
    } catch (err) {
      banner("error", `재빌드 실패: ${esc(err.message)}`);
    }
  }

  // ---------- 이벤트 바인딩 ----------
  $("btn-login").addEventListener("click", () => {
    const t = $("token-input").value.trim();
    if (!t) return ($("token-error").textContent = "토큰을 입력하세요.");
    GH.setToken(t);
    enter();
  });
  $("token-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-login").click();
  });

  $("btn-new").addEventListener("click", () => openEditor(null));
  $("btn-rebuild").addEventListener("click", rebuildIndex);

  $("btn-cats").addEventListener("click", () => {
    renderCats();
    showView("cats");
  });
  $("btn-cats-back").addEventListener("click", () => showView("list"));
  $("btn-add-cat").addEventListener("click", addCategory);
  $("new-cat").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCategory();
  });
  $("cats-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const cat = btn.closest(".manage-row").dataset.cat;
    if (btn.dataset.action === "del-cat") removeCategory(cat);
    if (btn.dataset.action === "add-child") {
      $("new-cat-parent").value = cat;
      $("new-cat").focus();
    }
  });
  $("btn-logout").addEventListener("click", () => {
    if (!confirm("토큰을 이 브라우저에서 삭제할까요?")) return;
    GH.clearToken();
    $("token-input").value = "";
    showView("login");
  });

  $("manage-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const slug = btn.closest(".manage-row").dataset.slug;
    if (btn.dataset.action === "edit") openEditor(index.posts.find((x) => x.slug === slug));
    if (btn.dataset.action === "delete") remove(slug);
  });

  $("btn-save").addEventListener("click", save);
  $("btn-back").addEventListener("click", () => {
    clearInterval(pollTimer);
    showView("list");
  });

  // 본문 아래 빈 여백을 클릭해도 이어서 쓸 수 있게 (노션 느낌)
  $("editor").addEventListener("click", (e) => {
    if (!crepe) return;
    if (e.target.id === "editor" || e.target.classList.contains("milkdown")) {
      const pm = $("editor").querySelector(".ProseMirror");
      if (pm) pm.focus();
    }
  });

  // ---------- 시작 ----------
  if (GH.getToken()) enter();
  else showView("login");
})();
