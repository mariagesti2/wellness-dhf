/* Gráficos SVG ligeros con tooltip (línea y barras apiladas) */
(function (root) {
  const NS = "http://www.w3.org/2000/svg";
  const PAD = { l: 34, r: 12, t: 12, b: 26 };
  const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const fmtLabel = s => (s && s.length === 10 && s[4] === "-") ? s.slice(8, 10) + "/" + s.slice(5, 7) : s;
  const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

  function frame(container, o, yMin, yMax) {
    container.innerHTML = ""; container.classList.add("chart");
    const W = Math.max(260, Math.round(container.clientWidth || 640));
    const H = o.height || 200, svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title || "gráfico" }, container);
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b, n = o.labels.length;
    const y = v => PAD.t + ih - (v - yMin) / (yMax - yMin) * ih;
    const ticks = o.yTicks || [0, .25, .5, .75, 1].map(f => yMin + f * (yMax - yMin));
    ticks.forEach(t => {
      el("line", { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t), class: t === yMin ? "c-base" : "c-grid" }, svg);
      el("text", { x: PAD.l - 6, y: y(t) + 4, "text-anchor": "end", class: "c-tick" }, svg).textContent = Math.round(t * 10) / 10;
    });
    const step = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 70))));
    const x = i => PAD.l + (n <= 1 ? iw / 2 : (o.band ? (i + .5) * iw / n : i * iw / (n - 1)));
    o.labels.forEach((l, i) => { if (i % step === 0 || i === n - 1 && n < 8) el("text", { x: x(i), y: H - 8, "text-anchor": "middle", class: "c-tick" }, svg).textContent = fmtLabel(l); });
    const tip = document.createElement("div"); tip.className = "c-tip"; container.appendChild(tip);
    return { svg, x, y, H, W, iw, ih, n, tip };
  }

  function hover(container, f, o, valuesAt) {
    const cross = el("line", { y1: PAD.t, y2: f.H - PAD.b, class: "c-cross", visibility: "hidden" }, f.svg);
    const hit = el("rect", { x: PAD.l, y: 0, width: f.iw, height: f.H, fill: "transparent" }, f.svg);
    const move = ev => {
      const r = f.svg.getBoundingClientRect(), pt = (ev.touches ? ev.touches[0] : ev);
      const sx = (pt.clientX - r.left) / r.width * f.W;
      let best = 0, bd = 1e9; for (let i = 0; i < f.n; i++) { const d = Math.abs(f.x(i) - sx); if (d < bd) { bd = d; best = i; } }
      cross.setAttribute("x1", f.x(best)); cross.setAttribute("x2", f.x(best)); cross.setAttribute("visibility", "visible");
      const rows = valuesAt(best);
      f.tip.innerHTML = `<b>${fmtLabel(o.labels[best])}</b>` + rows.map(r => `<div><i style="background:${r.color}"></i>${r.name}: <b>${r.value ?? "—"}</b></div>`).join("");
      f.tip.style.display = "block";
      const px = f.x(best) / f.W * r.width; const tw = f.tip.offsetWidth;
      f.tip.style.left = Math.min(Math.max(0, px - tw / 2), r.width - tw) + "px";
    };
    const leave = () => { cross.setAttribute("visibility", "hidden"); f.tip.style.display = "none"; };
    hit.addEventListener("mousemove", move); hit.addEventListener("touchstart", move, { passive: true }); hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", leave);
  }

  function legend(container, series) {
    if (series.length < 2) return;
    const lg = document.createElement("div"); lg.className = "c-legend";
    lg.innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
    container.prepend(lg);
  }

  function line(container, o) {
    const all = o.series.flatMap(s => s.values).filter(v => v != null);
    const yMin = o.yMin ?? 0, yMax = o.yMax ?? niceMax(Math.max(1, ...all));
    const f = frame(container, o, yMin, yMax);
    if (o.refLine != null) el("line", { x1: PAD.l, x2: f.W - PAD.r, y1: f.y(o.refLine), y2: f.y(o.refLine), class: "c-ref" }, f.svg);
    o.series.forEach(s => {
      let d = "", pen = false;
      s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + f.x(i).toFixed(1) + " " + f.y(v).toFixed(1); pen = true; });
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, f.svg);
      s.values.forEach((v, i) => { if (v != null && (f.n <= 31)) el("circle", { cx: f.x(i), cy: f.y(v), r: 3, fill: s.color, stroke: "var(--surface)", "stroke-width": 1.5 }, f.svg); });
    });
    legend(container, o.series);
    hover(container, f, o, i => o.series.map(s => ({ name: s.name, color: s.color, value: s.values[i] })));
  }

  function bars(container, o) {
    const totals = o.labels.map((_, i) => o.series.reduce((a, s) => a + (s.values[i] || 0), 0));
    const yMax = o.yMax ?? niceMax(Math.max(1, ...totals));
    o.band = true;
    const f = frame(container, o, 0, yMax);
    const bw = Math.max(2, Math.min(28, f.iw / f.n * 0.7));
    o.labels.forEach((_, i) => {
      let acc = 0;
      o.series.forEach((s, si) => {
        const v = s.values[i] || 0; if (!v) return;
        const y0 = f.y(acc), y1 = f.y(acc + v); acc += v;
        const top = !o.series.slice(si + 1).some(t => t.values[i]);
        const h = Math.max(0, y0 - y1 - (acc > v ? 2 : 0));
        el("rect", { x: f.x(i) - bw / 2, y: y1, width: bw, height: h, rx: top ? 3 : 0, fill: s.color }, f.svg);
      });
    });
    legend(container, o.series);
    hover(container, f, o, i => [...o.series.map(s => ({ name: s.name, color: s.color, value: s.values[i] || 0 })), { name: "Total", color: "transparent", value: totals[i] }]);
  }

  root.Charts = { line, bars };
})(self);
