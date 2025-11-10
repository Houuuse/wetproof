// --- pdf.js worker setup ---
let PDFJS = window.pdfjsLib || null;
if (PDFJS) {
  PDFJS.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.4.394/legacy/build/pdf.worker.min.js';
}

const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('pdfFile');
const btn = document.getElementById('checkBtn');
const summary = document.getElementById('summary');
const canvas = document.getElementById('previewCanvas');

// --- helpers ---
function badge(ok, text) {
  const cls = ok ? 'ok' : 'bad';
  return `<span class="${cls}">${text}</span>`;
}

// --- upload + result ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = fileInput.files[0];
  if (!file) return alert('Select a PDF first.');

  btn.disabled = true;
  summary.hidden = false;
  summary.innerHTML = '<p>Checking PDF…</p>';

  const fd = new FormData();
  fd.append('file', file);

  try {
    const resp = await fetch('/api/inspect', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Inspection failed');

    const bleedFlag = !data.analysis.flags.missingBleed;
    const sizeFlag  = !data.analysis.flags.wrongSize;

    summary.innerHTML = `
      <p><strong>${data.filename}</strong></p>
      <p>${badge(bleedFlag, bleedFlag ? 'Bleed OK' : 'Missing bleed')}</p>
      <p>${badge(sizeFlag, sizeFlag ? 'Size OK' : 'Wrong size')}</p>
      <p><small>${data.pageCount || '?'} page${data.pageCount === 1 ? '' : 's'}</small></p>
    `;

    renderPreview(file);
  } catch (err) {
    summary.innerHTML = `<p class="bad">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
});

// --- quick first-page preview ---
async function renderPreview(file) {
  if (!PDFJS) return;
  try {
    const buf = await file.arrayBuffer();
    const pdf = await PDFJS.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (e) {
    console.warn('Preview error:', e);
  }
}
