/* Capa de datos: Firebase (real) o Demo (datos inventados en el navegador) */
(function (root) {
  const CFG = root.APP_CONFIG;
  const FB_VER = "10.12.2";
  const today = () => U.isoDate(new Date());
  const U = root.U = {
    isoDate: d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); },
    addDays: (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return U.isoDate(d); },
    dow: iso => new Date(iso + "T12:00:00").getDay(),
    today
  };
  const DEFAULT_SCHEDULE = { wellnessTime: "08:00", rpeDelay: 15, weekly: [], events: [], skipDates: [] };

  /* ======================= DEMO ======================= */
  function DemoStore() {
    const KEY = "dhf-wellness-demo-v1";
    let db = null, user = null, listeners = [];
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { } };
    function seed() {
      const players = CFG.roster.map((n, i) => ({ uid: "p" + i, name: n, email: n.split(" ")[0].toLowerCase() + i + "@demo" }));
      const schedule = {
        wellnessTime: "08:00", rpeDelay: 15, skipDates: [],
        weekly: [
          { id: "w1", type: "entreno", day: 1, start: "19:30", end: "21:00" },
          { id: "w2", type: "gym", day: 2, start: "18:00", end: "19:00" },
          { id: "w3", type: "entreno", day: 3, start: "19:30", end: "21:00" },
          { id: "w4", type: "gym", day: 4, start: "18:00", end: "19:00" },
          { id: "w5", type: "entreno", day: 5, start: "19:30", end: "21:00" }
        ],
        events: []
      };
      for (let d = -42; d <= 21; d++) { const iso = U.addDays(today(), d); if (U.dow(iso) === 6) schedule.events.push({ id: "e" + iso, date: iso, type: "partido", start: "12:00", end: "13:30", label: "Liga" }); }
      const wellness = {}, rpe = {};
      let s = 7;
      const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const clamp = v => Math.max(0, Math.min(5, Math.round(v)));
      players.forEach((p, pi) => {
        const base = { stress: 1.5 + rnd() * 1.5, sleep: 3 + rnd() * 1.5, pain: 1 + rnd() * 1.5, fatigue: 1.5 + rnd(), mood: 3 + rnd() * 1.5 };
        for (let d = -42; d <= 0; d++) {
          const iso = U.addDays(today(), d);
          if (d === 0 && pi % 3 === 0) continue;           // algunas aún no lo han rellenado hoy
          if (rnd() < 0.08) continue;                      // días olvidados
          const post = U.dow(iso) === 0 ? 1.2 : 0;          // domingo tras partido
          wellness[p.uid + "_" + iso] = {
            id: p.uid + "_" + iso, uid: p.uid, name: p.name, date: iso,
            stress: clamp(base.stress + (rnd() - .5) * 2), sleep: clamp(base.sleep + (rnd() - .5) * 2),
            pain: clamp(base.pain + post + (rnd() - .5) * 2), fatigue: clamp(base.fatigue + post + (rnd() - .5) * 2),
            mood: clamp(base.mood + (rnd() - .5) * 2), comments: rnd() < .05 ? "Molestia en el gemelo" : "", ts: Date.now()
          };
          sessionsOn(schedule, iso).forEach(se => {
            if (d === 0 || rnd() < 0.07) return;
            const r = se.type === "partido" ? 7 + Math.round(rnd() * 2) : se.type === "entreno" ? 5 + Math.round(rnd() * 3) : 4 + Math.round(rnd() * 3);
            const m = se.type === "partido" ? 50 + Math.round(rnd() * 25) : minutesBetween(se.start, se.end);
            rpe[p.uid + "_" + iso + "_" + se.type] = { id: p.uid + "_" + iso + "_" + se.type, uid: p.uid, name: p.name, date: iso, type: se.type, rpe: r, minutes: m, load: r * m, comments: "", ts: Date.now() };
          });
        }
      });
      return { players, schedule, wellness, rpe };
    }
    return {
      mode: "demo",
      async init() {
        try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { }
        if (!db || !db.players) { db = seed(); save(); }
      },
      onAuth(cb) { listeners.push(cb); cb(user); },
      demoLogin(who) {
        if (who === "coach") user = { uid: "coach", name: "Preparador físico", email: "coach@demo", isCoach: true };
        else { const p = db.players.find(p => p.uid === who); user = { ...p, isCoach: false }; }
        listeners.forEach(f => f(user));
      },
      demoPlayers: () => db.players,
      async signOut() { user = null; listeners.forEach(f => f(null)); },
      resetDemo() { db = seed(); save(); },
      async saveWellness(e) { const id = user.uid + "_" + e.date; db.wellness[id] = { ...e, id, uid: user.uid, name: user.name, ts: Date.now() }; save(); },
      async myWellness() { return Object.values(db.wellness).filter(w => w.uid === user.uid); },
      async saveRpe(e) { const id = user.uid + "_" + e.date + "_" + e.type; db.rpe[id] = { ...e, id, uid: user.uid, name: user.name, ts: Date.now() }; save(); },
      async myRpe() { return Object.values(db.rpe).filter(w => w.uid === user.uid); },
      async deleteRpe(id) { delete db.rpe[id]; save(); },
      async teamWellness(from) { return Object.values(db.wellness).filter(w => w.date >= from); },
      async teamRpe(from) { return Object.values(db.rpe).filter(w => w.date >= from); },
      async players() { return db.players; },
      async getSchedule() { return { ...DEFAULT_SCHEDULE, ...db.schedule }; },
      async saveSchedule(s) { db.schedule = s; save(); },
      async enablePush() { return "En modo demo no hay notificaciones. Funcionarán cuando conectes Firebase."; }
    };
  }

  /* ======================= FIREBASE ======================= */
  function FirebaseStore() {
    let A, F, M, app, auth, fs, user = null;
    const listeners = [];
    const load = p => import(`https://www.gstatic.com/firebasejs/${FB_VER}/${p}.js`);
    async function profile(u) {
      const snap = await F.getDoc(F.doc(fs, "users", u.uid));
      let isCoach = false;
      try { const a = await F.getDoc(F.doc(fs, "config", "admins")); isCoach = (a.data()?.emails || []).map(e => e.toLowerCase()).includes((u.email || "").toLowerCase()); } catch (e) { }
      return { uid: u.uid, email: u.email, name: snap.data()?.name || u.email, isCoach };
    }
    const list = async (q) => (await F.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      mode: "firebase",
      async init() {
        const [a, f] = await Promise.all([load("firebase-app"), load("firebase-auth")]);
        F = await load("firebase-firestore"); A = f;
        app = a.initializeApp(CFG.firebase); auth = A.getAuth(app); fs = F.getFirestore(app);
        A.onAuthStateChanged(auth, async u => { user = u ? await profile(u) : null; listeners.forEach(cb => cb(user)); });
      },
      onAuth(cb) { listeners.push(cb); },
      async signIn(email, pw) { await A.signInWithEmailAndPassword(auth, email, pw); },
      async signUp(email, pw, name, staff) {
        const c = await A.createUserWithEmailAndPassword(auth, email, pw);
        await F.setDoc(F.doc(fs, "users", c.user.uid), { name, email, staff: !!staff, created: Date.now() }, { merge: true });
        user = await profile(c.user); listeners.forEach(cb => cb(user));
      },
      async resetPassword(email) { await A.sendPasswordResetEmail(auth, email); },
      async signOut() { await A.signOut(auth); },
      async saveWellness(e) { const id = user.uid + "_" + e.date; await F.setDoc(F.doc(fs, "wellness", id), { ...e, uid: user.uid, name: user.name, ts: Date.now() }); },
      async myWellness() { return list(F.query(F.collection(fs, "wellness"), F.where("uid", "==", user.uid))); },
      async saveRpe(e) { const id = user.uid + "_" + e.date + "_" + e.type; await F.setDoc(F.doc(fs, "rpe", id), { ...e, uid: user.uid, name: user.name, ts: Date.now() }); },
      async myRpe() { return list(F.query(F.collection(fs, "rpe"), F.where("uid", "==", user.uid))); },
      async deleteRpe(id) { await F.deleteDoc(F.doc(fs, "rpe", id)); },
      async teamWellness(from) { return list(F.query(F.collection(fs, "wellness"), F.where("date", ">=", from))); },
      async teamRpe(from) { return list(F.query(F.collection(fs, "rpe"), F.where("date", ">=", from))); },
      async players() { return (await list(F.collection(fs, "users"))).map(u => ({ uid: u.id, name: u.name, email: u.email, staff: !!u.staff, hasPush: (u.tokens || []).length > 0 })); },
      async getSchedule() { const s = await F.getDoc(F.doc(fs, "config", "schedule")); return { ...DEFAULT_SCHEDULE, ...(s.data() || {}) }; },
      async saveSchedule(s) { await F.setDoc(F.doc(fs, "config", "schedule"), s); },
      async enablePush() {
        if (!("Notification" in root) || !("serviceWorker" in navigator)) return "Este navegador no admite notificaciones. En iPhone: abre la app desde el icono de la pantalla de inicio (iOS 16.4 o superior).";
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return "Has bloqueado las notificaciones. Actívalas en los ajustes del navegador/móvil.";
        M = M || await load("firebase-messaging");
        if (!(await M.isSupported())) return "Este navegador no admite notificaciones push.";
        const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
        await navigator.serviceWorker.ready;
        const token = await M.getToken(M.getMessaging(app), { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
        await F.setDoc(F.doc(fs, "users", user.uid), { tokens: F.arrayUnion(token) }, { merge: true });
        return "ok";
      }
    };
  }

  function minutesBetween(a, b) { const m = t => +t.slice(0, 2) * 60 + +t.slice(3, 5); return Math.max(0, m(b) - m(a)); }
  function sessionsOn(sch, iso) {
    if ((sch.skipDates || []).includes(iso)) return (sch.events || []).filter(e => e.date === iso);
    const dw = U.dow(iso);
    return [...(sch.weekly || []).filter(w => +w.day === dw), ...(sch.events || []).filter(e => e.date === iso)]
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  U.minutesBetween = minutesBetween; U.sessionsOn = sessionsOn;

  root.Store = CFG.firebase && CFG.firebase.apiKey ? FirebaseStore() : DemoStore();
})(self);
