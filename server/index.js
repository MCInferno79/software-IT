require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bitte-aendern';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SCREENSHOTS_DIR = path.join(UPLOADS_DIR, 'screenshots');
const DOCS_DIR = path.join(UPLOADS_DIR, 'anleitungen');
// Bewusst NICHT unter UPLOADS_DIR (das ist komplett oeffentlich unter /uploads
// erreichbar, siehe app.use('/uploads', ...) unten) - Zertifikate & Co. sind
// vertrauliche Voraussetzungs-Uploads und sollen nicht per URL abrufbar sein.
// Liegt stattdessen im data-Verzeichnis, das ebenfalls als Volume persistiert
// wird (siehe docker-compose.yml), aber nicht oeffentlich ausgeliefert wird.
const REQUEST_FILES_DIR = path.join(__dirname, '..', 'data', 'anforderungen-uploads');
for (const dir of [UPLOADS_DIR, SCREENSHOTS_DIR, DOCS_DIR, REQUEST_FILES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8 // 8 Stunden
    }
  })
);

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Hilfsfunktionen ----------

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Nicht angemeldet.' });
}

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function makeUpload(destDir, allowedTypes, options) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
      const ext = safeExt(file.originalname) || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  });
  return multer({
    storage,
    limits: { fileSize: (options && options.maxSizeMb ? options.maxSizeMb : 15) * 1024 * 1024, files: (options && options.maxFiles) || 10 },
    fileFilter: (req, file, cb) => {
      if (!allowedTypes || allowedTypes.includes(file.mimetype)) return cb(null, true);
      cb(new Error('Dateityp nicht erlaubt.'));
    }
  });
}

const uploadScreenshot = makeUpload(SCREENSHOTS_DIR, [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);
const uploadDoc = makeUpload(DOCS_DIR, null);
// Fuer Voraussetzungs-Uploads (z. B. Zertifikate) bei Anforderungen: kleineres
// Groessenlimit als bei den Admin-Uploads, da diese Dateien als Base64 im
// Webhook-Payload an n8n mitgeschickt und dort per Mail versendet werden.
const uploadRequirement = makeUpload(
  REQUEST_FILES_DIR,
  ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  { maxSizeMb: 10, maxFiles: 10 }
);

function publicStand(stand) {
  return {
    ...stand,
    screenshots: [...stand.screenshots].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  };
}

// ---------- Auth ----------

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password === 'string' && password.length > 0 && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Falsches Passwort.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- Oeffentliche Stand-Routen ----------

app.get('/api/stands', (req, res) => {
  res.json(db.listStands().map(publicStand));
});

app.get('/api/stands/:id', (req, res) => {
  const stand = db.getStand(req.params.id);
  if (!stand) return res.status(404).json({ error: 'Stand nicht gefunden.' });
  res.json(publicStand(stand));
});

// ---------- Admin: Stand CRUD ----------

app.post('/api/stands', requireAuth, async (req, res) => {
  try {
    const stand = await db.createStand(req.body || {});
    res.status(201).json(publicStand(stand));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// Muss vor PUT /api/stands/:id stehen, sonst wuerde Express "reorder" als
// :id-Parameter interpretieren.
app.put('/api/stands/reorder', requireAuth, async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order) || order.some((v) => typeof v !== 'string')) {
    return res.status(400).json({ error: 'order muss ein Array von Stand-IDs sein.' });
  }
  const stands = await db.reorderStands(order);
  res.json(stands.map(publicStand));
});

app.put('/api/stands/:id', requireAuth, async (req, res) => {
  try {
    const stand = await db.updateStand(req.params.id, req.body || {});
    if (!stand) return res.status(404).json({ error: 'Stand nicht gefunden.' });
    res.json(publicStand(stand));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

app.delete('/api/stands/:id', requireAuth, async (req, res) => {
  const stand = await db.getStand(req.params.id);
  if (stand) {
    for (const shot of stand.screenshots) {
      const p = path.join(SCREENSHOTS_DIR, shot.filename);
      fs.unlink(p, () => {});
    }
    if (stand.instructionsFile) {
      fs.unlink(path.join(DOCS_DIR, stand.instructionsFile), () => {});
    }
  }
  const removed = await db.deleteStand(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Stand nicht gefunden.' });
  res.json({ ok: true });
});

// ---------- Admin: Screenshots ----------

app.post(
  '/api/stands/:id/screenshots',
  requireAuth,
  uploadScreenshot.array('screenshots', 10),
  async (req, res) => {
    const stand = db.getStand(req.params.id);
    if (!stand) return res.status(404).json({ error: 'Stand nicht gefunden.' });
    const files = req.files || [];
    const created = [];
    for (const file of files) {
      const shot = await db.addScreenshot(req.params.id, file.filename);
      created.push(shot);
    }
    res.status(201).json(created);
  }
);

app.delete('/api/stands/:id/screenshots/:shotId', requireAuth, async (req, res) => {
  const stand = db.getStand(req.params.id);
  if (!stand) return res.status(404).json({ error: 'Stand nicht gefunden.' });
  const shot = stand.screenshots.find((s) => s.id === req.params.shotId);
  const removed = await db.deleteScreenshot(req.params.id, req.params.shotId);
  if (!removed) return res.status(404).json({ error: 'Screenshot nicht gefunden.' });
  if (shot) fs.unlink(path.join(SCREENSHOTS_DIR, shot.filename), () => {});
  res.json({ ok: true });
});

app.put('/api/stands/:id/screenshots/order', requireAuth, async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order muss ein Array sein.' });
  const stand = await db.reorderScreenshots(req.params.id, order);
  if (!stand) return res.status(404).json({ error: 'Stand nicht gefunden.' });
  res.json(publicStand(stand));
});

// ---------- Admin: Anleitung-Upload ----------

app.post(
  '/api/stands/:id/instructions-file',
  requireAuth,
  uploadDoc.single('instructions'),
  async (req, res) => {
    const stand = db.getStand(req.params.id);
    if (!stand) return res.status(404).json({ error: 'Stand nicht gefunden.' });
    if (!req.file) return res.status(400).json({ error: 'Keine Datei erhalten.' });
    if (stand.instructionsFile) {
      fs.unlink(path.join(DOCS_DIR, stand.instructionsFile), () => {});
    }
    const updated = await db.setInstructionsFile(req.params.id, req.file.filename);
    res.json(publicStand(updated));
  }
);

// ---------- Anforderung an IT-Strategie (n8n Webhook) ----------

function cleanupUploadedFiles(files) {
  for (const f of files || []) fs.unlink(f.path, () => {});
}

// Pflicht-Upload-Dateifelder kommen vom Frontend benannt als upload_<requirementId>,
// damit sie sich auch bei mehreren Dateien eindeutig der jeweiligen Admin-
// Vorgabe (Label) zuordnen lassen (siehe buildUploadFields() in public/js/app.js).
app.post('/api/stands/:id/request', uploadRequirement.any(), async (req, res) => {
  const stand = db.getStand(req.params.id);
  if (!stand) {
    cleanupUploadedFiles(req.files);
    return res.status(404).json({ error: 'Stand nicht gefunden.' });
  }

  const requesterName = (req.body?.requesterName || '').trim();
  const requesterEmail = (req.body?.requesterEmail || '').trim();
  const message = (req.body?.message || '').trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const requiredUploads = stand.requiredUploads || [];
  const filesByRequirement = new Map();
  for (const f of req.files || []) {
    const match = /^upload_(.+)$/.exec(f.fieldname);
    if (match) filesByRequirement.set(match[1], f);
  }
  const missingUploads = requiredUploads.filter((r) => !filesByRequirement.has(r.id));

  if (!requesterName || !requesterEmail || !message) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({ error: 'Name, E-Mail und Nachricht sind Pflichtfelder.' });
  }
  if (!emailPattern.test(requesterEmail)) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }
  if (requiredUploads.length > 0 && missingUploads.length > 0) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({
      error: `Bitte alle erforderlichen Dateien hochladen: ${missingUploads.map((u) => u.label).join(', ')}`
    });
  }

  const webhookUrl = stand.webhookUrl || N8N_WEBHOOK_URL;

  const uploadedFilesForWebhook = requiredUploads.map((r) => {
    const f = filesByRequirement.get(r.id);
    return {
      label: r.label,
      filename: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      contentBase64: fs.readFileSync(f.path).toString('base64')
    };
  });

  const payload = {
    standId: stand.id,
    standName: stand.name,
    category: stand.category,
    requesterName: requesterName || '',
    requesterEmail: requesterEmail || '',
    message: message || '',
    source: 'Software-Marktplatz',
    timestamp: new Date().toISOString(),
    ...(uploadedFilesForWebhook.length > 0 ? { uploadedFiles: uploadedFilesForWebhook } : {})
  };

  let webhookStatus = 'nicht konfiguriert';
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      webhookStatus = resp.ok ? 'gesendet' : `fehler (${resp.status})`;
    } catch (err) {
      webhookStatus = `fehler (${err.message})`;
    }
  }

  await db.addRequest({
    standId: stand.id,
    standName: stand.name,
    requesterName,
    requesterEmail,
    message,
    uploadedFiles: uploadedFilesForWebhook.map(({ label, filename }) => ({ label, filename })),
    webhookStatus
  });

  if (webhookUrl && webhookStatus.startsWith('fehler')) {
    return res.status(502).json({ ok: false, error: 'Webhook konnte nicht erreicht werden.' });
  }
  res.json({ ok: true, webhookConfigured: !!webhookUrl });
});

app.get('/api/requests', requireAuth, (req, res) => {
  res.json(db.listRequests());
});

app.delete('/api/requests/all', requireAuth, async (req, res) => {
  const deleted = await db.deleteAllRequests();
  res.json({ ok: true, deleted });
});

app.delete('/api/requests', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
  if (!ids.length) return res.status(400).json({ error: 'Keine IDs angegeben.' });
  const deleted = await db.deleteRequests(ids);
  res.json({ ok: true, deleted });
});

// ---------- Fehlerbehandlung fuer Uploads ----------

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Dateityp nicht erlaubt.') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

app.listen(PORT, () => {
  console.log(`Software-Marktplatz laeuft auf http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNUNG: ADMIN_PASSWORD ist nicht gesetzt, es wird ein Standardwert verwendet. Bitte .env anlegen!');
  }
  if (!N8N_WEBHOOK_URL) {
    console.warn('Hinweis: N8N_WEBHOOK_URL ist nicht gesetzt. Anforderungen werden nur protokolliert, aber nicht gesendet, solange kein Stand einen eigenen Webhook hat.');
  }
});
