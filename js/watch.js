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
  async function readImages(files, onProgress) {
    const T = await loadTesseract();
    const out = {}; let i = 0;
    for (const f of files) {
      const { data } = await T.recognize(f, "spa+eng", { logger: m => m.status === "recognizing text" && onProgress && onProgress((i + m.progress) / files.length) });
      const p = parse(data.text);
      for (const k in p) if (p[k] != null && out[k] == null) out[k] = p[k];
      i++;
    }
    return out;
  }
  const fmtDur = m => m == null ? "" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  const parseDur = s => { if (s == null || s === "") return null; s = String(s).trim(); if (/^\d+$/.test(s)) return +s; const m = s.match(DUR); return toMin(m); };

  root.Watch = { FIELDS, parse, readImages, fmtDur, parseDur };
  if (typeof module !== "undefined") module.exports = root.Watch;
})(typeof self !== "undefined" ? self : globalThis);
