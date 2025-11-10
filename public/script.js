// === UI refs ===
const form = document.getElementById('uploadForm');
const out = document.getElementById('out');
const btn = document.getElementById('submitBtn');
const fileInput = document.getElementById('pdfFile');

const preset = document.getElementById('preset');
const widthMm = document.getElementById('widthMm');
const heightMm = document.getElementById('heightMm');
const minBleedMm = document.getElementById('minBleedMm');
const sizeToleranceMm = document.getElementById('sizeToleranceMm');

const reportSection = document.getElementById('reportSection');
const previewSection = document.getElementById('previewSection');
const reportActions = document.getElementById('reportActions');

const summaryEl = document.getElementById('summary');
const pageCardsEl = document.getElementById('pageCards');
const previewCanvas = document.getElementById('previewCanvas');

const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
const printBtn = document.getElementById('printBtn');
const copySummaryBtn = document.getElementById('copySummaryBtn');



// Helpers
const inchToMm = (n) => n * 25.4;
const round1 = (n) => Math.round(n * 10) / 10;

// Safe access to global pdf.js
let PDFJS = null;
if (window.pdfjsLib) {
  PDFJS = window.pdfjsLib;
  // Use the matching legacy worker
  PDFJS.GlobalWorkerOptions.workerSrc = '/pdfjs/legacy/build/pdf.worker.min.js';
} else {
  console.warn('pdfjs not available; preview will be skipped.');
}


// Presets (mm)
const PRESETS = [
  { id: 'A0',  w: 841,  h: 1189 }, { id: 'A1',  w: 594,  h: 841  },
  { id: 'A2',  w: 420,  h: 594  }, { id: 'A3',  w: 297,  h: 420  },
  { id: 'A4',  w: 210,  h: 297  }, { id: 'A5',  w: 148,  h: 210  },
  { id: 'A6',  w: 105,  h: 148  }, { id: 'A7',  w: 74,   h: 105  },
  { id: 'B0',  w: 1000, h: 1414 }, { id: 'B1',  w: 707,  h: 1000 },
  { id: 'B2',  w: 500,  h: 707  }, { id: 'B3',  w: 353,  h: 500  },
  { id: 'B4',  w: 250,  h: 353  }, { id: 'B5',  w: 176,  h: 250  },
  { id: 'B6',  w: 125,  h: 176  }, { id: 'B7',  w: 88,   h: 125  },
  { id: 'US Letter', w: inchToMm(8.5),  h: inchToMm(11)    },
  { id: 'US Legal',  w: inchToMm(8.5),  h: inchToMm(14)    },
  { id: 'Tabloid',   w: inchToMm(11),   h: inchToMm(17)    },
  { id: 'Ledger',    w: inchToMm(17),   h: inchToMm(11)    },
  { id: 'Executive', w: inchToMm(7.25), h: inchToMm(10.5)  },
  { id: 'Statement', w: inchToMm(5.5),  h: inchToMm(8.5)   },
  { id: 'Half Letter', w: inchToMm(5.5), h: inchToMm(8.5)  },
  { id: 'Business Card (AU/EU)', w: 90,  h: 55  },
  { id: 'Business Card (EU-Alt)', w: 85, h: 55  },
  { id: 'Business Card (US)',    w: 89,  h: 51  },
  { id: 'DL (AU/NZ)',            w: 99,  h: 210 },
  { id: 'Square Card 120',       w: 120, h: 120 },
  { id: 'Poster A2', w: 420, h: 594 }, { id: 'Poster A1', w: 594, h: 841 },
  { id: 'Poster B1', w: 707, h: 1000 },
  { id: 'C4 Envelope (fits A4)', w: 229, h: 324 },
  { id: 'C5 Envelope (fits A5)', w: 162, h: 229 },
  { id: 'C6 Envelope (fits A6)', w: 114, h: 162 },
  { id: 'DL Envelope',           w: 110, h: 220 },
  { id: 'Photo 4x6"',  w: inchToMm(4),  h: inchToMm(6)  },
  { id: 'Photo 5x7"',  w: inchToMm(5),  h: inchToMm(7)  },
  { id: 'Photo 8x10"', w: inchToMm(8),  h: inchToMm(10) },
  { id: 'Custom', w: null, h: null },
];

function populatePresets() {
  preset.innerHTML = '';
  PRESETS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.id + (p.w && p.h ? ` (${Math.round(p.w)}×${Math.round(p.h)} mm)` : '');
    preset.appendChild(opt);
  });
  preset.value = 'A4';
  applyPreset('A4');
}

function applyPreset(id) {
  const p = PRESETS.find(x => x.id === id);
  if (!p) return;
  // Don’t disable inputs (some browsers act weird with disabled values).
  if (p.w && p.h) {
    widthMm.value = p.w.toFixed(1);
    heightMm.value = p.h.toFixed(1);
  } else {
    widthMm.value = '';
    heightMm.value = '';
  }
}
preset.addEventListener('change', () => applyPreset(preset.value));
populatePresets();

// Always derive expected WxH from preset OR custom fields
function getExpectedSize() {
  const p = PRESETS.find(x => x.id === preset.value);
  if (p && p.w && p.h) {
    return { w: +p.w, h: +p.h };
  }
  const w = parseFloat(widthMm.value);
  const h = parseFloat(heightMm.value);
  if (Number.isFinite(w) && Number.isFinite(h)) return { w, h };
  return { w: null, h: null };
}

// Submit + build report
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Select a PDF first.');
    return;
  }
  btn.disabled = true;

  const fd = new FormData();
  const file = fileInput.files[0];
  fd.append('file', file);
  fd.append('preset', preset.value);

  // ALWAYS send expected size if we have it
  const { w: expW, h: expH } = getExpectedSize();
  if (Number.isFinite(expW) && Number.isFinite(expH)) {
    fd.append('expectedWidthMm', String(expW));
    fd.append('expectedHeightMm', String(expH));
  }

  if (minBleedMm.value) fd.append('minBleedMm', minBleedMm.value);
  if (sizeToleranceMm.value) fd.append('sizeToleranceMm', sizeToleranceMm.value);

  let data;
  try {
    const resp = await fetch('/api/inspect', { method: 'POST', body: fd });
    data = await resp.json();
  } catch (err) {
    btn.disabled = false;
    alert('Upload failed: ' + (err.message || err));
    return;
  }

  out.textContent = JSON.stringify(data, null, 2);
  buildReport(data);

  try { await renderFirstPagePreview(file); } catch {}
  reportSection.hidden = false;
  previewSection.hidden = false;
  reportActions.hidden = false;
  btn.disabled = false;
});

// Build the readable report (unchanged structurally)
function buildReport(data) {
  const { filename, pageCount, analysis = {}, optionsUsed = {} } = data;
  const flags = analysis.flags || {};
  const bleedBadge = badge(flags.missingBleed === true ? 'bad' : flags.missingBleed === false ? 'ok' : 'warn',
                           flags.missingBleed === true ? 'Missing bleed' :
                           flags.missingBleed === false ? 'Bleed OK' : 'Bleed unknown');
  const sizeBadge  = badge(flags.wrongSize === true ? 'bad' : flags.wrongSize === false ? 'ok' : 'warn',
                           flags.wrongSize === true ? 'Wrong size' :
                           flags.wrongSize === false ? 'Size OK' : 'Size not checked');

  summaryEl.innerHTML = `
    <div><strong>File:</strong> ${escapeHtml(filename || '(untitled)')}</div>
    <div><strong>Pages:</strong> ${pageCount ?? '—'}</div>
    <div><strong>Preset:</strong> ${escapeHtml(optionsUsed?.preset || '(none)')}</div>
    <div><strong>Expected:</strong> ${
      analysis.expectedSize
        ? `${analysis.expectedSize.width_mm} × ${analysis.expectedSize.height_mm} mm (±${analysis.expectedSize.tolerance_mm} mm)`
        : '—'
    }</div>
    <div style="margin-top:8px;">
      <span class="badge ${classFor(bleedBadge)}">${textFor(bleedBadge)}</span>
      <span class="badge ${classFor(sizeBadge)}" style="margin-left:6px">${textFor(sizeBadge)}</span>
    </div>
  `;

  pageCardsEl.innerHTML = '';
  (analysis.pages || []).forEach(p => {
    const bleed = p.bleedMargin ? `${p.bleedMargin.mm} mm` : '—';
    const trim  = p.trimBox ? `${p.trimBox.width.mm} × ${p.trimBox.height.mm} mm` : '—';
    const media = p.mediaBox ? `${p.mediaBox.width.mm} × ${p.mediaBox.height.mm} mm` : '—';
    const bleedFlag = p.flags?.missingBleed ? badge('bad','Missing bleed') : badge('ok','Bleed OK');
    const sizeFlag  = p.flags?.wrongSize ? badge('bad','Wrong size') : badge('ok','Size OK');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>Page ${p.index}</h3>
      <div class="kv">
        <div>Trim:</div><div>${trim}</div>
        <div>Media:</div><div>${media}</div>
        <div>Bleed margin:</div><div>${bleed}</div>
        ${
          p.expected
            ? `<div>Expected:</div><div>${p.expected.width_mm} × ${p.expected.height_mm} mm (±${p.expected.tolerance_mm} mm)${p.expected.rotatedMatch ? ' — rotated OK' : ''}</div>`
            : ''
        }
        <div>Checks:</div>
        <div>
          <span class="badge ${classFor(bleedFlag)}">${textFor(bleedFlag)}</span>
          <span class="badge ${classFor(sizeFlag)}" style="margin-left:6px">${textFor(sizeFlag)}</span>
        </div>
      </div>
    `;
    pageCardsEl.appendChild(card);
  });

  downloadHtmlBtn.onclick = () => downloadStandaloneReportHTML(data);
  printBtn.onclick = () => window.print();
  copySummaryBtn.onclick = () => {
    const summaryText = buildPlainSummary(data);
    navigator.clipboard.writeText(summaryText).then(() => {
      copySummaryBtn.textContent = 'Copied!';
      setTimeout(() => (copySummaryBtn.textContent = 'Copy summary'), 1200);
    });
  };
}

async function renderFirstPagePreview(file) {
  const arrayBuf = await file.arrayBuffer();
  const task = PDFJS.getDocument({ data: arrayBuf });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);

  const scale = 0.8;
  const viewport = page.getViewport({ scale });
  const canvas = previewCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
}

// Downloadable standalone HTML
function downloadStandaloneReportHTML(data) {
  const html = buildStandaloneHTML(data);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (data.filename ? data.filename.replace(/\.pdf$/i,'') : 'wetproof-report') + '.report.html';
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildStandaloneHTML(data) {
  const head = `
<meta charset="utf-8">
<title>Wetproof Report — ${escapeHtml(data.filename || '')}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.5; background:#fff; color:#111; }
  .summary, .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin-bottom: 12px; background:#fff; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #999; font-size:12px; }
  .ok { border-color:#1a7f1a; color:#1a7f1a; }
  .bad { border-color:#b10f2e; color:#b10f2e; }
  .warn { border-color:#a06b00; color:#a06b00; }
  .kv { display:grid; grid-template-columns:max-content 1fr; column-gap:10px; row-gap:4px; }
</style>`;
  const { filename, pageCount, analysis = {}, optionsUsed = {} } = data;
  const flags = analysis.flags || {};
  const bleedTxt = flags.missingBleed === true ? 'Missing bleed' : flags.missingBleed === false ? 'Bleed OK' : 'Bleed unknown';
  const bleedCls = flags.missingBleed === true ? 'bad' : flags.missingBleed === false ? 'ok' : 'warn';
  const sizeTxt  = flags.wrongSize === true ? 'Wrong size' : flags.wrongSize === false ? 'Size OK' : 'Size not checked';
  const sizeCls  = flags.wrongSize === true ? 'bad' : flags.wrongSize === false ? 'ok' : 'warn';

  let pageHtml = '';
  (analysis.pages || []).forEach(p => {
    pageHtml += `
      <div class="card">
        <h3>Page ${p.index}</h3>
        <div class="kv">
          <div>Trim:</div><div>${p.trimBox ? `${p.trimBox.width.mm} × ${p.trimBox.height.mm} mm` : '—'}</div>
          <div>Media:</div><div>${p.mediaBox ? `${p.mediaBox.width.mm} × ${p.mediaBox.height.mm} mm` : '—'}</div>
          <div>Bleed margin:</div><div>${p.bleedMargin ? `${p.bleedMargin.mm} mm` : '—'}</div>
          ${p.expected ? `<div>Expected:</div><div>${p.expected.width_mm} × ${p.expected.height_mm} mm (±${p.expected.tolerance_mm} mm)${p.expected.rotatedMatch ? ' — rotated OK' : ''}</div>` : ''}
          <div>Checks:</div>
          <div>
            <span class="badge ${p.flags?.missingBleed ? 'bad' : 'ok'}">${p.flags?.missingBleed ? 'Missing bleed' : 'Bleed OK'}</span>
            <span class="badge ${p.flags?.wrongSize ? 'bad' : 'ok'}" style="margin-left:6px">${p.flags?.wrongSize ? 'Wrong size' : 'Size OK'}</span>
          </div>
        </div>
      </div>`;
  });

  return `<!doctype html><html><head>${head}</head><body>
    <h1>Wetproof — Report</h1>
    <div class="summary">
      <div><strong>File:</strong> ${escapeHtml(filename || '(untitled)')}</div>
      <div><strong>Pages:</strong> ${pageCount ?? '—'}</div>
      <div><strong>Expected:</strong> ${
        analysis.expectedSize
          ? `${analysis.expectedSize.width_mm} × ${analysis.expectedSize.height_mm} mm (±${analysis.expectedSize.tolerance_mm} mm)`
          : '—'
      }</div>
      <div style="margin-top:8px;">
        <span class="badge ${bleedCls}">${bleedTxt}</span>
        <span class="badge ${sizeCls}" style="margin-left:6px">${sizeTxt}</span>
      </div>
    </div>
    ${pageHtml}
  </body></html>`;
}

// Small utils
function badge(kind, text) { return { kind, text }; }
function classFor(b) { return b.kind; }
function textFor(b) { return b.text; }
function buildPlainSummary(data) {
  const { filename, pageCount, analysis = {} } = data;
  const flags = analysis.flags || {};
  const bleedTxt = flags.missingBleed === true ? 'Missing bleed' : flags.missingBleed === false ? 'Bleed OK' : 'Bleed unknown';
  const sizeTxt  = flags.wrongSize === true ? 'Wrong size' : flags.wrongSize === false ? 'Size OK' : 'Size not checked';
  const lines = [];
  lines.push(`Wetproof report — ${filename || '(untitled)'}`);
  lines.push(`Pages: ${pageCount ?? '—'}`);
  if (analysis.expectedSize) {
    lines.push(`Expected: ${analysis.expectedSize.width_mm} × ${analysis.expectedSize.height_mm} mm (±${analysis.expectedSize.tolerance_mm} mm)`);
  }
  lines.push(`Overall: ${bleedTxt}; ${sizeTxt}`);
  (analysis.pages || []).forEach(p => {
    lines.push(`Page ${p.index}: trim ${p.trimBox ? `${p.trimBox.width.mm}×${p.trimBox.height.mm}mm` : '—'}, bleed ${p.bleedMargin ? `${p.bleedMargin.mm}mm` : '—'} — ${p.flags?.missingBleed ? 'Missing bleed' : 'Bleed OK'}, ${p.flags?.wrongSize ? 'Wrong size' : 'Size OK'}`);
  });
  return lines.join('\n');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
