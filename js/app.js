(function () {
  const CFG = APP_CONFIG, $ = s => document.querySelector(s), view = $("#view");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const METRICS = [
    { k: "stress", n: "Nivel de estrés", s: "Estrés", bad: true },
    { k: "sleep", n: "Calidad del sueño", s: "Sueño", bad: false },
    { k: "pain", n: "Nivel de dolor muscular", s: "Dolor", bad: true },
    { k: "fatigue", n: "Nivel de fatiga", s: "Fatiga", bad: true },
    { k: "mood", n: "Mood / Humor de hoy", s: "Humor", bad: false }
  ];
  const TYPES = { gym: { n: "Gym", c: "#2a78d6" }, entreno: { n: "Entreno", c: "#eb6834" }, partido: { n: "Partido", c: "#1baf7a" } };
  const RPE = [
    null,
    { t: "Muy ligera", d: "Casi sin esfuerzo, poco más que estar sentada.", c: "#6a93f5" },
    { t: "Ligera", d: "Podrías mantenerlo horas. Respiras y hablas con facilidad.", c: "#6fdcdc" },
    { t: "Ligera", d: "Podrías mantenerlo horas. Respiras y hablas con facilidad.", c: "#6fdcdc" },
    { t: "Moderada", d: "Respiras fuerte, puedes mantener una conversación corta.", c: "#7be05a" },
    { t: "Moderada", d: "Respiras fuerte, puedes mantener una conversación corta. Empieza a costar.", c: "#7be05a" },
    { t: "Moderada", d: "Todavía algo cómoda, pero cada vez más exigente.", c: "#7be05a" },
    { t: "Vigorosa", d: "Al límite de lo incómodo. Te falta el aire, puedes decir una frase.", c: "#f0c75a" },
    { t: "Vigorosa", d: "Al límite de lo incómodo. Te falta el aire, puedes decir una frase.", c: "#f0c75a" },
    { t: "Muy dura", d: "Muy difícil mantener la intensidad. Apenas puedes decir unas palabras.", c: "#ea8a46" },
    { t: "Esfuerzo máximo", d: "Casi imposible seguir. Sin aliento, no puedes hablar.", c: "#e0533a" }
  ];
  const WCH = [
    { k: "sleepMin", n: "Horas de sueño", u: "h", min: 0, max: 10, f: x => Math.round(x / 6) / 10 },
    { k: "sleepScore", n: "Puntuación sueño", u: "/100", min: 0, max: 100 },
    { k: "hrv", n: "VFC (HRV)", u: "ms" },
    { k: "hrRest", n: "FC basal", u: "lpm" }
  ];
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  let me = null, schedule = null, tab = null, cache = null, selPlayer = null, weeks = 4, teamDate = U.today();
  let installEvt = null;

  /* ---------- utilidades ---------- */
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); }
  const fmtDate = iso => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }); };
  const index = w => w ? Math.round(((w.sleep + w.mood + (5 - w.stress) + (5 - w.pain) + (5 - w.fatigue)) / 25) * 100) : null;
  const level = (m, v) => v == null ? "" : m.bad ? (v >= 4 ? "hi" : v === 3 ? "mid" : "") : (v <= 1 ? "hi" : v === 2 ? "mid" : "");
  const idxPill = i => i == null ? '<span class="pill">—</span>' : `<span class="pill ${i >= 65 ? "ok" : i >= 50 ? "warn" : "bad"}">${i >= 65 ? "✓" : i >= 50 ? "!" : "▲"} ${i}%</span>`;
  function alertsOf(w) {
    if (!w) return [];
    const a = METRICS.filter(m => level(m, w[m.k]) === "hi").map(m => m.s);
    if (index(w) < 50) a.unshift("Índice bajo");
    return a;
  }
  const dateRange = (from, to) => { const r = []; for (let d = from; d <= to; d = U.addDays(d, 1)) r.push(d); return r; };
  const weekStart = iso => U.addDays(iso, -((U.dow(iso) + 6) % 7));
  function loadsByDay(rpe, days) {
    const o = {}; Object.keys(TYPES).forEach(t => o[t] = days.map(() => 0));
    const pos = Object.fromEntries(days.map((d, i) => [d, i]));
    rpe.forEach(r => { if (pos[r.date] != null && o[r.type]) o[r.type][pos[r.date]] += r.load || 0; });
    return o;
  }
  function acwr(rpe, iso) {
    const sum = (a, b) => rpe.filter(r => r.date >= a && r.date <= b).reduce((s, r) => s + (r.load || 0), 0);
    const acute = sum(U.addDays(iso, -6), iso), chronic = sum(U.addDays(iso, -27), iso) / 4;
    const first = rpe.reduce((m, r) => r.date < m ? r.date : m, "9999");
    const enough = first <= U.addDays(iso, -21);   // ACWR solo con al menos 3-4 semanas de historial
    return { acute, chronic: Math.round(chronic), ratio: enough && chronic > 0 ? Math.round(acute / chronic * 100) / 100 : null };
  }
  const acwrPill = r => r == null ? '<span class="pill">—</span>' : r > 1.5 ? `<span class="pill bad">▲ ${r}</span>` : r < 0.8 ? `<span class="pill warn">▼ ${r}</span>` : r > 1.3 ? `<span class="pill warn">! ${r}</span>` : `<span class="pill ok">✓ ${r}</span>`;
  const slotMatch = (r, s) => r.slot ? r.slot === s.id : r.type === s.type;
  const t2m = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  /* ---------- arranque ---------- */
  async function start() {
    $("#teamName").textContent = CFG.teamName || "Wellness";
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
    if ("serviceWorker" in navigator && Store.mode === "firebase") navigator.serviceWorker.register("firebase-messaging-sw.js").catch(() => { });
    try { await Store.init(); } catch (e) { view.innerHTML = `<div class="card"><b>No se pudo conectar con Firebase.</b><p class="muted">${esc(e.message)}</p></div>`; return; }
    if (Store.mode === "demo") { $("#demoBar").classList.remove("hidden"); $("#demoReset").onclick = e => { e.preventDefault(); Store.resetDemo(); cache = null; toast("Datos demo regenerados"); Store.signOut(); }; }
    $("#btnLogout").onclick = () => Store.signOut();
    Store.onAuth(async u => {
      me = u; cache = null;
      $("#btnLogout").classList.toggle("hidden", !u);
      $("#whoami").textContent = u ? u.name + (u.isCoach ? " · cuerpo técnico" : "") : "";
      if (!u) { $("#tabs").classList.add("hidden"); return renderLogin(); }
      schedule = await Store.getSchedule();
      const q = new URLSearchParams(location.search);
      if (!u.isCoach && q.get("f") === "wellness") { history.replaceState(null, "", location.pathname); return showWellness(); }
      if (!u.isCoach && q.get("f") === "rpe") { history.replaceState(null, "", location.pathname); return showRpe(q.get("type"), q.get("date"), q.get("s")); }
      go(u.isCoach ? "equipo" : "hoy");
    });
  }

  function setTabs(list) {
    const n = $("#tabs"); n.classList.remove("hidden");
    n.innerHTML = list.map(([k, ic, lbl]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}"><span class="ic">${ic}</span>${lbl}</button>`).join("");
    n.querySelectorAll("button").forEach(b => b.onclick = () => go(b.dataset.t));
  }
  function go(t) {
    tab = t; window.scrollTo(0, 0);
    view.classList.toggle("wide", !!me.isCoach);
    if (me.isCoach) { setTabs([["equipo", "👥", "Equipo"], ["jugadora", "📈", "Jugadora"], ["avisos", "📣", "Avisos"], ["horario", "🗓️", "Horario"]]); ({ equipo: renderTeam, jugadora: renderPlayerCoach, avisos: renderMessages, horario: renderSchedule })[t](); }
    else { setTabs([["hoy", "🏑", "Hoy"], ["evolucion", "📈", "Mi evolución"]]); ({ hoy: renderToday, evolucion: renderMine })[t](); }
  }

  /* ---------- login ---------- */
  function renderLogin() {
    if (Store.mode === "demo") {
      const ps = Store.demoPlayers();
      view.innerHTML = `<div class="card"><h2>Modo demo</h2><p class="muted">Todavía no has conectado Firebase, así que la app funciona con datos inventados para que puedas probarla. Entra como jugadora o como preparador/a físico/a.</p>
        <label class="f">Entrar como jugadora</label><select id="dp">${ps.map(p => `<option value="${p.uid}" ${p.name === "Maria Gesti" ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        <p><button class="full" id="dPlayer">Entrar como jugadora</button></p><button class="full sec" id="dCoach">Entrar como preparador/a físico/a</button></div>`;
      $("#dPlayer").onclick = () => Store.demoLogin($("#dp").value);
      $("#dCoach").onclick = () => Store.demoLogin("coach");
      return;
    }
    let reg = false;
    const draw = () => {
      view.innerHTML = `<div class="card"><h2>${reg ? "Crear cuenta" : "Entrar"}</h2>
        ${reg ? `<label class="f">¿Quién eres?</label><select id="lName"><option value="">Elige tu nombre…</option>${CFG.roster.map(n => `<option>${esc(n)}</option>`).join("")}<option value="__staff">Soy del cuerpo técnico</option></select><input id="lStaff" class="hidden" placeholder="Tu nombre" style="margin-top:8px">` : ""}
        <label class="f">Email</label><input id="lEmail" type="email" autocomplete="email">
        <label class="f">Contraseña</label><input id="lPw" type="password" autocomplete="${reg ? "new-password" : "current-password"}" placeholder="${reg ? "Mínimo 6 caracteres" : ""}">
        <p><button class="full" id="lGo">${reg ? "Crear cuenta" : "Entrar"}</button></p>
        <div class="row"><button class="link" id="lSwitch">${reg ? "Ya tengo cuenta" : "Crear cuenta nueva"}</button><span class="grow"></span>${reg ? "" : '<button class="link" id="lReset">He olvidado la contraseña</button>'}</div></div>`;
      if (reg) $("#lName").onchange = e => $("#lStaff").classList.toggle("hidden", e.target.value !== "__staff");
      $("#lSwitch").onclick = () => { reg = !reg; draw(); };
      if ($("#lReset")) $("#lReset").onclick = async () => { const em = $("#lEmail").value.trim(); if (!em) return toast("Escribe tu email primero"); try { await Store.resetPassword(em); toast("Te hemos enviado un email"); } catch (e) { toast(errMsg(e)); } };
      $("#lGo").onclick = async () => {
        const em = $("#lEmail").value.trim(), pw = $("#lPw").value;
        $("#lGo").disabled = true;
        try {
          if (reg) {
            let name = $("#lName").value; const staff = name === "__staff"; if (staff) name = $("#lStaff").value.trim();
            if (!name) throw { message: "Elige tu nombre" };
            await Store.signUp(em, pw, name, staff);
          } else await Store.signIn(em, pw);
        } catch (e) { toast(errMsg(e)); $("#lGo").disabled = false; }
      };
    };
    draw();
  }
  const errMsg = e => ({ "auth/invalid-credential": "Email o contraseña incorrectos", "auth/wrong-password": "Contraseña incorrecta", "auth/user-not-found": "No existe esa cuenta", "auth/email-already-in-use": "Ese email ya tiene cuenta", "auth/weak-password": "La contraseña debe tener 6 caracteres o más", "auth/invalid-email": "Email no válido" }[e.code] || e.message || "Error");

  /* ---------- JUGADORA: hoy ---------- */
  async function renderToday() {
    view.innerHTML = '<p class="muted center pad">Cargando…</p>';
    const [W, R] = await Promise.all([Store.myWellness(), Store.myRpe()]);
    const d = U.today(), w = W.find(x => x.date === d), sess = U.sessionsOn(schedule, d), done = R.filter(r => r.date === d);
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const pushOk = Store.mode === "firebase" && "Notification" in window && Notification.permission === "granted";
    let html = "";
    if (!standalone) html += `<div class="alert">📲 <div><b>Instala la app en tu móvil.</b><br>Android (Chrome): menú ⋮ → <i>Instalar aplicación</i>. iPhone (Safari): botón Compartir → <i>Añadir a pantalla de inicio</i> y ábrela desde el icono.${installEvt ? '<br><button id="bInstall" style="margin-top:8px">Instalar ahora</button>' : ""}</div></div>`;
    if (!pushOk) html += `<div class="alert">🔔 <div><b>Activa los avisos</b> para que te llegue el wellness a las ${schedule.wellnessTime} y el RPE al acabar cada sesión.<br><button id="bPush" style="margin-top:8px">Activar notificaciones</button></div></div>`;
    html += `<div class="card"><h2>${fmtDate(d)}</h2>
      <div class="task"><div class="t"><b>Wellness</b><span>${w ? "Hecho · índice " + index(w) + "%" : "Pendiente · cuestionario de 5 preguntas"}</span></div>${w ? `${idxPill(index(w))}<button class="sec" data-w>Editar</button>` : "<button data-w>Rellenar</button>"}</div>
      ${sess.map(s => { const r = done.find(x => slotMatch(x, s)); const ended = nowMin() >= t2m(s.end);
        return `<div class="task"><div class="t"><b>RPE ${TYPES[s.type].n}${s.label ? " · " + esc(s.label) : ""}</b><span>${s.start}–${s.end}${r ? ` · RPE ${r.rpe} × ${r.minutes} min = <b>${r.load}</b> UA` : ended ? " · Pendiente" : " · Disponible al acabar"}</span></div>${r ? `<button class="sec" data-r="${s.type}" data-s="${s.id}">Editar</button>` : `<button data-r="${s.type}" data-s="${s.id}" ${ended ? "" : 'class="sec"'}>Registrar</button>`}</div>`; }).join("")}
      ${sess.length ? "" : '<div class="task"><div class="t"><span>Hoy no hay sesiones en el horario.</span></div></div>'}
      <p style="margin:12px 0 0"><button class="sec full" data-r="">+ Registrar otra sesión</button></p></div>`;
    const last = [...dateRange(U.addDays(d, -6), d)].reverse();
    html += `<div class="card"><h3>Últimos 7 días</h3><div class="tbl-wrap"><table><tr><th class="name">Día</th><th>Wellness</th><th>Sesiones (RPE × min)</th><th>Carga</th></tr>
      ${last.map(x => { const ww = W.find(y => y.date === x), rr = R.filter(y => y.date === x); return `<tr><td class="name">${fmtDate(x)}</td><td>${ww ? idxPill(index(ww)) : '<span class="muted">—</span>'}</td><td>${rr.map(y => `${TYPES[y.type].n} ${y.rpe}×${y.minutes}`).join(" · ") || '<span class="muted">—</span>'}</td><td><b>${rr.reduce((s, y) => s + y.load, 0) || ""}</b></td></tr>`; }).join("")}</table></div></div>`;
    view.innerHTML = html;
    view.querySelectorAll("[data-w]").forEach(b => b.onclick = () => showWellness(d, w));
    view.querySelectorAll("[data-r]").forEach(b => b.onclick = () => showRpe(b.dataset.r || null, d, b.dataset.s || null));
    if ($("#bPush")) $("#bPush").onclick = async () => { try { const r = await Store.enablePush(); toast(r === "ok" ? "¡Notificaciones activadas!" : r); if (r === "ok") renderToday(); } catch (e) { toast("Error: " + e.message); } };
    if ($("#bInstall")) $("#bInstall").onclick = () => installEvt.prompt();
  }

  /* ---------- JUGADORA: formulario wellness ---------- */
  async function showWellness(date, existing) {
    date = date || U.today();
    if (!existing) existing = (await Store.myWellness()).find(x => x.date === date);
    const v = existing ? { ...existing } : {};
    $("#tabs").classList.add("hidden");
    view.innerHTML = `<div class="card"><h2>Wellness</h2><label class="f">Fecha</label><input type="date" id="wDate" value="${date}" max="${U.today()}">
      ${METRICS.map(m => `<div class="slider"><div class="lbl"><label class="f">${m.n}</label></div>
        <div class="scale" data-k="${m.k}">${[0, 1, 2, 3, 4, 5].map(i => `<button data-v="${i}" class="${v[m.k] === i ? "on" : ""}">${i}</button>`).join("")}</div>
        <div class="ends"><span>Bajo</span><span>Alto</span></div></div>`).join("")}
      <div class="watch-box"><h3>⌚ Datos del reloj <span class="muted" style="font-weight:400">(opcional)</span></h3>
        <p class="muted" style="font-size:13px;margin:0 0 10px">Si llevas reloj o anillo (Apple Watch, Garmin, Whoop, Oura…), sube la captura de sueño/recuperación. Se lee en tu móvil (la imagen no se guarda) y puedes corregir cualquier valor.</p>
        <label class="btn sec" style="width:100%">📷 Añadir captura(s)<input type="file" id="wImg" accept="image/*" multiple hidden></label>
        <div id="wOcr" class="muted" style="font-size:13px;margin-top:6px"></div>
        <div class="watch-grid">${Watch.FIELDS.map(f => { const val = v.watch && v.watch[f.k] != null ? (f.dur ? Watch.fmtDur(v.watch[f.k]) : v.watch[f.k]) : "";
          return `<label><span>${f.n} <i>${f.dur ? "ej. 7h 30m" : f.u}</i></span><input data-wk="${f.k}" ${f.dur ? 'type="text" placeholder="—"' : 'type="number" step="any" inputmode="decimal" placeholder="—"'} value="${esc(val)}"></label>`; }).join("")}</div></div>
      <label class="f">Comentarios</label><textarea id="wCom" placeholder="Molestias, enfermedad, exámenes…">${esc(v.comments || "")}</textarea>
      <p><button class="full" id="wSave">Guardar</button></p><button class="full sec" id="wBack">Cancelar</button></div>`;
    view.querySelectorAll(".scale").forEach(sc => sc.querySelectorAll("button").forEach(b => b.onclick = () => { v[sc.dataset.k] = +b.dataset.v; sc.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); }));
    $("#wBack").onclick = () => go("hoy");
    $("#wImg").onchange = async e => {
      const files = [...e.target.files]; if (!files.length) return;
      const st = $("#wOcr"); st.textContent = "Cargando el lector… (la primera vez tarda unos segundos)";
      try {
        const r = await Watch.readImages(files, p => st.textContent = `Leyendo captura… ${Math.round(p * 100)}%`);
        let n = 0;
        Watch.FIELDS.forEach(f => { if (r[f.k] != null) { view.querySelector(`[data-wk="${f.k}"]`).value = f.dur ? Watch.fmtDur(r[f.k]) : r[f.k]; n++; } });
        st.textContent = n ? `✓ ${n} datos leídos. Revísalos antes de guardar.` : "No he encontrado datos en la imagen. Puedes escribirlos a mano.";
      } catch (err) { st.textContent = err.message + " · Puedes escribir los datos a mano."; }
      e.target.value = "";
    };
    $("#wSave").onclick = async () => {
      const miss = METRICS.filter(m => v[m.k] == null); if (miss.length) return toast("Falta: " + miss.map(m => m.s).join(", "));
      const e = { date: $("#wDate").value, comments: $("#wCom").value.trim() }; METRICS.forEach(m => e[m.k] = v[m.k]);
      const wt = {}; Watch.FIELDS.forEach(f => { const raw = view.querySelector(`[data-wk="${f.k}"]`).value.trim(); if (!raw) return; const val = f.dur ? Watch.parseDur(raw) : +raw.replace(",", "."); if (val != null && isFinite(val)) wt[f.k] = val; });
      e.watch = Object.keys(wt).length ? wt : null;
      $("#wSave").disabled = true;
      try { await Store.saveWellness(e); toast("Wellness guardado ✓"); go("hoy"); } catch (err) { toast("Error: " + err.message); $("#wSave").disabled = false; }
    };
  }

  /* ---------- JUGADORA: formulario RPE ---------- */
  async function showRpe(type, date, sid) {
    date = date || U.today();
    const sess = U.sessionsOn(schedule, date), R = (await Store.myRpe()).filter(r => r.date === date);
    let ses = sid ? sess.find(s => s.id === sid) : null;
    if (!ses) { const cand = sess.filter(s => !type || s.type === type); ses = cand.find(s => !R.some(r => slotMatch(r, s))) || cand[0] || null; }
    if (!type) type = ses ? ses.type : "entreno";
    if (ses && ses.type !== type) ses = null;
    const slot = ses ? ses.id : type;
    const existing = R.find(r => ses ? slotMatch(r, ses) : (r.slot || r.type) === slot);
    let st = { type, rpe: existing?.rpe || null, minutes: existing?.minutes || null, psych: existing?.psych || null, refl: existing?.reflection || "", watch: { ...(existing?.watch || {}) } };
    const askPsych = () => st.type !== "gym";
    const defMin = t => { const s = ses || sess.find(x => x.type === t); return s ? U.minutesBetween(s.start, s.end) : (t === "partido" ? 60 : t === "gym" ? 60 : 90); };
    if (!st.minutes) st.minutes = defMin(type);
    $("#tabs").classList.add("hidden");
    const draw = () => {
      view.innerHTML = `<div class="card"><h2>RPE${ses ? ` <span class="muted" style="font-size:14px;font-weight:500">· sesión ${ses.start}–${ses.end}</span>` : ""}</h2>
        <label class="f">Tipo de sesión</label><div class="types">${Object.entries(TYPES).map(([k, t]) => `<button data-t="${k}" class="${st.type === k ? "on" : ""}">${t.n}</button>`).join("")}</div>
        <label class="f">Fecha</label><input type="date" id="rDate" value="${date}" max="${U.today()}">
        <label class="f">¿Qué esfuerzo te ha supuesto la sesión? (1–10)</label>
        <div class="rpe-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => `<button data-v="${i}" style="background:${RPE[i].c}" class="${st.rpe === i ? "on" : ""}">${i}</button>`).join("")}</div>
        <div class="rpe-desc">${st.rpe ? `<b>${st.rpe} · ${RPE[st.rpe].t}.</b> ${RPE[st.rpe].d}` : '<span class="muted">Toca un número para ver la descripción.</span>'}</div>
        <label class="f">Duración (minutos)</label><input type="number" id="rMin" inputmode="numeric" min="1" max="300" value="${st.minutes}">
        <div class="load-box"><span>Carga de la sesión (RPE × minutos)</span><b id="rLoad">${st.rpe ? st.rpe * st.minutes : "—"}</b></div>
        <div class="watch-box"><h3>⌚ Datos del reloj <span class="muted" style="font-weight:400">(opcional)</span></h3>
          <p class="muted" style="font-size:13px;margin:0 0 10px">Sube la captura del entrenamiento de tu reloj (pulso, zonas, calorías…). Se lee en tu móvil y puedes corregir cualquier valor.</p>
          <label class="btn" style="width:100%">📷 Añadir captura(s)<input type="file" id="rImg" accept="image/*" multiple hidden></label>
          <div id="rOcr" class="muted" style="font-size:13px;margin-top:6px">${esc(st.ocrMsg || "")}</div>
          <div class="watch-grid">${Watch.WORKOUT_FIELDS.map(f => { const x = st.watch[f.k]; const val = x != null ? (f.dur ? Watch.fmtDur(x) : x) : "";
            return `<label><span>${f.n} <i>${f.dur ? "ej. 1h 30m" : f.u}</i></span><input data-rk="${f.k}" ${f.dur ? 'type="text"' : 'type="number" step="any" inputmode="decimal"'} placeholder="—" value="${esc(val)}"></label>`; }).join("")}</div></div>
        ${askPsych() ? `<div style="margin-top:22px;padding-top:6px;border-top:1px solid var(--line)"><h3 style="margin-top:14px">Bienestar psicológico durante el entrenamiento/partido</h3>
          <label class="f">¿Qué puntuación le darías a tu bienestar psicológico en el entrenamiento/partido de hoy?</label>
          <p class="muted" style="font-size:12px;margin:0 0 8px">Ten en cuenta: GESTIÓN DE LAS EMOCIONES (control de la impulsividad: evitar quejarse, golpear, movimientos con los brazos por inconformidad, quejarse por arbitraje, etc.) · CONCENTRACIÓN EN EL TRABAJO (atender explicaciones y directrices de compañeras, sin distraerte con pensamientos o emociones que te perjudican) · BAJO NIVEL DE ERROR (acierto elevado en las ejecuciones y tolerancia al error: el error no te paraliza ni te distrae) · COMUNICACIÓN EFECTIVA (buena comunicación verbal y no verbal con compañeras y staff) · MOTIVACIÓN, ACTITUD POSITIVA Y COMPAÑERISMO (satisfacción con el trabajo, te superas respecto al entreno anterior, animas a tus compañeras y no hablas mal de ellas, etc.)</p>
          <div class="scale" id="psy" style="grid-template-columns:repeat(5,1fr)">${[1, 2, 3, 4, 5].map(i => `<button data-v="${i}" class="${st.psych === i ? "on" : ""}">${i}</button>`).join("")}</div>
          <div class="ends" style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>Bajo</span><span>Alto</span></div>
          <label class="f">Reflexión sobre tu bienestar en el entrenamiento/partido de hoy: ¿qué aspectos te han hecho sentir bien? ¿Qué crees que deberías mejorar? ¿Tu día fuera del deporte te ha perjudicado en el entrenamiento? <span id="reflReq" style="color:var(--critical);font-weight:600">${st.psych && st.psych <= 3 ? "(obligatoria)" : ""}</span></label>
          <textarea id="rRefl" placeholder="Obligatoria si la puntuación es 3 o menos">${esc(st.refl)}</textarea></div>` : ""}
        <label class="f">Comentarios</label><textarea id="rCom">${esc(existing?.comments || "")}</textarea>
        <p><button class="full" id="rSave">Guardar</button></p>${existing ? '<p><button class="full danger" id="rDel">Borrar este registro</button></p>' : ""}<button class="full sec" id="rBack">Cancelar</button></div>`;
      view.querySelectorAll(".types button").forEach(b => b.onclick = () => showRpe(b.dataset.t, $("#rDate").value));
      view.querySelectorAll(".rpe-grid button").forEach(b => b.onclick = () => { st.rpe = +b.dataset.v; st.minutes = +$("#rMin").value || st.minutes; draw(); });
      if ($("#psy")) $("#psy").querySelectorAll("button").forEach(b => b.onclick = () => { st.psych = +b.dataset.v; $("#psy").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); $("#reflReq").textContent = st.psych <= 3 ? "(obligatoria)" : ""; });
      if ($("#rRefl")) $("#rRefl").oninput = e => st.refl = e.target.value;
      view.querySelectorAll("[data-rk]").forEach(inp => inp.oninput = () => { const f = Watch.WORKOUT_FIELDS.find(x => x.k === inp.dataset.rk), raw = inp.value.trim(); const val = !raw ? null : f.dur ? Watch.parseDur(raw) : +raw.replace(",", "."); if (val == null || !isFinite(val)) delete st.watch[f.k]; else st.watch[f.k] = val; });
      $("#rImg").onchange = async e => {
        const files = [...e.target.files]; if (!files.length) return;
        const msg = $("#rOcr"); msg.textContent = "Cargando el lector… (la primera vez tarda unos segundos)";
        try {
          const r = await Watch.readImages(files, p => msg.textContent = `Leyendo captura… ${Math.round(p * 100)}%`, Watch.parseWorkout);
          const n = Object.keys(r).filter(k => r[k] != null).length;
          Object.entries(r).forEach(([k, v]) => { if (v != null) st.watch[k] = v; });
          const notes = [];
          if (r.deviceRpe && !st.rpe) { st.rpe = r.deviceRpe; notes.push(`RPE ${r.deviceRpe} del reloj`); }
          if (r.durationMin) { st.minutes = r.durationMin; notes.push(`duración ${r.durationMin} min`); }
          st.ocrMsg = n ? `✓ ${n} datos leídos${notes.length ? " · he puesto " + notes.join(" y ") + " arriba" : ""}. Revísalos antes de guardar.` : "No he encontrado datos en la imagen. Puedes escribirlos a mano.";
          draw();
        } catch (err) { msg.textContent = err.message + " · Puedes escribir los datos a mano."; }
      };
      $("#rMin").oninput = e => { st.minutes = +e.target.value; $("#rLoad").textContent = st.rpe && st.minutes ? st.rpe * st.minutes : "—"; };
      $("#rDate").onchange = e => showRpe(st.type, e.target.value);
      $("#rBack").onclick = () => go("hoy");
      if ($("#rDel")) $("#rDel").onclick = async () => { await Store.deleteRpe(existing.id); toast("Borrado"); go("hoy"); };
      $("#rSave").onclick = async () => {
        const min = +$("#rMin").value;
        if (!st.rpe) return toast("Elige el RPE (1–10)"); if (!(min > 0)) return toast("Indica los minutos");
        const refl = $("#rRefl") ? $("#rRefl").value.trim() : "";
        if (askPsych() && !st.psych) return toast("Puntúa tu bienestar psicológico (1–5)");
        if (askPsych() && st.psych <= 3 && refl.length < 3) return toast("Con 3 o menos, escribe la reflexión");
        $("#rSave").disabled = true;
        try { await Store.saveRpe({ date: $("#rDate").value, type: st.type, slot, rpe: st.rpe, minutes: min, load: st.rpe * min, psych: askPsych() ? st.psych : null, reflection: askPsych() ? refl : "", watch: Object.keys(st.watch).length ? st.watch : null, comments: $("#rCom").value.trim() }); toast("RPE guardado ✓"); go("hoy"); }
        catch (err) { toast("Error: " + err.message); $("#rSave").disabled = false; }
      };
    };
    draw();
  }

  /* ---------- Evolución (compartida) ---------- */
  function evolution(box, name, W, R, onExcel) {
    const to = U.today(), from = U.addDays(to, -weeks * 7 + 1), days = dateRange(from, to);
    const byDate = Object.fromEntries(W.map(w => [w.date, w]));
    const idx = days.map(d => index(byDate[d]));
    const valid = idx.filter(v => v != null), avg = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    const lastW = [...W].sort((a, b) => b.date.localeCompare(a.date))[0];
    const ac = acwr(R, to);
    const loads = loadsByDay(R, days);
    const wkStarts = []; for (let d = weekStart(U.addDays(to, -11 * 7)); d <= to; d = U.addDays(d, 7)) wkStarts.push(d);
    const wk = {}; Object.keys(TYPES).forEach(t => wk[t] = wkStarts.map(ws => R.filter(r => r.type === t && r.date >= ws && r.date <= U.addDays(ws, 6)).reduce((s, r) => s + r.load, 0)));
    const wkAcwr = wkStarts.map(ws => { const end = U.addDays(ws, 6) > to ? to : U.addDays(ws, 6); return acwr(R, end).ratio; });
    box.innerHTML = `
      <div class="row" style="margin-bottom:12px"><h2 class="grow" style="margin:0">${esc(name)}</h2>
        <div class="seg" id="segW">${[2, 4, 8, 12].map(n => `<button data-n="${n}" class="${n === weeks ? "on" : ""}">${n} sem</button>`).join("")}</div>
        <button id="bXls">⬇ Excel</button></div>
      <div class="stats">
        <div class="stat"><span>Último wellness</span><b>${lastW ? index(lastW) + "%" : "—"}</b><small>${lastW ? fmtDate(lastW.date) : "sin datos"}</small></div>
        <div class="stat"><span>Media wellness (${weeks} sem)</span><b>${avg ?? "—"}${avg != null ? "%" : ""}</b><small>${valid.length}/${days.length} días respondidos</small></div>
        <div class="stat"><span>Carga últimos 7 días</span><b>${ac.acute}</b><small>UA · media semanal 4 sem: ${ac.chronic}</small></div>
        <div class="stat"><span>ACWR (agudo:crónico)</span><b>${ac.ratio ?? "—"}</b><small>${acwrPill(ac.ratio)} zona óptima 0,8–1,3</small></div>
      </div>
      <div class="card"><h3>Índice wellness diario (%) · línea discontinua = su media</h3><div id="chIdx"></div></div>
      ${W.some(w => w.watch) ? `<div class="card"><h3>⌚ Datos del reloj</h3><div class="grid5">${WCH.map(c => `<div><b style="font-size:13px">${c.n}</b> <span class="muted" style="font-size:12px">${c.u}</span><div id="chW_${c.k}"></div></div>`).join("")}</div></div>` : ""}
      <div class="card"><h3>Las 5 preguntas (0–5)</h3><div class="grid5">${METRICS.map(m => `<div><b style="font-size:13px">${m.s}</b> <span class="muted" style="font-size:12px">${m.bad ? "más alto = peor" : "más alto = mejor"}</span><div id="chM_${m.k}"></div></div>`).join("")}</div></div>
      <div class="grid2">
        <div class="card"><h3>Carga diaria (RPE × min)</h3><div id="chLoad"></div></div>
        <div class="card"><h3>Carga semanal · últimas 12 semanas</h3><div id="chWk"></div></div>
      </div>
      <div class="card"><h3>ACWR semanal · zona óptima 0,8–1,3 (línea en 1)</h3><div id="chAcwr"></div></div>
      <div class="card"><h3>Bienestar psicológico en entreno/partido (1–5)</h3><div id="chPsy"></div></div>
      <div class="card"><h3>Comentarios y reflexiones</h3>${[...W.filter(w => w.comments), ...R.filter(r => r.comments || r.reflection)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map(c => `<div class="task"><div class="t"><b>${fmtDate(c.date)} · ${c.type ? "RPE " + TYPES[c.type].n + (c.psych ? " · bienestar psicológico " + c.psych + "/5" : "") : "Wellness"}</b>${c.reflection ? `<span>💭 ${esc(c.reflection)}</span>` : ""}${c.comments ? `<span>${esc(c.comments)}</span>` : ""}</div></div>`).join("") || '<p class="muted">Sin comentarios.</p>'}</div>`;
    Charts.line(box.querySelector("#chIdx"), { labels: days, yMin: 0, yMax: 100, height: 200, refLine: avg, series: [{ name: "Índice wellness", color: "#2a78d6", values: idx }] });
    if (W.some(w => w.watch)) WCH.forEach(c => Charts.line(box.querySelector("#chW_" + c.k), { labels: days, yMin: c.min, yMax: c.max, height: 150, series: [{ name: c.n, color: "#1f3b63", values: days.map(d => { const x = byDate[d]?.watch?.[c.k]; return x == null ? null : c.f ? c.f(x) : x; }) }] }));
    METRICS.forEach(m => Charts.line(box.querySelector("#chM_" + m.k), { labels: days, yMin: 0, yMax: 5, yTicks: [0, 1, 2, 3, 4, 5], height: 150, series: [{ name: m.s, color: "#1f3b63", values: days.map(d => byDate[d] ? byDate[d][m.k] : null) }] }));
    const ser = o => Object.entries(TYPES).map(([k, t]) => ({ name: t.n, color: t.c, values: o[k] }));
    Charts.bars(box.querySelector("#chLoad"), { labels: days, height: 210, series: ser(loads) });
    Charts.bars(box.querySelector("#chWk"), { labels: wkStarts, height: 210, series: ser(wk) });
    const psyDay = days.map(d => { const v = R.filter(r => r.date === d && r.psych).map(r => r.psych); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; });
    Charts.line(box.querySelector("#chPsy"), { labels: days, yMin: 1, yMax: 5, yTicks: [1, 2, 3, 4, 5], refLine: 3, height: 170, series: [{ name: "Bienestar psicológico", color: "#2a78d6", values: psyDay }] });
    Charts.line(box.querySelector("#chAcwr"), { labels: wkStarts, yMin: 0, yMax: 2, yTicks: [0, .5, .8, 1, 1.3, 1.5, 2], refLine: 1, height: 180, series: [{ name: "ACWR", color: "#2a78d6", values: wkAcwr }] });
    box.querySelectorAll("#segW button").forEach(b => b.onclick = () => { weeks = +b.dataset.n; evolution(box, name, W, R, onExcel); });
    box.querySelector("#bXls").onclick = onExcel;
  }

  async function renderMine() {
    view.innerHTML = '<p class="muted center pad">Cargando…</p>';
    const [W, R] = await Promise.all([Store.myWellness(), Store.myRpe()]);
    const box = document.createElement("div"); view.innerHTML = ""; view.appendChild(box);
    evolution(box, me.name, W, R, () => XLSX.download(fileName(me.name), XLSX.build(playerBook(me.name, W, R))));
  }

  /* ---------- Excel ---------- */
  const fileName = n => `Wellness_RPE_${n.replace(/[^\wÀ-ÿ]+/g, "_")}_${U.today()}.xlsx`;
  function playerBook(name, W, R) {
    const Ws = [...W].sort((a, b) => a.date.localeCompare(b.date)), Rs = [...R].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
    const first = [Ws[0]?.date, Rs[0]?.date].filter(Boolean).sort()[0] || U.today();
    const days = dateRange(first, U.today()), L = loadsByDay(R, days);
    const daily = days.map((d, i) => [d, L.gym[i] || null, L.entreno[i] || null, L.partido[i] || null, (L.gym[i] + L.entreno[i] + L.partido[i]) || null]).filter(r => r[4]);
    const wks = []; for (let d = weekStart(first); d <= U.today(); d = U.addDays(d, 7)) wks.push(d);
    const weekly = wks.map(ws => { const we = U.addDays(ws, 6), rr = R.filter(r => r.date >= ws && r.date <= we), s = t => rr.filter(r => r.type === t).reduce((a, r) => a + r.load, 0);
      const wl = Ws.filter(w => w.date >= ws && w.date <= we).map(index); return [ws, s("gym"), s("entreno"), s("partido"), s("gym") + s("entreno") + s("partido"), acwr(R, we > U.today() ? U.today() : we).ratio, wl.length ? Math.round(wl.reduce((a, b) => a + b, 0) / wl.length) : null]; });
    const MC = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
    return { sheets: [
      { name: "Wellness", cols: [{ header: "Fecha", width: 12 }, ...METRICS.map(m => ({ header: m.s + " (0-5)", width: 12 })), { header: "Índice wellness %", width: 16 }, { header: "Comentarios", width: 40 }],
        rows: Ws.map(w => [w.date, ...METRICS.map(m => w[m.k]), index(w), w.comments || ""]),
        charts: [
          { type: "line", title: `Índice wellness (%) · ${name}`, catCol: 0, series: [{ col: 6, name: "Índice wellness", color: "#2a78d6" }], yMin: 0, yMax: 100, from: { col: 9, row: 1 }, to: { col: 21, row: 19 } },
          { type: "line", title: "Las 5 preguntas (0-5)", catCol: 0, series: METRICS.map((m, i) => ({ col: i + 1, name: m.s, color: MC[i] })), yMin: 0, yMax: 5, from: { col: 9, row: 20 }, to: { col: 21, row: 40 } }] },
      ...(Ws.some(w => w.watch) ? [{ name: "Reloj", cols: [{ header: "Fecha", width: 12 }, { header: "Sueño (h)", width: 10 }, { header: "Puntuación sueño", width: 14 }, { header: "Profundo (min)", width: 13 }, { header: "REM (min)", width: 10 }, { header: "Ligero (min)", width: 11 }, { header: "Despierto (min)", width: 14 }, { header: "FC basal (lpm)", width: 13 }, { header: "VFC (ms)", width: 9 }, { header: "Temp. desv. (°C)", width: 14 }, { header: "Frec. resp. (rpm)", width: 15 }],
        rows: Ws.filter(w => w.watch).map(w => { const x = w.watch; return [w.date, x.sleepMin != null ? Math.round(x.sleepMin / 6) / 10 : null, x.sleepScore ?? null, x.deepMin ?? null, x.remMin ?? null, x.lightMin ?? null, x.awakeMin ?? null, x.hrRest ?? null, x.hrv ?? null, x.tempDev ?? null, x.resp ?? null]; }),
        charts: [
          { type: "bar", title: "Horas de sueño", catCol: 0, series: [{ col: 1, name: "Sueño (h)", color: "#2a78d6" }], from: { col: 12, row: 1 }, to: { col: 22, row: 17 } },
          { type: "line", title: "VFC (ms)", catCol: 0, series: [{ col: 8, name: "VFC", color: "#1baf7a" }], from: { col: 12, row: 18 }, to: { col: 22, row: 34 } },
          { type: "line", title: "FC basal (lpm)", catCol: 0, series: [{ col: 7, name: "FC basal", color: "#eb6834" }], from: { col: 12, row: 35 }, to: { col: 22, row: 51 } }] }] : []),
      { name: "RPE", cols: [{ header: "Fecha", width: 12 }, { header: "Tipo", width: 10 }, { header: "RPE (1-10)", width: 11 }, { header: "Minutos", width: 10 }, { header: "Carga (UA)", width: 11 }, { header: "Bienestar psicológico (1-5)", width: 14 }, { header: "Reflexión", width: 50 }, { header: "Comentarios", width: 40 }, ...Watch.WORKOUT_FIELDS.map(f => ({ header: "⌚ " + f.n + (f.u ? ` (${f.u})` : ""), width: 12 }))],
        rows: Rs.map(r => [r.date, TYPES[r.type].n, r.rpe, r.minutes, r.load, r.psych ?? null, r.reflection || "", r.comments || "", ...Watch.WORKOUT_FIELDS.map(f => r.watch?.[f.k] ?? null)]),
        charts: [{ type: "line", title: "Bienestar psicológico (1-5)", catCol: 0, series: [{ col: 5, name: "Bienestar psicológico", color: "#2a78d6" }], yMin: 1, yMax: 5, from: { col: 21, row: 1 }, to: { col: 32, row: 19 } },
          ...(Rs.some(r => r.watch?.hrAvg) ? [{ type: "line", title: "FC media por sesión (lpm)", catCol: 0, series: [{ col: 10, name: "FC media", color: "#eb6834" }], from: { col: 21, row: 20 }, to: { col: 32, row: 38 } }] : [])] },
      { name: "Carga diaria", cols: [{ header: "Fecha", width: 12 }, { header: "Gym", width: 9 }, { header: "Entreno", width: 9 }, { header: "Partido", width: 9 }, { header: "Total", width: 9 }], rows: daily,
        charts: [{ type: "bar", stacked: true, title: "Carga diaria (RPE × min)", catCol: 0, series: [{ col: 1, name: "Gym", color: TYPES.gym.c }, { col: 2, name: "Entreno", color: TYPES.entreno.c }, { col: 3, name: "Partido", color: TYPES.partido.c }], from: { col: 6, row: 1 }, to: { col: 20, row: 22 } }] },
      { name: "Semanal", cols: [{ header: "Semana (lunes)", width: 14 }, { header: "Gym", width: 9 }, { header: "Entreno", width: 9 }, { header: "Partido", width: 9 }, { header: "Carga total", width: 11 }, { header: "ACWR", width: 8 }, { header: "Wellness medio %", width: 16 }], rows: weekly,
        charts: [
          { type: "bar", stacked: true, title: "Carga semanal", catCol: 0, series: [{ col: 1, name: "Gym", color: TYPES.gym.c }, { col: 2, name: "Entreno", color: TYPES.entreno.c }, { col: 3, name: "Partido", color: TYPES.partido.c }], from: { col: 8, row: 1 }, to: { col: 20, row: 19 } },
          { type: "line", title: "ACWR (zona óptima 0,8-1,3)", catCol: 0, series: [{ col: 5, name: "ACWR", color: "#2a78d6" }], yMin: 0, yMax: 2, from: { col: 8, row: 20 }, to: { col: 20, row: 36 } },
          { type: "line", title: "Wellness medio semanal (%)", catCol: 0, series: [{ col: 6, name: "Wellness medio", color: "#1f3b63" }], yMin: 0, yMax: 100, from: { col: 8, row: 37 }, to: { col: 20, row: 53 } }] }
    ] };
  }
  function teamBook(players, W, R) {
    const d = U.today(), from7 = U.addDays(d, -6);
    const summary = players.map(p => { const w = W.filter(x => x.uid === p.uid), r = R.filter(x => x.uid === p.uid), w7 = w.filter(x => x.date >= from7).map(index), last = [...w].sort((a, b) => b.date.localeCompare(a.date))[0], a = acwr(r, d);
      return [p.name, last ? last.date : "", last ? index(last) : null, w7.length ? Math.round(w7.reduce((s, v) => s + v, 0) / w7.length) : null, w7.length, a.acute, a.chronic, a.ratio, last ? alertsOf(last).join(", ") : ""]; });
    const sheets = [{ name: "Resumen equipo", cols: [{ header: "Jugadora", width: 26 }, { header: "Último wellness", width: 14 }, { header: "Índice último %", width: 14 }, { header: "Wellness medio 7d %", width: 18 }, { header: "Respuestas 7d", width: 13 }, { header: "Carga 7d", width: 10 }, { header: "Carga semanal media 4 sem", width: 22 }, { header: "ACWR", width: 8 }, { header: "Alertas último wellness", width: 30 }], rows: summary,
      charts: [{ type: "bar", title: "Carga últimos 7 días por jugadora", catCol: 0, series: [{ col: 5, name: "Carga 7d", color: "#2a78d6" }], from: { col: 10, row: 1 }, to: { col: 22, row: 22 } }] }];
    players.forEach(p => {
      const w = W.filter(x => x.uid === p.uid), r = R.filter(x => x.uid === p.uid);
      const days = [...new Set([...w.map(x => x.date), ...r.map(x => x.date)])].sort();
      const rows = days.map(dd => { const ww = w.find(x => x.date === dd), rr = r.filter(x => x.date === dd); return [dd, ...METRICS.map(m => ww ? ww[m.k] : null), ww ? index(ww) : null, rr.reduce((s, x) => s + x.load, 0) || null, rr.map(x => `${TYPES[x.type].n} ${x.rpe}×${x.minutes}`).join(" · "), [ww?.comments, ...rr.map(x => x.comments)].filter(Boolean).join(" | ")]; });
      sheets.push({ name: p.name, cols: [{ header: "Fecha", width: 12 }, ...METRICS.map(m => ({ header: m.s, width: 9 })), { header: "Índice %", width: 9 }, { header: "Carga día", width: 10 }, { header: "Sesiones", width: 28 }, { header: "Comentarios", width: 30 }], rows,
        charts: [{ type: "line", title: "Índice wellness (%)", catCol: 0, series: [{ col: 6, name: "Índice", color: "#2a78d6" }], yMin: 0, yMax: 100, from: { col: 11, row: 1 }, to: { col: 22, row: 18 } },
          { type: "bar", title: "Carga diaria (UA)", catCol: 0, series: [{ col: 7, name: "Carga", color: "#eb6834" }], from: { col: 11, row: 19 }, to: { col: 22, row: 36 } }] });
    });
    sheets.push({ name: "Datos wellness", cols: ["Jugadora", "Fecha", ...METRICS.map(m => m.s), "Índice %", "Comentarios", "Sueño (h)", "Punt. sueño", "FC basal", "VFC (ms)"].map(h => ({ header: h, width: h === "Jugadora" ? 26 : h === "Comentarios" ? 40 : 11 })), rows: [...W].sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date)).map(w => [w.name, w.date, ...METRICS.map(m => w[m.k]), index(w), w.comments || "", w.watch?.sleepMin != null ? Math.round(w.watch.sleepMin / 6) / 10 : null, w.watch?.sleepScore ?? null, w.watch?.hrRest ?? null, w.watch?.hrv ?? null]) });
    sheets.push({ name: "Datos RPE", cols: ["Jugadora", "Fecha", "Tipo", "RPE", "Minutos", "Carga", "Bienestar psicológico", "Reflexión", "Comentarios", "FC media", "FC máx", "kcal", "Carga reloj"].map(h => ({ header: h, width: h === "Jugadora" ? 26 : h === "Comentarios" || h === "Reflexión" ? 40 : 10 })), rows: [...R].sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date)).map(r => [r.name, r.date, TYPES[r.type].n, r.rpe, r.minutes, r.load, r.psych ?? null, r.reflection || "", r.comments || "", r.watch?.hrAvg ?? null, r.watch?.hrMax ?? null, r.watch?.kcal ?? null, r.watch?.deviceLoad ?? null]) });
    return { sheets };
  }

  /* ---------- PREPARADOR: datos ---------- */
  async function teamData(force) {
    if (cache && !force) return cache;
    const from = U.addDays(U.today(), -16 * 7);
    const [W, R, users] = await Promise.all([Store.teamWellness(from), Store.teamRpe(from), Store.players()]);
    const map = new Map();
    users.filter(u => !u.staff && u.name).forEach(u => map.set(u.uid, { uid: u.uid, name: u.name, hasPush: u.hasPush }));
    [...W, ...R].forEach(x => { if (!map.has(x.uid)) map.set(x.uid, { uid: x.uid, name: x.name }); });
    const players = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const registered = new Set(players.map(p => p.name));
    cache = { W, R, players, missing: CFG.roster.filter(n => !registered.has(n)) };
    return cache;
  }

  async function renderTeam() {
    view.innerHTML = '<p class="muted center pad">Cargando datos del equipo…</p>';
    const { W, R, players, missing } = await teamData();
    const d = teamDate;
    const wToday = W.filter(w => w.date === d), rToday = R.filter(r => r.date === d);
    const withAlerts = wToday.filter(w => alertsOf(w).length);
    const avg = wToday.length ? Math.round(wToday.reduce((s, w) => s + index(w), 0) / wToday.length) : null;
    const sess = U.sessionsOn(schedule, d);
    view.innerHTML = `
      <div class="row" style="margin-bottom:12px"><h2 class="grow" style="margin:0">Equipo · ${fmtDate(d)}</h2>
        <button class="sec" id="dPrev">‹</button><input type="date" id="tDate" value="${d}" style="width:auto"><button class="sec" id="dNext">›</button>
        <button class="sec" id="bRef">↻</button><button id="bTeamXls">⬇ Excel equipo</button></div>
      ${d === U.today() && players.length - wToday.length > 0 ? `<div class="alert">📣 <div><b>${players.length - wToday.length} jugadoras</b> no han hecho el wellness de hoy. <button id="bRemind" style="margin-left:6px;padding:6px 12px">Mandarles un aviso</button></div></div>` : ""}
      <div class="stats">
        <div class="stat"><span>Wellness respondidos</span><b>${wToday.length}/${players.length}</b><small>${players.length - wToday.length} pendientes</small></div>
        <div class="stat"><span>Índice wellness medio</span><b>${avg ?? "—"}${avg != null ? "%" : ""}</b><small>${idxPill(avg)}</small></div>
        <div class="stat"><span>Con alertas</span><b>${withAlerts.length}</b><small>${withAlerts.length ? '<span class="pill bad">▲ revisar</span>' : '<span class="pill ok">✓ todo bien</span>'}</small></div>
        <div class="stat"><span>RPE registrados</span><b>${rToday.length}</b><small>${sess.map(s => TYPES[s.type].n + " " + s.start).join(" · ") || "sin sesiones"}</small></div>
      </div>
      <div class="card tbl-wrap"><table>
        <tr><th class="name">Jugadora</th><th>Índice</th>${METRICS.map(m => `<th>${m.s}</th>`).join("")}<th>Alertas</th><th>⌚ Sueño · VFC</th><th>RPE del día</th><th>Carga 7d</th><th>ACWR</th>${Store.mode === "firebase" ? "<th>Avisos</th>" : ""}</tr>
        ${players.map(p => { const w = wToday.find(x => x.uid === p.uid), rr = rToday.filter(x => x.uid === p.uid), a = acwr(R.filter(x => x.uid === p.uid), d), al = alertsOf(w);
          return `<tr><td class="name"><button data-p="${p.uid}">${esc(p.name)}</button>${w && w.comments ? ` <span title="${esc(w.comments)}">💬</span>` : ""}</td><td>${w ? idxPill(index(w)) : '<span class="muted">pendiente</span>'}</td>
            ${METRICS.map(m => w ? `<td class="cell ${level(m, w[m.k])}">${w[m.k]}</td>` : '<td class="na">—</td>').join("")}
            <td>${al.length ? `<span class="pill bad">▲ ${al.join(", ")}</span>` : w ? '<span class="pill ok">✓</span>' : ""}</td>
            <td>${w && w.watch ? [w.watch.sleepMin != null ? Watch.fmtDur(w.watch.sleepMin) : "", w.watch.hrv != null ? w.watch.hrv + " ms" : ""].filter(Boolean).join(" · ") : '<span class="muted">—</span>'}</td>
            <td>${rr.map(x => `${TYPES[x.type].n} <b>${x.rpe}</b>×${x.minutes}${x.psych ? ` · <span class="pill ${x.psych <= 2 ? "bad" : x.psych === 3 ? "warn" : "ok"}" title="${esc(x.reflection || "")}">🧠 ${x.psych}</span>` : ""}${x.watch && x.watch.hrAvg ? ` · ❤️ ${x.watch.hrAvg}${x.watch.hrMax ? "/" + x.watch.hrMax : ""}` : ""}`).join("<br>") || '<span class="muted">—</span>'}</td><td><b>${a.acute || ""}</b></td><td>${acwrPill(a.ratio)}</td>${Store.mode === "firebase" ? `<td>${p.hasPush ? "🔔" : '<span class="muted">no</span>'}</td>` : ""}</tr>`; }).join("")}
      </table>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Colores: <span class="pill bad">rojo</span> estrés/dolor/fatiga ≥ 4 o sueño/humor ≤ 1 · <span class="pill warn">amarillo</span> valor 3 (o 2 en sueño/humor). Índice wellness = media de las 5 respuestas con estrés, dolor y fatiga invertidos (100% = perfecto).</p>
      ${missing.length ? `<p class="muted" style="font-size:12px">Sin cuenta todavía: ${missing.map(esc).join(", ")}</p>` : ""}</div>
      <div class="card"><h3>Media del equipo · índice wellness y carga, últimas 4 semanas</h3><div id="chTeamIdx"></div><div id="chTeamLoad" style="margin-top:12px"></div></div>
      <div class="card"><h3>Comentarios y reflexiones del día</h3>${[...wToday, ...rToday].filter(x => x.comments || x.reflection).map(x => `<div class="task"><div class="t"><b>${esc(x.name)} · ${x.type ? "RPE " + TYPES[x.type].n + (x.psych ? " · bienestar psicológico " + x.psych + "/5" : "") : "Wellness"}</b>${x.reflection ? `<span>💭 ${esc(x.reflection)}</span>` : ""}${x.comments ? `<span>${esc(x.comments)}</span>` : ""}</div></div>`).join("") || '<p class="muted">Ninguno.</p>'}</div>`;
    const days = dateRange(U.addDays(d, -27), d);
    Charts.line($("#chTeamIdx"), { labels: days, yMin: 0, yMax: 100, height: 180, series: [{ name: "Índice medio equipo", color: "#2a78d6", values: days.map(x => { const ws = W.filter(w => w.date === x); return ws.length ? Math.round(ws.reduce((s, w) => s + index(w), 0) / ws.length) : null; }) }] });
    const L = loadsByDay(R, days), np = Math.max(1, players.length);
    Charts.bars($("#chTeamLoad"), { labels: days, height: 180, series: Object.entries(TYPES).map(([k, t]) => ({ name: t.n + " (media/jugadora)", color: t.c, values: L[k].map(v => Math.round(v / np)) })) });
    view.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { selPlayer = b.dataset.p; go("jugadora"); });
    $("#tDate").onchange = e => { teamDate = e.target.value; renderTeam(); };
    $("#dPrev").onclick = () => { teamDate = U.addDays(teamDate, -1); renderTeam(); };
    $("#dNext").onclick = () => { teamDate = U.addDays(teamDate, 1); renderTeam(); };
    $("#bRef").onclick = async () => { await teamData(true); renderTeam(); };
    if ($("#bRemind")) $("#bRemind").onclick = () => { msgDraft = { target: "pending_wellness", text: "¡Buenos días! Aún no has rellenado el wellness de hoy, son 30 segundos 🙏🏑" }; go("avisos"); };
    $("#bTeamXls").onclick = () => XLSX.download(`Equipo_${(CFG.teamName || "").replace(/\W+/g, "_")}_${U.today()}.xlsx`, XLSX.build(teamBook(players, W, R)));
  }

  async function renderPlayerCoach() {
    view.innerHTML = '<p class="muted center pad">Cargando…</p>';
    const { W, R, players } = await teamData();
    if (!players.length) { view.innerHTML = '<div class="card"><p>Todavía no hay jugadoras registradas.</p></div>'; return; }
    if (!selPlayer || !players.some(p => p.uid === selPlayer)) selPlayer = players[0].uid;
    const p = players.find(x => x.uid === selPlayer);
    view.innerHTML = `<div class="card row"><label class="grow"><select id="selP">${players.map(x => `<option value="${x.uid}" ${x.uid === selPlayer ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label></div><div id="evo"></div>`;
    $("#selP").onchange = e => { selPlayer = e.target.value; renderPlayerCoach(); };
    const w = W.filter(x => x.uid === p.uid), r = R.filter(x => x.uid === p.uid);
    evolution($("#evo"), p.name, w, r, () => XLSX.download(fileName(p.name), XLSX.build(playerBook(p.name, w, r))));
  }

  /* ---------- PREPARADOR: avisos manuales ---------- */
  let msgDraft = null;
  async function renderMessages() {
    view.innerHTML = '<p class="muted center pad">Cargando…</p>';
    const [{ W, R, players }, hist] = await Promise.all([teamData(true), Store.listMessages().catch(() => [])]);
    const d = U.today(), doneW = new Set(W.filter(w => w.date === d).map(w => w.uid)), doneR = new Set(R.filter(r => r.date === d).map(r => r.uid));
    const m = msgDraft || { target: "all", text: "" }; msgDraft = null;
    const TG = { all: ["Todas", players.length], pending_wellness: ["Sin wellness hoy", players.filter(p => !doneW.has(p.uid)).length], pending_rpe: ["Sin RPE hoy", players.filter(p => !doneR.has(p.uid)).length], some: ["Elegir jugadoras", null] };
    const TPL = ["¡Buenos días! Aún no has rellenado el wellness de hoy, son 30 segundos 🙏🏑", "Recordad registrar el RPE del entreno de hoy 💪", "Mañana hay partido: dormid bien e hidrataos 💧"];
    view.innerHTML = `<h2>Mandar un aviso</h2>
      <div class="card"><label class="f" style="margin-top:0">¿A quién?</label>
        <div class="types" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))" id="tg">${Object.entries(TG).map(([k, [n, c]]) => `<button data-k="${k}" class="${m.target === k ? "on" : ""}">${n}${c != null ? ` (${c})` : ""}</button>`).join("")}</div>
        <div id="pickBox" class="${m.target === "some" ? "" : "hidden"}" style="margin-top:10px;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px">
          ${players.map(p => `<label style="display:flex;gap:8px;align-items:center;padding:5px 2px;font-size:14px"><input type="checkbox" value="${p.uid}" style="width:auto"> ${esc(p.name)} <span class="muted" style="font-size:12px">${doneW.has(p.uid) ? "✓ wellness" : "sin wellness"}${p.hasPush === false ? " · sin avisos activados" : ""}</span></label>`).join("")}</div>
        <label class="f">Mensaje</label><textarea id="mText" maxlength="250" placeholder="Escribe el mensaje que les saltará en el móvil">${esc(m.text)}</textarea>
        <div class="row" style="margin-top:8px;gap:6px">${TPL.map((t, i) => `<button class="sec" data-tpl="${i}" style="padding:6px 10px;font-size:12px;font-weight:500">${esc(t.slice(0, 34))}…</button>`).join("")}</div>
        <p><button class="full" id="mSend">📣 Enviar aviso</button></p>
        <p class="muted" style="font-size:12px;margin:0">Llega en unos minutos (máx. ~10): el aviso sale en la siguiente vuelta del programador. Solo lo reciben quienes tienen las notificaciones activadas.</p></div>
      <div class="card"><h3>Últimos avisos</h3>${hist.map(h => `<div class="task"><div class="t"><b>${esc(h.text)}</b><span>${new Date(h.ts).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${esc((TG[h.target] || ["Elegidas"])[0])}${h.target === "some" ? ` (${(h.uids || []).length})` : ""}</span></div><span class="pill ${h.status === "sent" ? "ok" : "warn"}">${h.status === "sent" ? `✓ enviado a ${h.count ?? "?"}` : h.status === "demo" ? "demo" : "⏳ en cola"}</span></div>`).join("") || '<p class="muted">Todavía no has mandado ninguno.</p>'}</div>`;
    let target = m.target;
    view.querySelectorAll("#tg button").forEach(b => b.onclick = () => { target = b.dataset.k; view.querySelectorAll("#tg button").forEach(x => x.classList.toggle("on", x === b)); $("#pickBox").classList.toggle("hidden", target !== "some"); });
    view.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => $("#mText").value = TPL[+b.dataset.tpl]);
    $("#mSend").onclick = async () => {
      const text = $("#mText").value.trim(); if (text.length < 3) return toast("Escribe el mensaje");
      const uids = target === "some" ? [...view.querySelectorAll("#pickBox input:checked")].map(i => i.value) : [];
      if (target === "some" && !uids.length) return toast("Elige al menos una jugadora");
      $("#mSend").disabled = true;
      try { await Store.sendMessage({ text, target, uids, date: d }); toast(Store.mode === "demo" ? "En modo demo no se envía de verdad" : "Aviso en cola ✓ llegará en unos minutos"); renderMessages(); }
      catch (e) { toast("Error: " + e.message); $("#mSend").disabled = false; }
    };
  }

  /* ---------- PREPARADOR: horario ---------- */
  function renderSchedule() {
    const s = JSON.parse(JSON.stringify(schedule));
    const typeSel = (v, k) => `<select data-f="type" data-k="${k}">${Object.entries(TYPES).map(([t, o]) => `<option value="${t}" ${t === v ? "selected" : ""}>${o.n}</option>`).join("")}</select>`;
    const draw = () => {
      s.events.sort((a, b) => a.date.localeCompare(b.date));
      const upcoming = s.events.map((e, i) => ({ e, i })).filter(x => x.e.date >= U.addDays(U.today(), -7));
      view.innerHTML = `<h2>Horario y avisos</h2>
        <div class="card"><h3>Avisos</h3><div class="grid2"><div><label class="f">Hora del aviso de wellness</label><input type="time" id="sWt" value="${s.wellnessTime}"></div>
          <div><label class="f">Aviso de RPE: minutos después de acabar la sesión</label><input type="number" id="sDel" min="0" max="240" value="${s.rpeDelay}"></div></div>
          <p class="muted" style="font-size:13px">Solo se avisa a quien no lo haya rellenado todavía. Hora de Madrid.</p></div>
        <div class="card"><h3>Sesiones fijas cada semana</h3>
          ${s.weekly.map((w, i) => `<div class="sched-item" data-i="${i}">${typeSel(w.type, "w")}<select data-f="day" data-k="w">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${+w.day === d ? "selected" : ""}>${DAYS[d]}</option>`).join("")}</select>
            <input type="time" data-f="start" data-k="w" value="${w.start}"><input type="time" data-f="end" data-k="w" value="${w.end}"><button class="danger" data-del="w">✕</button></div>`).join("") || '<p class="muted">Ninguna todavía.</p>'}
          <button class="sec" id="addW">+ Añadir sesión semanal</button></div>
        <div class="card"><h3>Partidos y sesiones puntuales</h3>
          ${upcoming.map(({ e, i }) => `<div class="sched-item ev" data-i="${i}"><input type="date" data-f="date" data-k="e" value="${e.date}">${typeSel(e.type, "e")}<input type="time" data-f="start" data-k="e" value="${e.start}"><input type="time" data-f="end" data-k="e" value="${e.end}"><input placeholder="Rival / nota" data-f="label" data-k="e" value="${esc(e.label || "")}"><button class="danger" data-del="e">✕</button></div>`).join("") || '<p class="muted">Ninguno.</p>'}
          <button class="sec" id="addE">+ Añadir partido / sesión</button></div>
        <div class="card"><h3>Días sin sesiones fijas (festivos, vacaciones)</h3>
          <p class="muted" style="font-size:13px">Esos días no se avisa de las sesiones semanales (los partidos puntuales sí).</p>
          <div class="row">${s.skipDates.filter(x => x >= U.today()).sort().map(x => `<span class="pill">${fmtDate(x)} <button class="danger" data-skip="${x}" style="padding:0 4px">✕</button></span>`).join("")}</div>
          <div class="row" style="margin-top:8px"><input type="date" id="skipD" style="width:auto"><button class="sec" id="addS">Añadir día</button></div></div>
        <button class="full" id="sSave">Guardar horario</button>`;
      view.querySelectorAll("[data-f]").forEach(inp => inp.onchange = () => { const i = +inp.closest("[data-i]").dataset.i, arr = inp.dataset.k === "w" ? s.weekly : s.events; arr[i][inp.dataset.f] = inp.dataset.f === "day" ? +inp.value : inp.value; });
      view.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const i = +b.closest("[data-i]").dataset.i; (b.dataset.del === "w" ? s.weekly : s.events).splice(i, 1); draw(); });
      view.querySelectorAll("[data-skip]").forEach(b => b.onclick = () => { s.skipDates = s.skipDates.filter(x => x !== b.dataset.skip); draw(); });
      $("#addW").onclick = () => { s.weekly.push({ id: "w" + Date.now(), type: "entreno", day: 1, start: "19:00", end: "20:30" }); draw(); };
      $("#addE").onclick = () => { s.events.push({ id: "e" + Date.now(), date: U.today(), type: "partido", start: "12:00", end: "13:30", label: "" }); draw(); };
      $("#addS").onclick = () => { const v = $("#skipD").value; if (v && !s.skipDates.includes(v)) s.skipDates.push(v); draw(); };
      $("#sWt").onchange = e => s.wellnessTime = e.target.value;
      $("#sDel").onchange = e => s.rpeDelay = +e.target.value;
      $("#sSave").onclick = async () => {
        if ([...s.weekly, ...s.events].some(x => !x.start || !x.end || x.end <= x.start)) return toast("Revisa las horas: el final debe ser posterior al inicio");
        s.weekly.sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.start.localeCompare(b.start));
        try { await Store.saveSchedule(s); schedule = s; toast("Horario guardado ✓"); draw(); } catch (e) { toast("Error: " + e.message); }
      };
    };
    draw();
  }

  start();
})();
