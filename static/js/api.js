// Sunucu ile konuşan küçük yardımcılar.

async function parse(res) {
  let data = null;
  try { data = await res.json(); } catch { /* boş yanıt */ }
  if (!res.ok) {
    if (res.status === 401 && !res.url.endsWith("/api/login")) window.dispatchEvent(new Event("session-expired"));
    const msg = (data && (data.error || data.detail)) || `İstek başarısız oldu (${res.status}).`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export async function getJSON(url) {
  return parse(await fetch(url));
}

export async function postJSON(url, body) {
  return parse(await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }));
}

/** Dosyaları yükler; ilerleme için XHR kullanır. */
export function upload(files, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status === 401) window.dispatchEvent(new Event("session-expired"));
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* yok */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data && (data.error || data.detail)) || "Yükleme başarısız oldu."));
    };
    xhr.onerror = () => reject(new Error("Sunucuya ulaşılamadı. Uygulama penceresi kapanmış olabilir."));
    xhr.send(fd);
  });
}

export const process = (tool, files, options) => postJSON(`/api/process/${tool}`, { files, options });
export const pageUrl = (id, n, w) => `/api/files/${id}/page/${n}?w=${Math.max(40, Math.round(w))}`;
export const downloadUrl = (id, inline = false) => `/api/files/${id}/download${inline ? "?inline=true" : ""}`;
export const fileInfo = (id) => getJSON(`/api/files/${id}`);
export const unlock = (id, password) => postJSON(`/api/files/${id}/password`, { password });
export const pageText = (id, n) => getJSON(`/api/files/${id}/text/${n}`);
export const fields = (id) => getJSON(`/api/files/${id}/fields`);
export const detectFields = (id, pages) => postJSON(`/api/files/${id}/detect-fields`, pages ? { pages } : {});
export const search = (id, body) => postJSON(`/api/files/${id}/search`, body);
export const meta = (id) => getJSON(`/api/files/${id}/meta`);
export const capabilities = () => getJSON("/api/capabilities");
export const settings = () => getJSON("/api/settings");
export const saveSettings = (body) => postJSON("/api/settings", body);
export const runtime = () => getJSON("/api/runtime");
export const login = (password) => postJSON("/api/login", { password });
export const logout = () => postJSON("/api/logout", {});
export const clearFiles = () => fetch("/api/files", { method: "DELETE" }).then(parse);
