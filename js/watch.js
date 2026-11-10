/* Lectura de capturas de apps de salud/reloj (sueño y recuperación).
   OCR en el propio móvil con Tesseract.js; la imagen no sale del dispositivo. */
(function (root) {
  const FIELDS = [
    { k: "sleepMin", n: "Sueño total", u: "min", dur: true },
    { k: "sleepScore", n: "Puntuación sueño", u: "/100" },
    { k: "deepMin", n: "Profundo", u: "min", dur: true },
    { k: "remMin", n: "REM", u: "min", dur: true },
    { k: "lightMin", n: "Ligero", u: "min", dur: true },
    { k: "awakeMin", n: "Despierto", u: "min", dur: true },
    { k: "hrRest", n: "FC basal", u: "lpm" },
    { k: "hrv", n: "VFC (HRV)", u: "ms" },
    { k: "tempDev", n: "Temperatura (desv.)", u: "°C" },
    { k: "resp", n: "Frec. respiratoria", u: "rpm" }
  ];
  const DUR = /(\d{1,2})\s*h(?:oras?|rs?)?\s*(?:(\d{1,2})\s*m(?:in)?)?(?![a-z])|(\d{1,3})\s*m(?:in)?(?![a-zá])/i;
  const toMin = m => m ? (m[1] != null ? +m[1] * 60 + (+m[2] || 0) : +m[3]) : null;
  const num = s => s == null ? null : +String(s).replace(",", ".").replace("−", "-");

  function after(text, labelRe, valueRe, maxChars = 160) {
    const re = new RegExp(labelRe, "gi"); let m;
    while ((m = re.exec(text))) {
      const seg = text.slice(m.index + m[0].length, m.index + m[0].length + maxChars);
      const v = seg.match(valueRe);
      if (v) return v;
    }
    return null;
  }

  function parse(raw) {
    const t = raw.replace(/\r/g, "");
    const o = {};
    // Sueño total: junto a "dormido / asleep / tiempo dormido" o la primera duración con horas
    let tot = after(t, "(tiempo dormido|time asleep|asleep|sueño total|total sleep)", DUR, 60);
    if (!tot) { const m = t.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*m(?:in)?(?![a-z])/i); if (m) tot = [m[0], m[1], m[2]]; }
    o.sleepMin = toMin(tot);
    const ST = { deepMin: "\\b(profundo|deep)\\b", remMin: "\\bREM\\b", lightMin: "\\b(ligero|esencial|core|light)\\b", awakeMin: "\\b(despiert[oa]|awake)\\b" };
    // Columnas: una línea con varias etiquetas y debajo una línea con varias duraciones
    const lines = t.split("\n");
    lines.forEach((ln, i) => {
      const labs = Object.entries(ST).map(([k, r]) => { const m = ln.match(new RegExp(r, "i")); return m ? { k, at: m.index } : null; }).filter(Boolean).sort((a, b) => a.at - b.at);
      if (labs.length < 2) return;
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const durs = [...lines[j].matchAll(new RegExp(DUR.source, "gi"))];
        if (durs.length >= labs.length) { labs.forEach((l, n) => { if (o[l.k] == null) o[l.k] = toMin(durs[n]); }); break; }
      }
    });
    for (const [k, r] of Object.entries(ST)) if (o[k] == null) o[k] = toMin(after(t, r, DUR));
    const hr = after(t, "(FC basal|FC en reposo|frecuencia card[ií]aca en reposo|resting heart rate|resting hr|RHR)", /(\d{2,3})\s*(lpm|bpm|ppm)?/i, 60);
    o.hrRest = hr ? +hr[1] : (t.match(/(\d{2,3})\s*(lpm|bpm)/i) || [])[1] * 1 || null;
    const hrv = after(t, "(VFC|HRV|variabilidad)", /(\d{2,3})\s*ms/i, 80);
    o.hrv = hrv ? +hrv[1] : null;
    const rr = after(t, "(frec\\.?\\s*resp|respiraci[oó]n|respiratory|resp\\. rate)", /(\d{1,2}[,.]\d)/, 60);
    o.resp = rr ? num(rr[1]) : null;
    const tp = after(t, "(temperatura|temperature|temp\\.)", /([-−+]?\s?\d{1,2}[,.]\d)/, 40);
    o.tempDev = tp ? num(tp[1].replace(/\s/g, "")) : null;
    if (o.tempDev != null && Math.abs(o.tempDev) > 5) o.tempDev = null;   // no es una desviación
    const sc = t.match(/^\s*(\d{2,3})\s*\n+\s*(bien|excelente|[oó]ptim[oa]|regular|bajo|mal|good|excellent|optimal|fair|poor|pay attention)\b/im)
      || after(t, "(puntuaci[oó]n|sleep score|score)", /\b(\d{2,3})\b/, 40);
    o.sleepScore = sc && +sc[1] <= 100 ? +sc[1] : null;
    // coherencia
    ["deepMin", "remMin", "lightMin", "awakeMin"].forEach(k => { if (o[k] != null && o.sleepMin != null && o[k] > o.sleepMin + 60) o[k] = null; });
    if (o.hrRest != null && (o.hrRest < 30 || o.hrRest > 120)) o.hrRest = null;
    if (o.hrv != null && (o.hrv < 5 || o.hrv > 300)) o.hrv = null;
    if (o.resp != null && (o.resp < 6 || o.resp > 40)) o.resp = null;
    return o;
  }

  const WORKOUT_FIELDS = [
    { k: "durationMin", n: "Duración", u: "min", dur: true },
    { k: "kcal", n: "Calorías", u: "kcal" },
    { k: "hrAvg", n: "FC media", u: "lpm" },
    { k: "hrMax", n: "FC máxima", u: "lpm" },
    { k: "deviceLoad", n: "Carga del reloj", u: "" },
    { k: "deviceRpe", n: "Esfuerzo del reloj", u: "/10" },
    { k: "z1", n: "Zona 1", u: "min" }, { k: "z2", n: "Zona 2", u: "min" }, { k: "z3", n: "Zona 3", u: "min" },
    { k: "z4", n: "Zona 4", u: "min" }, { k: "z5", n: "Zona 5", u: "min" }
  ];
  function parseWorkout(raw) {
    const t = raw.replace(/\r/g, ""), o = {};
    const hms = after(t, "(tiempo de entrenamiento|duraci[oó]n|workout time|total time|duration|tiempo total)", /(\d{1,2}):(\d{2}):(\d{2})/, 40);
    if (hms) o.durationMin = +hms[1] * 60 + +hms[2] + Math.round(+hms[3] / 60);
    else { const d = after(t, "(tiempo de entrenamiento|duraci[oó]n|workout time|total time|duration|tiempo total)", DUR, 40) || t.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*m(?:in)?(?![a-z])/i); if (d) o.durationMin = d.length === 3 ? +d[1] * 60 + +d[2] : toMin(d); }
    const kc = after(t, "(calor[ií]as activas|active calories|active kcal)", /(\d{2,4})\s*(kcal|cal)/i, 40) || t.match(/(\d{2,4})\s*kcal/i);
    o.kcal = kc ? +kc[1] : null;
    const rpe = t.match(/\b(10|[1-9])\s*\/\s*10\b/);
    o.deviceRpe = rpe ? +rpe[1] : null;
    // Pulso en columnas (Media · Activa · Máx) o etiqueta + valor
    const lines = t.split("\n"), HR = { hrAvg: "\\b(media|promedio|average|avg)\\b", hrMax: "\\b(m[aá]x(ima)?|max(imum)?)\\b" };
    lines.forEach((ln, i) => {
      if (!/(media|promedio|average)/i.test(ln) || !/m[aá]x/i.test(ln)) return;
      const labs = [...ln.matchAll(/\b(media|promedio|average|avg|activa|active|m[aá]x(ima)?|max(imum)?|m[ií]n(ima)?)\b/gi)].map(m => m[1].toLowerCase());
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const vals = [...lines[j].matchAll(/(\d{2,3})\s*(lpm|bpm|ppm)/gi)].map(m => +m[1]);
        if (vals.length >= 2) { labs.forEach((l, n) => { if (vals[n] == null) return; if (/^(media|promedio|average|avg)$/.test(l) && o.hrAvg == null) o.hrAvg = vals[n]; if (/^m[aá]x/.test(l) && o.hrMax == null) o.hrMax = vals[n]; }); break; }
      }
    });
    for (const [k, r] of Object.entries(HR)) if (o[k] == null) { const m = after(t, "(frecuencia card[ií]aca |FC |heart rate )?" + r, /(\d{2,3})\s*(lpm|bpm|ppm)/i, 50); if (m) o[k] = +m[1]; }
    const ld = t.match(/(\d{1,4}(?:[,.]\d)?)\s*\n?\s*(carga|load|strain|trimp)\b/i) || after(t, "\\b(carga|training load|strain|trimp)\\b", /(\d{1,4}(?:[,.]\d)?)/, 25);
    o.deviceLoad = ld ? num(ld[1]) : null;
    if (o.deviceLoad == null) { const m = t.match(/\d{1,2}\s*h\s*\d{1,2}\s*m(?:in)?\s+(\d{1,4}[,.]\d)\b/i); if (m) o.deviceLoad = num(m[1]); }
    for (const m of t.matchAll(/\b(?:zona|zone)\s*([1-5])\b[^\n]*?\b(\d{1,3}):(\d{2})\b/gi)) { const k = "z" + m[1]; if (o[k] == null) o[k] = Math.round((+m[2] + +m[3] / 60) * 10) / 10; }
    if (o.hrAvg != null && (o.hrAvg < 50 || o.hrAvg > 220)) o.hrAvg = null;
    if (o.hrMax != null && (o.hrMax < 80 || o.hrMax > 230)) o.hrMax = null;
    if (o.durationMin != null && (o.durationMin < 5 || o.durationMin > 600)) o.durationMin = null;
    return o;
  }

  let loading = null;
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    return loading = loading || new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = () => res(root.Tesseract); s.onerror = () => rej(new Error("No se pudo cargar el lector de imágenes (¿sin conexión?)"));
      document.head.appendChild(s);
    });
  }
  async function readImages(files, onProgress, parser = parse) {
    const T = await loadTesseract();
    const out = {}; let i = 0;
    for (const f of files) {
      const { data } = await T.recognize(f, "spa+eng", { logger: m => m.status === "recognizing text" && onProgress && onProgress((i + m.progress) / files.length) });
      const p = parser(data.text);
      for (const k in p) if (p[k] != null && out[k] == null) out[k] = p[k];
      i++;
    }
    return out;
  }
  const fmtDur = m => m == null ? "" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  const parseDur = s => { if (s == null || s === "") return null; s = String(s).trim(); if (/^\d+$/.test(s)) return +s; const m = s.match(DUR); return toMin(m); };

  root.Watch = { FIELDS, WORKOUT_FIELDS, parse, parseWorkout, readImages, fmtDur, parseDur };
  if (typeof module !== "undefined") module.exports = root.Watch;
})(typeof self !== "undefined" ? self : globalThis);
