/* Generador de Excel (.xlsx) con gráficos nativos, sin dependencias.
   XLSX.build({ sheets:[{ name, cols:[{header,width}], rows:[[...]],
     charts:[{ type:'line'|'bar', stacked, title, catCol, series:[{col,name,color}],
               from:{col,row}, to:{col,row}, yMin, yMax }] }] }) -> Uint8Array            */
(function (root) {
  const enc = new TextEncoder();
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const cleanName = n => String(n).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31) || "Hoja";
  const ref = (sheet, col, r1, r2) => `'${sheet.replace(/'/g, "''")}'!$${colName(col)}$${r1}:$${colName(col)}$${r2}`;

  /* ---------- ZIP (sin compresión) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const parts = [], central = []; let offset = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  /* ---------- Partes del libro ---------- */
  function sheetXml(sh, hasDrawing) {
    const rows = [sh.cols.map(c => c.header), ...sh.rows];
    const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
      if (v === null || v === undefined || v === "") return "";
      const a = colName(ci) + (ri + 1), s = ri === 0 ? ' s="1"' : "";
      return typeof v === "number" && isFinite(v) ? `<c r="${a}"${s}><v>${v}</v></c>` : `<c r="${a}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("") + "</row>").join("");
    const cols = sh.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 12}" customWidth="1"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${hasDrawing ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
  }

  function chartXml(sh, ch) {
    const n = sh.rows.length, r1 = 2, r2 = Math.max(2, n + 1), line = ch.type === "line";
    const catCache = `<c:strCache><c:ptCount val="${n}"/>${sh.rows.map((r, i) => `<c:pt idx="${i}"><c:v>${esc(r[ch.catCol] ?? "")}</c:v></c:pt>`).join("")}</c:strCache>`;
    const sers = ch.series.map((s, i) => {
      const color = (s.color || "2A78D6").replace("#", "").toUpperCase();
      const numCache = `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${sh.rows.map((r, j) => typeof r[s.col] === "number" ? `<c:pt idx="${j}"><c:v>${r[s.col]}</c:v></c:pt>` : "").join("")}</c:numCache>`;
      const sp = line
        ? `<c:spPr><a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`
        : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr><c:invertIfNegative val="0"/>`;
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>${sp}<c:cat><c:strRef><c:f>${esc(ref(sh.name, ch.catCol, r1, r2))}</c:f>${catCache}</c:strRef></c:cat><c:val><c:numRef><c:f>${esc(ref(sh.name, s.col, r1, r2))}</c:f>${numCache}</c:numRef></c:val>${line ? '<c:smooth val="0"/>' : ""}</c:ser>`;
    }).join("");
    const group = line
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>`
      : `<c:barChart><c:barDir val="col"/><c:grouping val="${ch.stacked ? "stacked" : "clustered"}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="60"/>${ch.stacked ? '<c:overlap val="100"/>' : ""}<c:axId val="5001"/><c:axId val="5002"/></c:barChart>`;
    const scale = `<c:scaling><c:orientation val="minMax"/>${ch.yMax != null ? `<c:max val="${ch.yMax}"/>` : ""}${ch.yMin != null ? `<c:min val="${ch.yMin}"/>` : ""}</c:scaling>`;
    const txt = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="52514E"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-ES"/></a:p></c:txPr>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-ES" sz="1200" b="1"/><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${group}<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C3C2B7"/></a:solidFill></a:ln></c:spPr>${txt}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="5002"/>${scale}<c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E1E0D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt}<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txt}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }

  function drawingXml(charts, firstId) {
    const a = charts.map((ch, i) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${ch.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${ch.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${a}</xdr:wsDr>`;
  }

  function build(book) {
    const files = [], ct = [], wbSheets = [], wbRels = [];
    let chartNo = 0, drawNo = 0;
    const used = new Set();
    book.sheets.forEach((sh, i) => {
      let nm = cleanName(sh.name), k = 2; while (used.has(nm.toLowerCase())) nm = cleanName(sh.name).slice(0, 28) + " " + k++;
      used.add(nm.toLowerCase()); sh.name = nm;
      const charts = (sh.charts || []).filter(c => sh.rows.length > 0);
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh, charts.length > 0) });
      ct.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      wbSheets.push(`<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`);
      wbRels.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
      if (charts.length) {
        drawNo++;
        files.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawNo}.xml"/></Relationships>` });
        files.push({ name: `xl/drawings/drawing${drawNo}.xml`, data: drawingXml(charts) });
        ct.push(`<Override PartName="/xl/drawings/drawing${drawNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        const rels = charts.map((ch, j) => {
          chartNo++;
          files.push({ name: `xl/charts/chart${chartNo}.xml`, data: chartXml(sh, ch) });
          ct.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
          return `<Relationship Id="rId${j + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`;
        }).join("");
        files.push({ name: `xl/drawings/_rels/drawing${drawNo}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` });
      }
    });
    const n = book.sheets.length;
    files.unshift(
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct.join("")}</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${wbSheets.join("")}</sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3B63"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` }
    );
    return zip(files);
  }

  function download(filename, bytes) {
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  root.XLSX = { build, download };
  if (typeof module !== "undefined") module.exports = root.XLSX;
})(typeof self !== "undefined" ? self : globalThis);
