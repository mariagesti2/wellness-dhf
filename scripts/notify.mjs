// Envía los avisos push. Lo ejecuta GitHub Actions cada 10 minutos.
// Necesita el secreto FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio).
import admin from "firebase-admin";

const SITE_URL = process.env.SITE_URL || "./index.html";
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const TYPES = { gym: "Gym", entreno: "Entreno", partido: "Partido" };

// Fecha y hora en Madrid
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
  .formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowMin = +parts.hour * 60 + +parts.minute;
const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
const t2m = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);

// Parado por la noche (00:00–07:29 hora de Madrid), salvo si se lanza a mano
if (nowMin < 7 * 60 + 30 && process.env.GITHUB_EVENT_NAME === "schedule") { console.log(`Madrid ${parts.hour}:${parts.minute} · horario nocturno, no se hace nada`); process.exit(0); }

const DEFAULT_WEEKLY = [
    { id: "lun", type: "entreno", day: 1, start: "19:00", end: "20:30" },
    { id: "mar", type: "entreno", day: 2, start: "21:00", end: "22:30" },
    { id: "jue1", type: "entreno", day: 4, start: "16:00", end: "17:30" },
    { id: "jue2", type: "entreno", day: 4, start: "19:00", end: "20:30" },
    { id: "vie", type: "entreno", day: 5, start: "16:00", end: "17:30" }
  ];
const sch = { wellnessTime: "08:00", rpeDelay: 0, weekly: DEFAULT_WEEKLY, events: [], skipDates: [], ...((await db.doc("config/schedule").get()).data() || {}) };
const stateRef = db.doc("system/notify");
let state = (await stateRef.get()).data() || {};
if (state.date !== today) state = { date: today, wellness: false, sent: [] };

const users = (await db.collection("users").get()).docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => !u.staff && (u.tokens || []).length);
console.log(`Madrid ${today} ${parts.hour}:${parts.minute} · ${users.length} jugadoras con avisos activados`);

async function send(targets, title, body, url, tag) {
  if (!targets.length) return;
  const tokens = targets.flatMap(u => u.tokens.map(t => ({ t, uid: u.uid })));
  const res = await admin.messaging().sendEach(tokens.map(x => ({ token: x.t, data: { title, body, url, tag }, webpush: { headers: { Urgency: "high", TTL: "21600" } } })));
  const bad = res.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || "")) ? tokens[i] : null).filter(Boolean);
  for (const b of bad) await db.doc(`users/${b.uid}`).update({ tokens: admin.firestore.FieldValue.arrayRemove(b.t) });
  console.log(`  "${title}" → ${targets.length} jugadoras, ${res.successCount} ok, ${res.failureCount} fallos (${bad.length} tokens eliminados)`);
}

// 0) Mensaje de prueba lanzado a mano: a todas las personas con avisos activados
if (process.env.TEST_MSG) {
  const all = (await db.collection("users").get()).docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => (u.tokens || []).length);
  await send(all, "Wellness DHF", process.env.TEST_MSG, SITE_URL, "prueba");
  process.exit(0);
}

// 0) Avisos escritos por el cuerpo técnico desde la app (colección "messages")
const pend = await db.collection("messages").where("status", "==", "pending").get();
for (const doc of pend.docs) {
  const m = doc.data();
  let targets = users;
  if (m.target === "pending_wellness" || m.target === "pending_rpe") {
    const col = m.target === "pending_wellness" ? "wellness" : "rpe";
    const done = new Set((await db.collection(col).where("date", "==", today).get()).docs.map(d => d.data().uid));
    targets = users.filter(u => !done.has(u.uid));
  } else if (m.target === "some") targets = users.filter(u => (m.uids || []).includes(u.uid));
  await send(targets, "Wellness DHF", String(m.text || "").slice(0, 250), m.target === "pending_wellness" ? `${SITE_URL}?f=wellness` : m.target === "pending_rpe" ? `${SITE_URL}?f=rpe` : SITE_URL, "msg-" + doc.id);
  await doc.ref.update({ status: "sent", sentAt: Date.now(), count: targets.length });
}

// 1) Wellness a la hora indicada (con margen de 4 h por si GitHub se retrasa)
const wT = t2m(sch.wellnessTime);
if (!state.wellness && nowMin >= wT && nowMin < wT + 240) {
  const done = new Set((await db.collection("wellness").where("date", "==", today).get()).docs.map(d => d.data().uid));
  await send(users.filter(u => !done.has(u.uid)), "Buenos días 🏑", "Rellena el wellness de hoy (30 segundos)", `${SITE_URL}?f=wellness`, "wellness");
  state.wellness = true;
}

// 2) RPE al acabar cada sesión del día
const sessions = [
  ...(sch.skipDates.includes(today) ? [] : sch.weekly.filter(w => +w.day === dow)),
  ...sch.events.filter(e => e.date === today)
];
for (const s of sessions) {
  const key = `${s.id || s.type}_${s.start}`, at = t2m(s.end) + (+sch.rpeDelay || 0);
  if (state.sent.includes(key) || nowMin < at || nowMin > at + 180) continue;
  const done = new Set((await db.collection("rpe").where("date", "==", today).get()).docs.map(d => d.data()).filter(r => r.slot ? r.slot === s.id : r.type === s.type).map(r => r.uid));
  await send(users.filter(u => !done.has(u.uid)), `RPE ${TYPES[s.type] || s.type}`, "¿Qué esfuerzo te ha supuesto la sesión? Regístralo ahora", `${SITE_URL}?f=rpe&type=${s.type}&date=${today}&s=${encodeURIComponent(s.id || "")}`, "rpe-" + s.type);
  state.sent.push(key);
}

await stateRef.set(state);
process.exit(0);
