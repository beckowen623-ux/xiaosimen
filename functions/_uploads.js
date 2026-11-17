// 已购用户上传新卷子（两站共用，文件放 R2 存储桶 quiz-uploads，90 天自动删除）。
// 防爆：单个文件 ≤ 15MB，每个兑换码每天 ≤ 5 个，全站总量 ≤ 5GB，超出直接拒绝，不会产生意外费用。
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOADS_PER_DAY = 5;
export const TOTAL_UPLOAD_CAP = 5 * 1024 * 1024 * 1024;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function decodeHeader(value, max) {
  try {
    return decodeURIComponent(String(value || "")).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  } catch {
    return "";
  }
}

export async function handleUpload({ request, env }, row, site) {
  if (request.method !== "POST") return json({ ok: false }, 405);
  // 自定义请求头会触发跨站预检，配合 SameSite=Lax 的登录 Cookie，别的网站无法替用户上传。
  if (request.headers.get("X-Upload") !== "1") return json({ ok: false, message: "请求无效。" }, 400);
  if (!env.UPLOADS) return json({ ok: false, message: "上传服务暂未开通。" }, 503);
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return json({ ok: false, message: "只支持照片、PDF、Word（.docx）和 TXT 文件。" }, 415);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES) return json({ ok: false, message: "文件超过 15MB。PDF 太大的话，可以分页拍照上传。" }, 413);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const usage = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM user_uploads WHERE code_id = ? AND created_at > ?) AS today, " +
    "(SELECT COALESCE(SUM(size), 0) FROM user_uploads WHERE status <> 'deleted' AND created_at > ?) AS total"
  ).bind(row.id, since, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()).first();
  if (Number(usage?.today || 0) >= MAX_UPLOADS_PER_DAY) {
    return json({ ok: false, message: `每天最多上传 ${MAX_UPLOADS_PER_DAY} 个文件，明天再来吧。` }, 429);
  }
  if (Number(usage?.total || 0) >= TOTAL_UPLOAD_CAP) {
    return json({ ok: false, message: "这阵子收到的卷子太多了，作者正在整理，过几天再传吧。" }, 503);
  }

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json({ ok: false, message: "文件是空的。" }, 400);
  if (data.byteLength > MAX_UPLOAD_BYTES) return json({ ok: false, message: "文件超过 15MB。PDF 太大的话，可以分页拍照上传。" }, 413);

  const now = new Date().toISOString();
  const id = [...crypto.getRandomValues(new Uint8Array(10))].map(b => b.toString(16).padStart(2, "0")).join("");
  const key = `uploads/${site}/${now.slice(0, 10)}/${id}.${ext}`;
  const fileName = decodeHeader(request.headers.get("X-File-Name"), 120) || `upload.${ext}`;
  const note = decodeHeader(request.headers.get("X-Note"), 300);
  await env.UPLOADS.put(key, data, { httpMetadata: { contentType: type } });
  await env.DB.prepare(
    "INSERT INTO user_uploads (code_id, site, object_key, file_name, content_type, size, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(row.id, site, key, fileName, type, data.byteLength, note, now).run();
  return json({ ok: true, uploads: await myUploads(env.DB, row.id) });
}

export async function myUploads(DB, codeId) {
  const { results } = await DB.prepare(
    "SELECT file_name, status, created_at FROM user_uploads WHERE code_id = ? AND status <> 'deleted' ORDER BY id DESC LIMIT 20"
  ).bind(codeId).all();
  return (results || []).map(r => ({ name: r.file_name, status: r.status, at: r.created_at }));
}

export async function listMyUploads({ request, env }, row) {
  if (request.method !== "POST") return json({ ok: false }, 405);
  return json({ ok: true, uploads: await myUploads(env.DB, row.id) });
}
