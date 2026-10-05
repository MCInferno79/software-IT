// Einfache dateibasierte Datenhaltung (JSON). Kein Datenbankserver noetig,
// damit sich die Anwendung ohne Zusatz-Infrastruktur selbst hosten laesst.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function id() {
  return crypto.randomUUID();
}

// Vorbefuellte Programme beim allerersten Start (leere/neue Installation),
// damit die Seite nicht leer ist. Admin kann jeden Eintrag jederzeit
// bearbeiten oder loeschen - das hier ist nur ein Startpunkt.
function seedStands() {
  const now = new Date().toISOString();
  const seed = [
    {
      name: 'Taiga',
      category: 'Projektmanagement',
      tagline: 'Agile Projekt- und Aufgabenverwaltung (Kanban/Scrum)',
      description:
        'Taiga ist eine Open-Source-Projektmanagement-Plattform für agiles Arbeiten (Scrum und Kanban). Teams verwalten Projekte, User Stories, Aufgaben und Bugs in Boards, planen Sprints, verfolgen den Fortschritt per Burndown-Charts und weisen Aufgaben untereinander zu. Eignet sich für die Planung und Steuerung von IT- und Fachprojekten innerhalb der Verwaltung.',
      color: '#6c5ce7'
    },
    {
      name: 'Nextcloud',
      category: 'Cloud-Speicher & Zusammenarbeit',
      tagline: 'Selbstgehostete Dateiablage, Freigaben und Zusammenarbeit',
      description:
        'Nextcloud ist eine selbstgehostete Cloud-Plattform für Dateiablage, -freigabe und Zusammenarbeit. Mitarbeitende speichern Dokumente, teilen sie sicher mit Kolleginnen und Kollegen oder externen Partnern, bearbeiten Text, Tabellen und Präsentationen gemeinsam in Echtzeit und synchronisieren Kalender, Kontakte und Aufgaben – vollständig unter eigener Datenhoheit und DSGVO-konform.',
      color: '#0082c9'
    },
    {
      name: 'HeKI',
      category: 'Künstliche Intelligenz',
      tagline: 'KI-Assistent für Text- und Rechercheaufgaben in der Verwaltung',
      description:
        'HeKI ist ein KI-gestützter Assistent für die Verwaltung, der bei alltäglichen Schreib- und Rechercheaufgaben unterstützt – etwa beim Formulieren von Texten, Zusammenfassen von Dokumenten oder Beantworten von Fachfragen. Die Nutzung erfolgt innerhalb der dienstlichen Infrastruktur, sodass keine dienstlichen Inhalte an externe KI-Anbieter übermittelt werden.',
      color: '#4a90d9'
    },
    {
      name: 'Speakr',
      category: 'Transkription & Protokollierung',
      tagline: 'Automatische Transkription und Zusammenfassung von Besprechungen',
      description:
        'Speakr ist eine selbstgehostete Anwendung zur automatischen Transkription und Zusammenfassung von Besprechungen. Audioaufnahmen von Meetings werden per Spracherkennung in Text umgewandelt und anschließend KI-gestützt zusammengefasst, inklusive Erkennung von Aufgaben und Beschlüssen – auf eigener Infrastruktur und ohne Weitergabe an Dritte.',
      color: '#e17055'
    },
    {
      name: 'draw.io',
      category: 'Diagramme & Visualisierung',
      tagline: 'Diagramme, Flowcharts und Organigramme erstellen',
      description:
        'draw.io (diagrams.net) ist ein Werkzeug zum Erstellen von Diagrammen, Flussdiagrammen, Organigrammen, Netzwerkplänen und weiteren Visualisierungen direkt im Browser. Diagramme lassen sich per Drag-and-Drop erstellen, mit Kolleginnen und Kollegen teilen und in gängigen Formaten (PNG, SVG, PDF) exportieren oder in andere Dokumente einbetten.',
      color: '#f08705'
    },
    {
      name: 'BBB',
      category: 'Videokonferenz',
      tagline: 'Browserbasierte Videokonferenzen und virtuelle Meetings',
      description:
        'BigBlueButton (BBB) ist eine browserbasierte Videokonferenzlösung speziell für Lehr- und Besprechungszwecke. Sie bietet Webcam- und Bildschirmübertragung, ein interaktives Whiteboard, Breakout-Räume für Kleingruppen, Umfragen sowie die Aufzeichnung von Sitzungen – ideal für Schulungen, Gremiensitzungen und virtuelle Meetings der Verwaltung.',
      color: '#283274'
    }
  ];
  return seed.map((s, index) => ({
    id: id(),
    name: s.name,
    category: s.category,
    tagline: s.tagline,
    description: s.description,
    procurement: '',
    instructionsUrl: '',
    instructionsFile: '',
    webhookUrl: '',
    requestMode: 'form',
    requestUrl: '',
    requiredUploads: [],
    color: s.color,
    previewScreenshotId: '',
    sortOrder: index + 1,
    screenshots: [],
    createdAt: now,
    updatedAt: now
  }));
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ stands: seedStands(), requests: [] }, null, 2));
  }
}

function read() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.stands)) data.stands = [];
    if (!Array.isArray(data.requests)) data.requests = [];
    return data;
  } catch (err) {
    return { stands: [], requests: [] };
  }
}

// Sehr einfache serialisierte Schreib-Warteschlange, damit parallele
// Schreibvorgaenge sich nicht gegenseitig ueberschreiben.
let writeChain = Promise.resolve();
function write(data) {
  writeChain = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeChain;
}

// Maximal erlaubte Anzahl an Pflicht-Uploads pro Stand (z. B. Zertifikate,
// die vor Freischaltung vorliegen muessen), um Missbrauch/sehr lange Listen
// zu verhindern.
const MAX_REQUIRED_UPLOADS = 10;

function sanitizeRequiredUploads(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_REQUIRED_UPLOADS).map((entry, index) => {
    const label =
      entry && typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim().slice(0, 100)
        : `Datei ${index + 1}`;
    const existingId = entry && typeof entry.id === 'string' && entry.id ? entry.id : id();
    return { id: existingId, label };
  });
}

function listStands() {
  return read().stands.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function getStand(standId) {
  return read().stands.find((s) => s.id === standId) || null;
}

async function createStand(input) {
  const data = read();
  const now = new Date().toISOString();
  const maxOrder = data.stands.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0);
  const stand = {
    id: id(),
    name: input.name || 'Neue Software',
    category: input.category || '',
    tagline: input.tagline || '',
    description: input.description || '',
    procurement: input.procurement || '',
    instructionsUrl: input.instructionsUrl || '',
    instructionsFile: '',
    webhookUrl: input.webhookUrl || '',
    // 'form' = Anforderung per Formular an die IT-Strategie (Standard),
    // 'url' = Verweis auf eine eigene Registrierungsseite des Anbieters.
    requestMode: input.requestMode === 'url' ? 'url' : 'form',
    requestUrl: input.requestUrl || '',
    requiredUploads: sanitizeRequiredUploads(input.requiredUploads),
    color: input.color || '#2f6fed',
    previewScreenshotId: input.previewScreenshotId || '',
    sortOrder: maxOrder + 1,
    screenshots: [],
    createdAt: now,
    updatedAt: now
  };
  data.stands.push(stand);
  await write(data);
  return stand;
}

async function updateStand(standId, input) {
  const data = read();
  const stand = data.stands.find((s) => s.id === standId);
  if (!stand) return null;

  const fields = [
    'name',
    'category',
    'tagline',
    'description',
    'procurement',
    'instructionsUrl',
    'webhookUrl',
    'requestMode',
    'requestUrl',
    'color',
    'previewScreenshotId',
    'sortOrder'
  ];
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(input, f) && input[f] !== undefined) {
      stand[f] = input[f];
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'requiredUploads')) {
    stand.requiredUploads = sanitizeRequiredUploads(input.requiredUploads);
  }
  if (stand.previewScreenshotId && !stand.screenshots.some((s) => s.id === stand.previewScreenshotId)) {
    stand.previewScreenshotId = '';
  }
  if (stand.requestMode !== 'url') stand.requestMode = 'form';
  stand.updatedAt = new Date().toISOString();
  await write(data);
  return stand;
}

// Setzt die Reihenfolge, in der Programme auf der Seite erscheinen (4 pro
// Zeile, automatisch umbrechend) - gesteuert per Drag & Drop in der
// Admin-Standliste, siehe PUT /api/stands/reorder.
async function reorderStands(orderedIds) {
  const data = read();
  orderedIds.forEach((standId, index) => {
    const stand = data.stands.find((s) => s.id === standId);
    if (stand) stand.sortOrder = index + 1;
  });
  await write(data);
  return data.stands.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

async function deleteStand(standId) {
  const data = read();
  const idx = data.stands.findIndex((s) => s.id === standId);
  if (idx === -1) return false;
  const [removed] = data.stands.splice(idx, 1);
  await write(data);
  return removed;
}

async function setInstructionsFile(standId, filename) {
  const data = read();
  const stand = data.stands.find((s) => s.id === standId);
  if (!stand) return null;
  stand.instructionsFile = filename;
  stand.updatedAt = new Date().toISOString();
  await write(data);
  return stand;
}

async function addScreenshot(standId, filename, caption) {
  const data = read();
  const stand = data.stands.find((s) => s.id === standId);
  if (!stand) return null;
  const maxOrder = stand.screenshots.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0);
  const shot = { id: id(), filename, caption: caption || '', sortOrder: maxOrder + 1 };
  stand.screenshots.push(shot);
  stand.updatedAt = new Date().toISOString();
  await write(data);
  return shot;
}

async function deleteScreenshot(standId, screenshotId) {
  const data = read();
  const stand = data.stands.find((s) => s.id === standId);
  if (!stand) return null;
  const idx = stand.screenshots.findIndex((s) => s.id === screenshotId);
  if (idx === -1) return null;
  const [removed] = stand.screenshots.splice(idx, 1);
  if (stand.previewScreenshotId === screenshotId) {
    stand.previewScreenshotId = '';
  }
  stand.updatedAt = new Date().toISOString();
  await write(data);
  return removed;
}

async function reorderScreenshots(standId, orderedIds) {
  const data = read();
  const stand = data.stands.find((s) => s.id === standId);
  if (!stand) return null;
  orderedIds.forEach((shotId, index) => {
    const shot = stand.screenshots.find((s) => s.id === shotId);
    if (shot) shot.sortOrder = index + 1;
  });
  stand.updatedAt = new Date().toISOString();
  await write(data);
  return stand;
}

async function addRequest(entry) {
  const data = read();
  const record = {
    id: id(),
    standId: entry.standId,
    standName: entry.standName,
    requesterName: entry.requesterName || '',
    requesterEmail: entry.requesterEmail || '',
    message: entry.message || '',
    // Nur Label + urspruenglicher Dateiname zur Nachvollziehbarkeit in der
    // Admin-Liste - der Dateiinhalt selbst liegt nur im Webhook-Payload an
    // n8n und auf der Festplatte unter data/anforderungen-uploads, nicht hier.
    uploadedFiles: Array.isArray(entry.uploadedFiles) ? entry.uploadedFiles : [],
    createdAt: new Date().toISOString(),
    webhookStatus: entry.webhookStatus || 'unknown'
  };
  data.requests.unshift(record);
  data.requests = data.requests.slice(0, 500);
  await write(data);
  return record;
}

function listRequests() {
  return read().requests;
}

async function deleteRequests(ids) {
  const data = read();
  const idSet = new Set(ids);
  const before = data.requests.length;
  data.requests = data.requests.filter((r) => !idSet.has(r.id));
  await write(data);
  return before - data.requests.length;
}

async function deleteAllRequests() {
  const data = read();
  const count = data.requests.length;
  data.requests = [];
  await write(data);
  return count;
}

module.exports = {
  listStands,
  getStand,
  createStand,
  updateStand,
  reorderStands,
  deleteStand,
  setInstructionsFile,
  addScreenshot,
  deleteScreenshot,
  reorderScreenshots,
  addRequest,
  listRequests,
  deleteRequests,
  deleteAllRequests
};
