/**
 * Programador de avisos Wellness DHF en Google Apps Script (alternativa a GitHub Actions).
 * Se ejecuta cada 10 minutos con tu cuenta de Google (propietaria del proyecto Firebase),
 * así que no necesita ninguna clave secreta.
 *
 * Puesta en marcha (una vez):
 *   1. https://script.google.com → Nuevo proyecto → pega este archivo en Code.gs
 *   2. Configuración del proyecto (⚙️) → marca "Mostrar el archivo de manifiesto appsscript.json"
 *      → pega el contenido de appsscript.json
 *   3. Arriba elige la función "instalar" → Ejecutar → autoriza con tu cuenta.
 */
const PROJECT = "wellness-dhf";
const SITE_URL = "https://mariagesti2.github.io/wellness-dhf/index.html";
const TZ = "Europe/Madrid";
const TYPES = { gym: "Gym", entreno: "Entreno", partido: "Partido" };
const DEFAULT_WEEKLY = [
  { id: "lun", type: "entreno", day: 1, start: "19:00", end: "20:30" },
  { id: "mar", type: "entreno", day: 2, start: "21:00", end: "22:30" },
  { id: "jue1", type: "entreno", day: 4, start: "16:00", end: "17:30" },
  { id: "jue2", type: "entreno", day: 4, start: "19:00", end: "20:30" },
  { id: "vie", type: "entreno", day: 5, start: "16:00", end: "17:30" }
];
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("avisar").timeBased().everyMinutes(10).create();
  avisar();
  Logger.log("Listo: 'avisar' se ejecutará cada 10 minutos.");
}

/* ---------- Firestore REST ---------- */
function api_(method, url, body) {
  const r = UrlFetchApp.fetch(url, { method, contentType: "application/json", payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "x-goog-user-project": PROJECT }, muteHttpExceptions: true });
  const code = r.getResponseCode();
  if (code === 404) return null;
  if (code >= 300) throw new Error(method + " " + url + " → " + code + " " + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText() || "{}");
}
function dec_(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec_);
  if ("mapValue" in v) return decFields_(v.mapValue.fields || {});
  return null;
}
function decFields_(f) { const o = {}; for (const k in f) o[k] = dec_(f[k]); return o; }
function enc_(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(enc_) } };
  const f = {}; for (const k in x) f[k] = enc_(x[k]); return { mapValue: { fields: f } };
}
function getDoc_(path) { const d = api_("get", `${FS}/${path}`); return d ? decFields_(d.fields || {}) : null; }
function setDoc_(path, obj, fields) {
  const mask = (fields || Object.keys(obj)).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const f = {}; (fields || Object.keys(obj)).forEach(k => f[k] = enc_(obj[k]));
  api_("patch", `${FS}/${path}?${mask}`, { fields: f });
}
function query_(col, field, value) {
  const res = api_("post", `${FS}:runQuery`, { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: enc_(value) } } } });
  return (res || []).filter(r => r.document).map(r => ({ id: r.document.name.split("/").pop(), ...decFields_(r.document.fields || {}) }));
}
function listUsers_() {
  let out = [], token = "";
  do {
    const r = api_("get", `${FS}/users?pageSize=300${token ? "&pageToken=" + token : ""}`) || {};
    (r.documents || []).forEach(d => out.push({ uid: d.name.split("/").pop(), ...decFields_(d.fields || {}) }));
    token = r.nextPageToken || "";
  } while (token);
  return out;
}

/* ---------- Envío FCM ---------- */
function send_(targets, title, body, url, tag) {
  if (!targets.length) return 0;
  const list = []; targets.forEach(u => (u.tokens || []).forEach(t => list.push({ t, u })));
  const reqs = list.map(x => ({ url: `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "x-goog-user-project": PROJECT },
    payload: JSON.stringify({ message: { token: x.t, data: { title, body, url, tag }, webpush: { headers: { Urgency: "high", TTL: "21600" } } } }) }));
  const res = UrlFetchApp.fetchAll(reqs);
  let ok = 0; const bad = {};
  res.forEach((r, i) => {
    if (r.getResponseCode() === 200) ok++;
    else if (/UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/.test(r.getContentText())) (bad[list[i].u.uid] = bad[list[i].u.uid] || []).push(list[i].t);
  });
  Object.keys(bad).forEach(uid => { const u = targets.find(x => x.uid === uid); setDoc_("users/" + uid, { tokens: (u.tokens || []).filter(t => bad[uid].indexOf(t) < 0) }, ["tokens"]); });
  Logger.log(`"${title}" → ${targets.length} jugadoras, ${ok} ok, ${res.length - ok} fallos`);
  return targets.length;
}

/* ---------- Lógica (igual que scripts/notify.mjs) ---------- */
function avisar() {
  const now = new Date();
  const today = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  const nowMin = Number(Utilities.formatDate(now, TZ, "H")) * 60 + Number(Utilities.formatDate(now, TZ, "m"));
  const dow = Number(Utilities.formatDate(now, TZ, "u")) % 7;   // 0 = domingo
  if (nowMin < 7 * 60 + 30) return;                             // parado de 00:00 a 7:30
  const t2m = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  const sch = Object.assign({ wellnessTime: "08:00", rpeDelay: 0, weekly: DEFAULT_WEEKLY, events: [], skipDates: [] }, getDoc_("config/schedule") || {});
  let state = getDoc_("system/notify") || {};
  if (state.date !== today) state = { date: today, wellness: false, sent: [] };
  state.sent = state.sent || [];
  const users = listUsers_().filter(u => !u.staff && (u.tokens || []).length);

  // 0) Avisos del cuerpo técnico
  query_("messages", "status", "pending").forEach(m => {
    let targets = users;
    if (m.target === "pending_wellness" || m.target === "pending_rpe") {
      const done = {}; query_(m.target === "pending_wellness" ? "wellness" : "rpe", "date", today).forEach(d => done[d.uid] = 1);
      targets = users.filter(u => !done[u.uid]);
    } else if (m.target === "some") targets = users.filter(u => (m.uids || []).indexOf(u.uid) >= 0);
    const url = m.target === "pending_wellness" ? SITE_URL + "?f=wellness" : m.target === "pending_rpe" ? SITE_URL + "?f=rpe" : SITE_URL;
    send_(targets, "Wellness DHF", String(m.text || "").slice(0, 250), url, "msg-" + m.id);
    setDoc_("messages/" + m.id, { status: "sent", sentAt: Date.now(), count: targets.length }, ["status", "sentAt", "count"]);
  });

  // 1) Wellness
  const wT = t2m(sch.wellnessTime || "08:00");
  if (!state.wellness && nowMin >= wT && nowMin < wT + 240) {
    const done = {}; query_("wellness", "date", today).forEach(d => done[d.uid] = 1);
    send_(users.filter(u => !done[u.uid]), "Buenos días 🏑", "Rellena el wellness de hoy (30 segundos)", SITE_URL + "?f=wellness", "wellness");
    state.wellness = true;
  }

  // 2) RPE al acabar cada sesión
  const sessions = ((sch.skipDates || []).indexOf(today) >= 0 ? [] : (sch.weekly || []).filter(w => Number(w.day) === dow))
    .concat((sch.events || []).filter(e => e.date === today));
  let rpeToday = null;
  sessions.forEach(s => {
    const key = (s.id || s.type) + "_" + s.start, at = t2m(s.end) + Number(sch.rpeDelay || 0);
    if (state.sent.indexOf(key) >= 0 || nowMin < at || nowMin > at + 180) return;
    rpeToday = rpeToday || query_("rpe", "date", today);
    const done = {}; rpeToday.filter(r => r.slot ? r.slot === s.id : r.type === s.type).forEach(r => done[r.uid] = 1);
    send_(users.filter(u => !done[u.uid]), "RPE " + (TYPES[s.type] || s.type), "¿Qué esfuerzo te ha supuesto la sesión? Regístralo ahora",
      `${SITE_URL}?f=rpe&type=${s.type}&date=${today}&s=${encodeURIComponent(s.id || "")}`, "rpe-" + s.type);
    state.sent.push(key);
  });

  setDoc_("system/notify", state, ["date", "wellness", "sent"]);
}
