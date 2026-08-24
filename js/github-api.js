// @ts-check
// GitHub Contents API 래퍼 — admin 전용 쓰기 경로
// 주의: 수정/삭제는 sha 필수(422), stale sha는 409 → sha 캐시 + 1회 재시도로 처리
const GH = (() => {
  const API = "https://api.github.com";
  const TOKEN_KEY = "gh_token";
  const shaCache = new Map();

  const repoPath = () => `/repos/${CONFIG.owner}/${CONFIG.repo}`;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }
  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, t.trim());
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    shaCache.clear();
  }

  async function request(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${getToken()}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  // ---------- UTF-8 안전 base64 (btoa(한글)은 InvalidCharacterError) ----------
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  // ---------- 조회 ----------
  // 호출한 쪽이 원인을 구분할 수 있도록 err.status 를 함께 실어 보낸다.
  // (admin은 401일 때만 토큰을 지운다 — 다른 실패로 자격증명까지 잃으면 안 된다)
  function httpError(message, status) {
    const err = /** @type {Error & { status?: number }} */ (new Error(message));
    err.status = status;
    return err;
  }

  async function verifyToken() {
    const res = await request("GET", repoPath());
    if (res.status === 401) throw httpError("토큰이 유효하지 않습니다.", 401);
    if (res.status === 404)
      throw httpError("저장소에 접근할 수 없습니다. 토큰의 Repository access를 확인하세요.", 404);
    if (res.status === 403)
      throw httpError("접근이 거부됐어요. 요청 한도에 걸렸거나 토큰 권한이 부족합니다.", 403);
    if (!res.ok) throw httpError(`저장소 확인 실패 (${res.status})`, res.status);
    return res.json();
  }

  // 파일 내용+sha. 404면 null
  async function getFile(path) {
    const res = await request(
      "GET",
      `${repoPath()}/contents/${encodePath(path)}?ref=${CONFIG.branch}&t=${Date.now()}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw httpError(`${path} 읽기 실패 (${res.status})`, res.status);
    const data = await res.json();
    shaCache.set(path, data.sha);
    return { text: base64ToUtf8(data.content), sha: data.sha };
  }

  async function getShaOrNull(path) {
    if (shaCache.has(path)) return shaCache.get(path);
    const file = await getFile(path);
    return file ? file.sha : null;
  }

  async function listDir(path) {
    const res = await request(
      "GET",
      `${repoPath()}/contents/${encodePath(path)}?ref=${CONFIG.branch}&t=${Date.now()}`
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${path} 목록 조회 실패 (${res.status})`);
    return res.json();
  }

  // ---------- 쓰기 ----------
  // content: isBase64면 base64 문자열 그대로(이미지), 아니면 일반 텍스트
  async function putFile(path, content, message, { isBase64 = false } = {}) {
    const doPut = async (sha) => {
      const body = {
        message,
        branch: CONFIG.branch,
        content: isBase64 ? content : utf8ToBase64(content),
      };
      if (sha) body.sha = sha;
      return request("PUT", `${repoPath()}/contents/${encodePath(path)}`, body);
    };

    let sha = await getShaOrNull(path);
    let res = await doPut(sha);

    // stale sha 경합 → sha 재조회 후 1회 재시도
    if (res.status === 409 || res.status === 422) {
      shaCache.delete(path);
      sha = await getShaOrNull(path);
      res = await doPut(sha);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${path} 저장 실패 (${res.status}) ${err.message || ""}`);
    }
    const data = await res.json();
    shaCache.set(path, data.content.sha);
    return data;
  }

  async function deleteFile(path, message) {
    const doDelete = (sha) =>
      request("DELETE", `${repoPath()}/contents/${encodePath(path)}`, {
        message,
        branch: CONFIG.branch,
        sha,
      });

    shaCache.delete(path); // 삭제는 항상 최신 sha로
    let sha = await getShaOrNull(path);
    if (!sha) return; // 이미 없음
    let res = await doDelete(sha);
    if (res.status === 409 || res.status === 422) {
      shaCache.delete(path);
      sha = await getShaOrNull(path);
      if (!sha) return;
      res = await doDelete(sha);
    }
    shaCache.delete(path);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${path} 삭제 실패 (${res.status}) ${err.message || ""}`);
    }
  }

  return {
    getToken,
    setToken,
    clearToken,
    verifyToken,
    getFile,
    listDir,
    putFile,
    deleteFile,
    utf8ToBase64,
  };
})();
