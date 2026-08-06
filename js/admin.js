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
  let editor = null; // Toast UI 인스턴스
  let pollTimer = null;

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
          <div class="sub"><span class="category">${esc(p.category || "미분류")}</span> · ${Posts.formatDate(p.date)} · ${esc(p.slug)}</div>
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
  function categoryUsage(cat) {
    return index.posts.filter((p) => (p.category || "미분류") === cat).length;
  }

  function renderCats() {
    const listEl = $("cats-list");
    if (!index.categories.length) {
      listEl.innerHTML = `<div class="empty-state"><p>아직 카테고리가 없어요. 위에서 추가해 보세요.</p></div>`;
      return;
    }
    listEl.innerHTML = index.categories
      .map((c) => {
        const n = categoryUsage(c);
        return `
      <div class="manage-row" data-cat="${esc(c)}">
        <div class="info">
          <div class="title">${esc(c)}</div>
          <div class="sub">글 ${n}개</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-danger btn-sm" data-action="del-cat" ${n ? "disabled title='글이 있는 카테고리는 삭제할 수 없어요'" : ""}>삭제</button>
        </div>
      </div>`;
      })
      .join("");
  }

  async function addCategory() {
    const name = $("new-cat").value.trim();
    if (!name) return;
    if (index.categories.includes(name)) return banner("error", "이미 있는 카테고리예요.");
    try {
      banner("info", "카테고리 저장 중...");
      index.categories.push(name);
      await GH.putFile(INDEX_PATH, JSON.stringify(index, null, 2), `categories: ${name} 추가`);
      $("new-cat").value = "";
      renderCats();
      banner("success", `"${esc(name)}" 카테고리를 추가했어요.`);
    } catch (err) {
      index.categories = index.categories.filter((c) => c !== name);
      banner("error", `저장 실패: ${esc(err.message)}`);
    }
  }

  async function removeCategory(name) {
    if (categoryUsage(name)) return;
    if (!confirm(`"${name}" 카테고리를 삭제할까요?`)) return;
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

  // ---------- 에디터 ----------
  function ensureEditor() {
    if (editor) return editor;
    editor = new toastui.Editor({
      el: $("editor"),
      height: "620px",
      initialEditType: "markdown",
      previewStyle: "vertical",
      usageStatistics: false,
      theme: Theme.current() === "dark" ? "dark" : "default",
      placeholder: "내용을 입력하세요...",
      hooks: { addImageBlobHook: uploadImage },
      customHTMLRenderer: {
        // 저장 전엔 /assets/... 가 아직 배포 전이라 미리보기에서 깨짐 → 미리보기만 raw URL로 치환
        image(node, context) {
          const result = context.origin();
          const src = node.destination || "";
          if (src.startsWith("/assets/")) {
            result.attrs = result.attrs || {};
            result.attrs.src = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}${src}`;
          }
          return result;
        },
      },
    });
    document.addEventListener("themechange", (e) => {
      const ui = document.querySelector(".toastui-editor-defaultUI");
      if (ui) ui.classList.toggle("toastui-editor-dark", e.detail.theme === "dark");
    });
    return editor;
  }

  async function uploadImage(blob, callback) {
    try {
      banner("info", "이미지 업로드 중...");
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      const safeName = (blob.name || "image.png")
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const path = `assets/images/${d.getFullYear()}/${p(d.getMonth() + 1)}/${Date.now()}-${safeName}`;

      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await GH.putFile(path, b64, `image: ${safeName} 업로드`, { isBase64: true });
      const url = `/${path}`;
      if (!$("f-thumbnail").value) $("f-thumbnail").value = url;
      banner("success", "이미지 업로드 완료");
      callback(url, safeName);
    } catch (err) {
      banner("error", `이미지 업로드 실패: ${esc(err.message)}`);
    }
  }

  function openEditor(post) {
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
    const current = post ? post.category || "미분류" : "미분류";
    const options = [...new Set(["미분류", ...index.categories, current])];
    $("f-category").innerHTML = options
      .map((c) => `<option value="${esc(c)}" ${c === current ? "selected" : ""}>${esc(c)}</option>`)
      .join("");

    showView("editor");
    ensureEditor().setMarkdown("");

    if (post) {
      banner("info", "글 내용 불러오는 중...");
      GH.getFile(`posts/${post.slug}.md`)
        .then((file) => {
          if (!file) throw new Error("md 파일이 없습니다. 인덱스 재빌드를 해보세요.");
          const { body } = Render.parseFrontmatter(file.text);
          editor.setMarkdown(body);
          banner();
        })
        .catch((err) => banner("error", esc(err.message)));
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
      const md = Render.buildFrontmatter(meta) + "\n\n" + ensureEditor().getMarkdown().trim() + "\n";
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
      const cats = [
        ...new Set([
          ...(index.categories || []),
          ...posts.map((p) => p.category).filter((c) => c && c !== "미분류"),
        ]),
      ];
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
    const btn = e.target.closest("[data-action='del-cat']");
    if (!btn || btn.disabled) return;
    removeCategory(btn.closest(".manage-row").dataset.cat);
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
