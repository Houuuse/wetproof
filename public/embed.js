// ---- pdf.js ESM loader (v5.x) ----
let PDFJS = null;
let pdfModulePromise = (async () => {
  try {
    const mod = await import('/pdfjs/build/pdf.mjs');
    mod.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
    PDFJS = mod;
    return mod;
  } catch (e) {
    console.warn('Failed to load pdf.js ESM:', e);
    return null;
  }
})();

// ---- UI refs ----
const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('pdfFile');
const btn = document.getElementById('checkBtn');
const summary = document.getElementById('summary');

const thumbsWrap = document.getElementById('thumbs');

const carousel = document.getElementById('carousel');
const slideCanvas = document.getElementById('slideCanvas');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pager = document.getElementById('pager');

// ---- state for carousel ----
let currentPdf = null;
let pageCount = 0;
let currentIndex = 1; // 1-based
const pageCache = new Map(); // pageIndex -> {width,height,bitmap or canvas}

// ---- helpers ----
const ok = (t) => `<span class="ok">${t}</span>`;
const bad = (t) => `<span class="bad">${t}</span>`;

function setPager(i, total) {
  pager.textContent = `Page ${i} / ${total}`;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Render a page to a canvas (returns {canvas, width, height})
async function renderPageToCanvas(pdf, index, targetWidthCss) {
  const page = await pdf.getPage(index);
  const base = page.getViewport({ scale: 1 });
  const scale = clamp(targetWidthCss / base.width, 0.2, 2.0);
  const viewport = page.getViewport({ scale });

  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.width = Math.floor(viewport.width * dpr);
  c.height = Math.floor(viewport.height * dpr);
  c.style.width = Math.floor(viewport.width) + 'px';
  c.style.height = Math.floor(viewport.height) + 'px';

  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await page.render({ canvasContext: ctx, viewport }).promise;

  return { canvas: c, width: viewport.width, height: viewport.height };
}

// Lazy-render for carousel
async function ensurePageRendered(index) {
  if (pageCache.has(index)) return pageCache.get(index);
  const targetWidthCss = slideCanvas.parentElement.clientWidth || 480;
  const rendered = await renderPageToCanvas(currentPdf, index, targetWidthCss);
  pageCache.set(index, rendered);
  return rendered;
}

async function showSlide(index) {
  currentIndex = clamp(index, 1, pageCount);
  const { canvas: src } = await ensurePageRendered(currentIndex);

  // Resize slideCanvas to match src CSS size & DPR nicely
  const dpr = window.devicePixelRatio || 1;
  const cssW = src.style.width ? parseInt(src.style.width, 10) : src.width / dpr;
  const cssH = src.style.height ? parseInt(src.style.height, 10) : src.height / dpr;
  slideCanvas.width = Math.floor(cssW * dpr);
  slideCanvas.height = Math.floor(cssH * dpr);
  slideCanvas.style.width = cssW + 'px';
  slideCanvas.style.height = cssH + 'px';

  const ctx = slideCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, slideCanvas.width, slideCanvas.height);
  // Draw at device resolution
  ctx.drawImage(src, 0, 0, slideCanvas.width, slideCanvas.height);

  setPager(currentIndex, pageCount);
}

// Render thumbs for ≤ 2 pages
async function renderThumbs(pdf, total) {
  thumbsWrap.innerHTML = '';
  const wrapWidth = thumbsWrap.clientWidth || 520;
  const target = Math.min(520, wrapWidth);
  for (let i = 1; i <= total; i++) {
    const { canvas } = await renderPageToCanvas(pdf, i, target);
    thumbsWrap.appendChild(canvas);
  }
}

// Keyboard + buttons for carousel
function wireNav() {
  prevBtn.onclick = () => showSlide(currentIndex - 1);
  nextBtn.onclick = () => showSlide(currentIndex + 1);

  document.addEventListener('keydown', (e) => {
    if (carousel.hidden) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showSlide(currentIndex - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showSlide(currentIndex + 1); }
  }, { passive: false });
}
wireNav();

// ---- submit ----
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = fileInput.files[0];
  if (!file) return alert('Select a PDF first.');

  btn.disabled = true;
  summary.hidden = false;
  summary.innerHTML = '<p>Checking PDF…</p>';
  thumbsWrap.hidden = true;
  carousel.hidden = true;

  try {
    // 1) Run server-side checks
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/inspect', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Inspection failed');

    const bleedOK = !data.analysis.flags.missingBleed;
    const sizeOK  = !data.analysis.flags.wrongSize;

    summary.innerHTML = `
      <p><strong>${data.filename}</strong></p>
      <p>${bleedOK ? ok('Bleed OK') : bad('Missing bleed')}</p>
      <p>${sizeOK ? ok('Size OK') : bad('Wrong size')}</p>
      <p><small>${data.pageCount || '?'} page${data.pageCount === 1 ? '' : 's'}</small></p>
    `;

    // 2) Client-side preview logic (ESM pdf.js)
    const mod = await pdfModulePromise;
    if (!mod) return; // pdf.js failed to load

    const buf = await file.arrayBuffer();
    const docTask = mod.getDocument({
      data: buf,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableCreateObjectURL: true
    });
    currentPdf = await docTask.promise;
    pageCount = currentPdf.numPages;
    pageCache.clear();

    if (pageCount <= 2) {
      thumbsWrap.hidden = false;
      await renderThumbs(currentPdf, pageCount);
    } else {
      carousel.hidden = false;
      await showSlide(1);
    }
  } catch (err) {
    summary.innerHTML = `<p class="bad">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
});

// Handle responsive resize (re-render current slide size)
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (carousel.hidden || !currentPdf) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // clear cache so we can re-render to the new width
    pageCache.clear();
    showSlide(currentIndex);
  }, 150);
});
