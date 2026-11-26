// 公开只读流媒体代理：从 R2 桶 MEDIA (x4m-media) 读取 shows/* 视频与封面图，完整支持 HTTP 206 拖拽快进与边缘缓存。
const ALLOWED_PREFIX = "shows/";
const SAFE_KEY_RE = /^shows\/[a-z0-9][a-z0-9._/-]{0,120}\.(?:mp4|webm|jpg|jpeg|webp|png|mp3)$/i;

export async function onRequestGet({ request, env, params }) {
  return serveMedia(request, env, params, false);
}

export async function onRequestHead({ request, env, params }) {
  return serveMedia(request, env, params, true);
}

async function serveMedia(request, env, params, headOnly) {
  if (!env.MEDIA) {
    return new Response("MEDIA R2 binding is not configured on this Pages project.", { status: 503 });
  }
  const parts = Array.isArray(params?.path) ? params.path : [params?.path].filter(Boolean);
  const key = parts.join("/");
  if (!key.startsWith(ALLOWED_PREFIX) || key.includes("..") || !SAFE_KEY_RE.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  if (rangeHeader && !headOnly) {
    const head = await env.MEDIA.head(key);
    if (!head) return new Response("Not found", { status: 404 });
    const size = head.size;
    const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!m) return new Response("Invalid Range", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    let start = m[1] ? Number(m[1]) : 0;
    let end = m[2] ? Number(m[2]) : size - 1;
    if (!m[1] && m[2]) {
      const suffix = Number(m[2]);
      start = Math.max(0, size - suffix);
      end = size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
      return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const length = end - start + 1;
    const obj = await env.MEDIA.get(key, { range: { offset: start, length } });
    if (!obj) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(length));
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(obj.body, { status: 206, headers });
  }

  const obj = headOnly ? await env.MEDIA.head(key) : await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(obj.size));
  headers.set("Cache-Control", "public, max-age=86400");
  return new Response(headOnly ? null : obj.body, { status: 200, headers });
}
