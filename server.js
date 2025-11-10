const express = require('express');
const multer = require('multer');
const { PDFDocument, PDFName, PDFArray } = require('pdf-lib');
const path = require('path');



const app = express();
const PORT = process.env.PORT || 3000;

// Default fallbacks (used if client doesn't send values)
const DEFAULT_MIN_BLEED_MM = 3;
const DEFAULT_TOLERANCE_MM = 1.5;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist')));

// in server.js
app.get('/embed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'embed.html'));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- helpers ----------
const PT_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const ptToMm = (pt) => (pt / PT_PER_INCH) * MM_PER_INCH;
const mmToPt = (mm) => (mm / MM_PER_INCH) * PT_PER_INCH;
const round1 = (n) => Math.round(n * 10) / 10;

function pdfArrayToRect(arr) {
  const x1 = arr.get(0)?.asNumber?.() ?? 0;
  const y1 = arr.get(1)?.asNumber?.() ?? 0;
  const x2 = arr.get(2)?.asNumber?.() ?? 0;
  const y2 = arr.get(3)?.asNumber?.() ?? 0;
  return { x1, y1, x2, y2, widthPt: x2 - x1, heightPt: y2 - y1 };
}

function sizeSummaryFromPt(widthPt, heightPt) {
  return {
    width: { pt: round1(widthPt), mm: round1(ptToMm(widthPt)) },
    height: { pt: round1(heightPt), mm: round1(ptToMm(heightPt)) },
  };
}

function compareToExpected(widthMm, heightMm, expectedW, expectedH, tolMm) {
  if (expectedW == null || expectedH == null) return { matches: null, reason: 'no_expected_size' };
  const within =
    Math.abs(widthMm - expectedW) <= tolMm && Math.abs(heightMm - expectedH) <= tolMm;
  const withinRotated =
    Math.abs(widthMm - expectedH) <= tolMm && Math.abs(heightMm - expectedW) <= tolMm;
  if (within) return { matches: true, rotated: false };
  if (withinRotated) return { matches: true, rotated: true };
  return { matches: false, rotated: null };
}
// ----------------------------

app.post('/api/inspect', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

    // Pull options from multipart fields (multer puts them on req.body)
    const preset = req.body.preset || null;
    const expectedWidthMm  = req.body.expectedWidthMm  ? parseFloat(req.body.expectedWidthMm)  : null;
    const expectedHeightMm = req.body.expectedHeightMm ? parseFloat(req.body.expectedHeightMm) : null;
    const minBleedMm       = req.body.minBleedMm       ? parseFloat(req.body.minBleedMm)       : DEFAULT_MIN_BLEED_MM;
    const sizeToleranceMm  = req.body.sizeToleranceMm  ? parseFloat(req.body.sizeToleranceMm)  : DEFAULT_TOLERANCE_MM;

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    } catch {
      return res.json({
        ok: true,
        message: 'PDF received but could not be parsed',
        filename: req.file.originalname,
        mime: req.file.mimetype,
        bytes: req.file.size,
        pageCount: null,
        analysis: { pages: [], flags: { missingBleed: null, wrongSize: null } },
        optionsUsed: { preset, expectedWidthMm, expectedHeightMm, minBleedMm, sizeToleranceMm },
        notes: 'Parsing failed; checks require a readable PDF.',
      });
    }

    const pageCount = pdfDoc.getPageCount();
    const pages = [];
    let anyMissingBleed = false;
    let anyWrongSize = false;

    const minBleedPt = mmToPt(minBleedMm);

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();

      const trimArr = page.node.lookupMaybe(PDFName.of('TrimBox'), PDFArray);
      const cropArr = page.node.lookupMaybe(PDFName.of('CropBox'), PDFArray);
      const bleedArr = page.node.lookupMaybe(PDFName.of('BleedBox'), PDFArray);

      const mediaBox = { widthPt: width, heightPt: height };
      const trimBox = trimArr ? pdfArrayToRect(trimArr) : (cropArr ? pdfArrayToRect(cropArr) : null);
      const bleedBox = bleedArr ? pdfArrayToRect(bleedArr) : null;

      let bleedMarginPt = null;
      if (bleedBox && trimBox) {
        const marginW = (bleedBox.widthPt - trimBox.widthPt) / 2;
        const marginH = (bleedBox.heightPt - trimBox.heightPt) / 2;
        bleedMarginPt = Math.max(0, Math.min(marginW, marginH));
      }

      const sizeForCheckPt = trimBox
        ? { w: trimBox.widthPt, h: trimBox.heightPt }
        : { w: mediaBox.widthPt, h: mediaBox.heightPt };
      const sizeForCheckMm = { w: ptToMm(sizeForCheckPt.w), h: ptToMm(sizeForCheckPt.h) };

      const sizeCompare = compareToExpected(
        sizeForCheckMm.w,
        sizeForCheckMm.h,
        expectedWidthMm,
        expectedHeightMm,
        sizeToleranceMm
      );

      const pageFlags = {
        missingBleed: bleedMarginPt == null ? true : bleedMarginPt < minBleedPt - 0.01,
        wrongSize: sizeCompare.matches === false,
      };

      anyMissingBleed ||= pageFlags.missingBleed;
      anyWrongSize ||= pageFlags.wrongSize;

      pages.push({
        index: i + 1,
        mediaBox: sizeSummaryFromPt(mediaBox.widthPt, mediaBox.heightPt),
        trimBox: trimBox ? sizeSummaryFromPt(trimBox.widthPt, trimBox.heightPt) : null,
        bleedBox: bleedBox ? sizeSummaryFromPt(bleedBox.widthPt, bleedBox.heightPt) : null,
        bleedMargin: bleedMarginPt != null
          ? { pt: round1(bleedMarginPt), mm: round1(ptToMm(bleedMarginPt)) }
          : null,
        expected: (expectedWidthMm && expectedHeightMm)
          ? {
              width_mm: expectedWidthMm,
              height_mm: expectedHeightMm,
              tolerance_mm: sizeToleranceMm,
              matched: sizeCompare.matches,
              rotatedMatch: sizeCompare.rotated || false,
            }
          : null,
        flags: pageFlags,
      });
    }

    res.json({
      ok: true,
      message: 'PDF inspected',
      filename: req.file.originalname,
      mime: req.file.mimetype,
      bytes: req.file.size,
      pageCount,
      analysis: {
        minBleedRequired: { mm: minBleedMm, pt: round1(minBleedPt) },
        expectedSize: (expectedWidthMm && expectedHeightMm)
          ? { width_mm: expectedWidthMm, height_mm: expectedHeightMm, tolerance_mm: sizeToleranceMm }
          : null,
        pages,
        flags: { missingBleed: anyMissingBleed, wrongSize: anyWrongSize },
      },
      optionsUsed: { preset, expectedWidthMm, expectedHeightMm, minBleedMm, sizeToleranceMm },
    });
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ ok: false, error: err.message || 'Unknown error' });
});

app.listen(PORT, () => {
  console.log(`Wetproof Stage 2 running at http://localhost:${PORT}`);
});
