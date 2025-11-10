const form = document.getElementById('uploadForm');
const out = document.getElementById('out');
const btn = document.getElementById('submitBtn');
const fileInput = document.getElementById('pdfFile');

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

    const resp = await fetch('/api/inspect', {
      method: 'POST',
      body: fd,
    });

    const data = await resp.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = `Request failed: ${err.message || err}`;
  } finally {
    btn.disabled = false;
  }
});
