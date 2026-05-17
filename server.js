require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PUB_KEY = process.env.ILOVEPDF_PUBLIC_KEY;
const ILOVE_BASE = 'https://api.ilovepdf.com/v1';

async function getToken() {
  const res = await fetch(`${ILOVE_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: PUB_KEY })
  });
  if (!res.ok) throw new Error('Auth failed');
  const { token } = await res.json();
  return token;
}

app.post('/api/process', upload.array('files'), async (req, res) => {
  const { tool } = req.body;
  const files = req.files;

  if (!tool || !files?.length)
    return res.status(400).json({ error: 'Missing tool or files' });

  try {
    const token = await getToken();

    const startRes = await fetch(`${ILOVE_BASE}/start/${tool}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!startRes.ok) throw new Error('Start failed');
    const { server, task } = await startRes.json();
    const base = `https://${server}/v1`;

    const uploadedFiles = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('task', task);
      fd.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
      const upRes = await fetch(`${base}/upload`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, ...fd.getHeaders() },
        body: fd
      });
      if (!upRes.ok) throw new Error('Upload failed');
      const upData = await upRes.json();
      uploadedFiles.push({
        server_filename: upData.server_filename,
        filename: file.originalname
      });
    }

    const procRes = await fetch(`${base}/process`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ task, tool, files: uploadedFiles })
    });
    if (!procRes.ok) throw new Error('Process failed');

    const dlRes = await fetch(`${base}/download/${task}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!dlRes.ok) throw new Error('Download failed');

    const contentType = dlRes.headers.get('content-type') || 'application/pdf';
    const ext = contentType.includes('zip') ? 'zip' : 'pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition',
      `attachment; filename="pdfbuddy_result.${ext}"`);
    dlRes.body.pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ PDF Buddy running on port ${PORT}`));
