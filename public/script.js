const form = document.getElementById('uploadForm');
const out = document.getElementById('out');
const btn = document.getElementById('submitBtn');
const fileInput = document.getElementById('pdfFile');
const preset = document.getElementById('preset');
const widthMm = document.getElementById('widthMm');
const heightMm = document.getElementById('heightMm');
const minBleedMm = document.getElementById('minBleedMm');
const sizeToleranceMm = document.getElementById('sizeToleranceMm');

// Helpers
const inchToMm = (n) => n * 25.4;

// Big preset list (common print sizes, mm)
const PRESETS = [
  // A-series (ISO 216)
  { id: 'A0',  w: 841,  h: 1189 },
  { id: 'A1',  w: 594,  h: 841  },
  { id: 'A2',  w: 420,  h: 594  },
  { id: 'A3',  w: 297,  h: 420  },
  { id: 'A4',  w: 210,  h: 297  },
  { id: 'A5',  w: 148,  h: 210  },
  { id: 'A6',  w: 105,  h: 148  },
  { id: 'A7',  w: 74,   h: 105  },

  // B-series (ISO 216) — common poster sizes
  { id: 'B0',  w: 1000, h: 1414 },
  { id: 'B1',  w: 707,  h: 1000 },
  { id: 'B2',  w: 500,  h: 707  },
  { id: 'B3',  w: 353,  h: 500  },
  { id: 'B4',  w: 250,  h: 353  },
  { id: 'B5',  w: 176,  h: 250  },
  { id: 'B6',  w: 125,  h: 176  },
  { id: 'B7',  w: 88,   h: 125  },

  // US sizes (inches converted to mm)
  { id: 'US Letter', w: inchToMm(8.5),  h: inchToMm(11)    }, // 216 x 279
  { id: 'US Legal',  w: inchToMm(8.5),  h: inchToMm(14)    }, // 216 x 356
  { id: 'Tabloid',   w: inchToMm(11),   h: inchToMm(17)    }, // 279 x 432
  { id: 'Ledger',    w: inchToMm(17),   h: inchToMm(11)    }, // 432 x 279 (rot.)
  { id: 'Executive', w: inchToMm(7.25), h: inchToMm(10.5)  }, // ~184 x 267
  { id: 'Statement', w: inchToMm(5.5),  h: inchToMm(8.5)   }, // 140 x 216
  { id: 'Half Letter', w: inchToMm(5.5), h: inchToMm(8.5)  },

  // Cards / DL / flyers
  { id: 'Business Card (AU/EU)', w: 90,  h: 55  },
  { id: 'Business Card (EU-Alt)', w: 85, h: 55  },
  { id: 'Business Card (US)',    w: 89,  h: 51  }, // 3.5 x 2 in ≈ 88.9 x 50.8
  { id: 'DL (AU/NZ)',            w: 99,  h: 210 }, // third A4
  { id: 'Square Card 120',       w: 120, h: 120 },

  // Posters (common)
  { id: 'Poster A2', w: 420, h: 594 },
  { id: 'Poster A1', w: 594, h: 841 },
  { id: 'Poster B1', w: 707, h: 1000 },

  // Envelopes (C-series fits A-series)
  { id: 'C4 Envelope (fits A4)', w: 229, h: 324 },
  { id: 'C5 Envelope (fits A5)', w: 162, h: 229 },
  { id: 'C6 Envelope (fits A6)', w: 114, h: 162 },
  { id: 'DL Envelope',           w: 110, h: 220 },

  // Photos (inches to mm)
  { id: 'Photo 4x6"',  w: inchToMm(4),  h: inchToMm(6)  },   // 102 x 152
  { id: 'Photo 5x7"',  w: inchToMm(5),  h: inchToMm(7)  },   // 127 x 178
  { id: 'Photo 8x10"', w: inchToMm(8),  h: inchToMm(10) },   // 203 x 254

  // Fallback
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
  if (p.w && p.h) {
    widthMm.value = p.w.toFixed(1);
    heightMm.value = p.h.toFixed(1);
    widthMm.disabled = true;
    heightMm.disabled = true;
  } else {
    widthMm.disabled = false;
    heightMm.disabled = false;
    widthMm.value = '';
    heightMm.value = '';
  }
}

preset.addEventListener('change', () => applyPreset(preset.value));

populatePresets();

// Submit
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!fileInput.files || fileInput.files.length === 0) {
    out.textContent = 'Select a PDF first.';
    return;
  }

  btn.disabled = true;
  out.textContent = 'Uploading…';

  try {
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('preset', preset.value);

    // Pass numbers only if present
    if (widthMm.value && heightMm.value) {
      fd.append('expectedWidthMm', widthMm.value);
      fd.append('expectedHeightMm', heightMm.value);
    }
    if (minBleedMm.value) fd.append('minBleedMm', minBleedMm.value);
    if (sizeToleranceMm.value) fd.append('sizeToleranceMm', sizeToleranceMm.value);

    const resp = await fetch('/api/inspect', { method: 'POST', body: fd });
    const data = await resp.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = `Request failed: ${err.message || err}`;
  } finally {
    btn.disabled = false;
  }
});
