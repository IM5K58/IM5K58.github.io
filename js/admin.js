// 관리자 페이지: 토큰 인증 → 글 목록 관리 → 작성/수정/삭제 (GitHub API 커밋)
(() => {
  const INDEX_PATH = "posts/index.json";

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
  let CrepeLib = null; // 동적 import된 모듈 캐시
  let pollTimer = null;

  const CREPE_URL = "https://esm.sh/@milkdown/crepe@7.22.0?bundle";
  const RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}`;

  // ---------- 공통 UI ----------
  function showView(name) {
    Object.entries(views).forEach(([k, el]) => el.classList.toggle("show", k === name));
    banner(); // 뷰 전환 시 배너 정리
  }

  function banner(type, html) {
    const el = $("banner");
    clearTimeout(banner._hide);
    if (!type) {
      el.className = "banner";
      return;
    }
    el.className = `banner show ${type}`;
    el.innerHTML =
      (type === "info" ? `<span class="spinner"></span>` : "") + html;
    if (type === "success") banner._hide = setTimeout(() => banner(), 8000);
  }

  function esc(s) {
    const div = document.createElement("div");
    div.textContent = s ?? "";
    return div.innerHTML;
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
      GH.clearToken();
      showView("login");
      $("token-error").textContent = err.message;
    }
  }

  async function loadIndex() {
    const file = await GH.getFile(INDEX_PATH);
    index = file ? JSON.parse(file.text) : { version: 1, categories: [], posts: [] };
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
          <div class="title">${esc(p.title)}${p.draft ? '<span class="badge-draft">임시글</span>' : ""}</div>
          <div class="sub"><span class="category">${esc(Posts.catDisplay(p.category))}</span> · ${Posts.formatDate(p.date)} · ${esc(p.slug)}</div>
        </div>
        <div class="row-actions">
          <a class="btn btn-ghost btn-sm" href="/post.html?slug=${encodeURIComponent(p.slug)}" target="_blank">보기</a>
          <button class="btn btn-ghost btn-sm" data-action="edit">수정</button>
          <button class="btn btn-danger btn-sm" data-action="delete">삭제</button>
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
      banner("info", "에디터 로딩 중... (최초 1회만 오래 걸려요)");
      CrepeLib = await import(CREPE_URL);
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
          textGroup: {
            label: "텍스트",
            text: { label: "본문" },
            h1: { label: "제목 1" },
            h2: { label: "제목 2" },
            h3: { label: "제목 3" },
            h4: { label: "제목 4" },
            h5: null,
            h6: null,
            quote: { label: "인용구" },
            divider: { label: "구분선" },
          },
          listGroup: {
            label: "목록",
            bulletList: { label: "글머리 목록" },
            orderedList: { label: "번호 목록" },
            taskList: { label: "할 일 목록" },
          },
          advancedGroup: {
            label: "블록",
            image: { label: "이미지" },
            codeBlock: { label: "코드 블록" },
            table: { label: "표" },
            math: { label: "수식 블록" },
          },
          buildMenu(builder) {
            // 콜아웃: 인용구 항목의 동작을 재사용하고 [!NOTE] 마커를 입력
            const textGroup = builder.getGroup("text");
            const quoteItem = textGroup.group.items.find((i) => i.key === "quote");
            if (!quoteItem) return;
            textGroup.addItem("callout", {
              label: "콜아웃",
              icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h.01M11 12h6" stroke-linecap="round"/></svg>`,
              onRun: (ctx) => {
                quoteItem.onRun(ctx);
                setTimeout(
                  () => document.execCommand("insertText", false, "[!NOTE] "),
                  50
                );
              },
            });
          },
        },
      },
    });
    await crepe.create();
  }

  // Crepe ImageBlock onUpload: 파일을 저장소에 커밋하고 md에 넣을 경로를 반환
  async function uploadImage(file) {
    try {
      banner("info", "이미지 업로드 중...");
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      const safeName =
        (file.name || "image.png")
          .toLowerCase()
          .replace(/[^a-z0-9.]+/g, "-")
          .replace(/^-+|-+$/g, "") || "image.png";
      const path = `assets/images/${d.getFullYear()}/${p(d.getMonth() + 1)}/${Date.now()}-${safeName}`;

      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await GH.putFile(path, b64, `image: ${safeName} 업로드`, { isBase64: true });
      const url = `/${path}`;
      if (!$("f-thumbnail").value) $("f-thumbnail").value = url;
      banner("success", "이미지 업로드 완료");
      return url;
    } catch (err) {
      banner("error", `이미지 업로드 실패: ${esc(err.message)}`);
      throw err;
    }
  }

  async function openEditor(post) {
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
    } catch (err) {
      banner("error", esc(err.message));
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
        const { meta } = Render.parseFrontmatter(file.text);
        const slug = files[i].name.replace(/\.md$/, "");
        posts.push({
          slug,
          title: meta.title || slug,
          date: meta.date || isoNow(),
          updated: meta.updated || meta.date || isoNow(),
          category: meta.category || "미분류",
          tags: meta.tags || [],
          summary: meta.summary || "",
          thumbnail: meta.thumbnail || "",
          draft: !!meta.draft,
        });
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

  // ---------- 시작 ----------
  if (GH.getToken()) enter();
  else showView("login");
})();
