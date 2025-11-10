const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// Multer: keep PDF in memory (no disk writes yet)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB limit for Stage 1
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// Simple health endpoint (optional)
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Upload endpoint: returns JSON summary
app.post('/api/inspect', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    // Try to parse PDF and get page count (ignore encryption errors)
    let pageCount = null;
    try {
      const pdfDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } catch (e) {
      // If parsing fails, we still respond—Stage 1 only needs a JSON response
      pageCount = null;
    }

    res.json({
      ok: true,
      message: 'PDF received',
      filename: req.file.originalname,
      mime: req.file.mimetype,
      bytes: req.file.size,
      pageCount,
      // Stage 2 will fill these with real values
      analysis: {
        pageSize: null,
        trimBox: null,
        bleedBox: null,
        notes: 'Stage 1 placeholder. Real checks start in Stage 2.',
      },
    });
  } catch (err) {
    next(err);
  }
});

// Centralized JSON error handler
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(400)
    .json({ ok: false, error: err.message || 'Unknown error' });
});

app.listen(PORT, () => {
  console.log(`Wetproof Stage 1 running at http://localhost:${PORT}`);
});
