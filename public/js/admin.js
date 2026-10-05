(() => {
  'use strict';

  const loginView = document.getElementById('login-view');
  const adminView = document.getElementById('admin-view');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = {
    stands: document.getElementById('tab-stands'),
    requests: document.getElementById('tab-requests')
  };

  const standListEl = document.getElementById('admin-stand-list');
  const newStandBtn = document.getElementById('new-stand-btn');
  const standForm = document.getElementById('stand-form');
  const formTitle = document.getElementById('form-title');
  const emptyDetail = document.getElementById('empty-detail');
  const mediaSection = document.getElementById('media-section');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const exportAllBtn = document.getElementById('export-all-btn');
  const exportStandBtn = document.getElementById('export-stand-btn');
  const importFileInput = document.getElementById('import-file-input');

  const fName = document.getElementById('f-name');
  const fCategory = document.getElementById('f-category');
  const fTagline = document.getElementById('f-tagline');
  const fDescription = document.getElementById('f-description');
  const fProcurement = document.getElementById('f-procurement');
  const fInstructionsUrl = document.getElementById('f-instructions-url');
  const fWebhook = document.getElementById('f-webhook');
  const fColor = document.getElementById('f-color');
  const fRequestModeForm = document.getElementById('f-request-mode-form');
  const fRequestModeUrl = document.getElementById('f-request-mode-url');
  const fRequestUrlWrap = document.getElementById('f-request-url-wrap');
  const fRequestUrl = document.getElementById('f-request-url');

  function updateRequestUrlVisibility() {
    fRequestUrlWrap.classList.toggle('hidden', !fRequestModeUrl.checked);
  }
  fRequestModeForm.addEventListener('change', updateRequestUrlVisibility);
  fRequestModeUrl.addEventListener('change', updateRequestUrlVisibility);

  // ---------- Erforderliche Uploads (z. B. Zertifikate) ----------
  const requiredUploadsList = document.getElementById('required-uploads-list');
  const addRequiredUploadBtn = document.getElementById('add-required-upload-btn');
  let requiredUploadsState = []; // [{id, label}] - Arbeitskopie waehrend der Bearbeitung

  function renderRequiredUploadsList() {
    requiredUploadsList.innerHTML = '';
    requiredUploadsState.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'required-upload-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `Datei ${index + 1} (z. B. Zertifikat A)`;
      input.value = entry.label || '';
      input.addEventListener('input', () => {
        requiredUploadsState[index].label = input.value;
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        requiredUploadsState.splice(index, 1);
        renderRequiredUploadsList();
      });
      row.appendChild(input);
      row.appendChild(removeBtn);
      requiredUploadsList.appendChild(row);
    });
  }

  // Kein crypto.randomUUID() - das erfordert einen "secure context" (HTTPS/
  // localhost) und waere auf einem reinen HTTP-Deployment im internen Netz
  // nicht verfuegbar. Dient hier nur als clientseitiger Korrelationsschluessel,
  // muss kein echtes UUID-Format haben.
  function tempUploadId() {
    return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  addRequiredUploadBtn.addEventListener('click', () => {
    requiredUploadsState.push({ id: tempUploadId(), label: `Datei ${requiredUploadsState.length + 1}` });
    renderRequiredUploadsList();
  });

  const screenshotGrid = document.getElementById('screenshot-grid');
  const screenshotInput = document.getElementById('screenshot-input');
  const currentInstructionsFile = document.getElementById('current-instructions-file');
  const instructionsFileInput = document.getElementById('instructions-file-input');
  const deleteStandBtn = document.getElementById('delete-stand-btn');

  const requestsTbody = document.getElementById('requests-tbody');
  const requestsStatsList = document.getElementById('requests-stats-list');
  const selectAllRequests = document.getElementById('select-all-requests');
  const deleteSelectedRequestsBtn = document.getElementById('delete-selected-requests-btn');
  const selectedRequestsCount = document.getElementById('selected-requests-count');
  const deleteAllRequestsBtn = document.getElementById('delete-all-requests-btn');
  const toast = document.getElementById('toast');

  let currentRequests = [];
  const selectedRequestIds = new Set();

  let stands = [];
  let editingStand = null; // null = neu / nichts gewaehlt
  let isNewStand = false;
  let dragSourceId = null;

  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  async function api(url, options) {
    const res = await fetch(url, {
      ...options,
      headers: options && options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
        : options?.headers
    });
    if (res.status === 401) {
      showLogin();
      throw new Error('Nicht angemeldet');
    }
    return res;
  }

  // ---------- Auth ----------
  async function checkSession() {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data.isAdmin) {
      showAdmin();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginView.classList.remove('hidden');
    adminView.classList.add('hidden');
  }
  function showAdmin() {
    loginView.classList.add('hidden');
    adminView.classList.remove('hidden');
    loadStands();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword.value })
      });
      if (res.ok) {
        loginPassword.value = '';
        showAdmin();
      } else {
        const data = await res.json();
        loginError.textContent = data.error || 'Anmeldung fehlgeschlagen.';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.textContent = 'Serverfehler.';
      loginError.classList.remove('hidden');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
  });

  // ---------- Tabs ----------
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      Object.values(tabPanels).forEach((p) => p.classList.add('hidden'));
      tabPanels[btn.dataset.tab].classList.remove('hidden');
      if (btn.dataset.tab === 'requests') loadRequests();
    });
  });

  // ---------- Staende laden & Liste (mit Drag & Drop zum Umsortieren) ----------
  async function loadStands() {
    const res = await api('/api/stands');
    stands = await res.json();
    renderStandList();
  }

  function renderStandList() {
    standListEl.innerHTML = '';
    stands.forEach((stand) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.id = stand.id;
      li.innerHTML = `
        <span class="drag-handle" title="Ziehen zum Umsortieren" aria-hidden="true">⠿</span>
        <span class="stand-list-text"><strong>${escapeHtml(stand.name)}</strong><span class="cat">${escapeHtml(stand.category || '')}</span></span>
      `;
      if (editingStand && editingStand.id === stand.id) li.classList.add('active');
      li.addEventListener('click', (e) => {
        if (e.target.closest('.drag-handle')) return;
        selectStand(stand);
      });
      li.addEventListener('dragstart', (e) => {
        dragSourceId = stand.id;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', async (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (!dragSourceId || dragSourceId === stand.id) return;
        const fromIdx = stands.findIndex((s) => s.id === dragSourceId);
        const toIdx = stands.findIndex((s) => s.id === stand.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = stands.splice(fromIdx, 1);
        stands.splice(toIdx, 0, moved);
        dragSourceId = null;
        renderStandList();
        const res = await api('/api/stands/reorder', {
          method: 'PUT',
          body: JSON.stringify({ order: stands.map((s) => s.id) })
        });
        if (!res.ok) {
          showToast('Umsortieren fehlgeschlagen.', true);
          await loadStands();
        }
      });
      standListEl.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ---------- Formular ----------
  function resetForm() {
    fName.value = '';
    fCategory.value = '';
    fTagline.value = '';
    fDescription.value = '';
    fProcurement.value = '';
    fInstructionsUrl.value = '';
    fWebhook.value = '';
    fColor.value = '#2f6fed';
    fRequestModeForm.checked = true;
    fRequestUrl.value = '';
    updateRequestUrlVisibility();
    requiredUploadsState = [];
    renderRequiredUploadsList();
  }

  function selectStand(stand) {
    editingStand = stand;
    isNewStand = false;
    formTitle.textContent = `Programm bearbeiten: ${stand.name}`;
    fName.value = stand.name || '';
    fCategory.value = stand.category || '';
    fTagline.value = stand.tagline || '';
    fDescription.value = stand.description || '';
    fProcurement.value = stand.procurement || '';
    fInstructionsUrl.value = stand.instructionsUrl || '';
    fWebhook.value = stand.webhookUrl || '';
    fColor.value = stand.color || '#2f6fed';
    if (stand.requestMode === 'url') {
      fRequestModeUrl.checked = true;
    } else {
      fRequestModeForm.checked = true;
    }
    fRequestUrl.value = stand.requestUrl || '';
    updateRequestUrlVisibility();
    requiredUploadsState = (stand.requiredUploads || []).map((u) => ({ ...u }));
    renderRequiredUploadsList();

    standForm.classList.remove('hidden');
    mediaSection.classList.remove('hidden');
    emptyDetail.classList.add('hidden');

    renderScreenshots(stand.screenshots || []);
    currentInstructionsFile.textContent = stand.instructionsFile
      ? `Aktuell hinterlegt: ${stand.instructionsFile}`
      : 'Noch keine Datei hochgeladen.';

    renderStandList();
  }

  newStandBtn.addEventListener('click', () => {
    editingStand = null;
    isNewStand = true;
    formTitle.textContent = 'Neues Programm';
    resetForm();
    standForm.classList.remove('hidden');
    mediaSection.classList.add('hidden');
    emptyDetail.classList.add('hidden');
    renderStandList();
  });

  cancelEditBtn.addEventListener('click', () => {
    editingStand = null;
    isNewStand = false;
    standForm.classList.add('hidden');
    mediaSection.classList.add('hidden');
    emptyDetail.classList.remove('hidden');
    renderStandList();
  });

  standForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: fName.value.trim(),
      category: fCategory.value.trim(),
      tagline: fTagline.value.trim(),
      description: fDescription.value.trim(),
      procurement: fProcurement.value.trim(),
      instructionsUrl: fInstructionsUrl.value.trim(),
      webhookUrl: fWebhook.value.trim(),
      requestMode: fRequestModeUrl.checked ? 'url' : 'form',
      requestUrl: fRequestUrl.value.trim(),
      requiredUploads: requiredUploadsState.map((u) => ({ id: u.id, label: (u.label || '').trim() })),
      color: fColor.value
    };
    if (payload.requestMode === 'url' && !payload.requestUrl) {
      showToast('Bitte einen Link zur Registrierungsseite angeben.', true);
      return;
    }
    if (!payload.name) {
      showToast('Bitte einen Namen angeben.', true);
      return;
    }
    try {
      let res;
      if (isNewStand) {
        res = await api('/api/stands', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        res = await api(`/api/stands/${editingStand.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Speichern fehlgeschlagen.', true);
        return;
      }
      const saved = await res.json();
      showToast('Gespeichert.');
      await loadStands();
      selectStand(stands.find((s) => s.id === saved.id) || saved);
    } catch (err) {
      showToast('Speichern fehlgeschlagen.', true);
    }
  });

  deleteStandBtn.addEventListener('click', async () => {
    if (!editingStand) return;
    if (!confirm(`„${editingStand.name}“ wirklich endgültig löschen? Dies entfernt auch alle Screenshots und die Anleitung.`)) return;
    const res = await api(`/api/stands/${editingStand.id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Programm gelöscht.');
      editingStand = null;
      standForm.classList.add('hidden');
      mediaSection.classList.add('hidden');
      emptyDetail.classList.remove('hidden');
      await loadStands();
    } else {
      showToast('Löschen fehlgeschlagen.', true);
    }
  });

  // ---------- Screenshots ----------
  function renderScreenshots(screenshots) {
    screenshotGrid.innerHTML = '';
    const sorted = [...screenshots].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const previewId = (editingStand && editingStand.previewScreenshotId) || '';
    sorted.forEach((shot) => {
      const isPreview = shot.id === previewId;
      const div = document.createElement('div');
      div.className = 'screenshot-item' + (isPreview ? ' is-preview' : '');
      div.innerHTML = `
        <img src="/uploads/screenshots/${shot.filename}" alt="${escapeHtml(shot.caption || '')}" />
        <button class="remove-btn" title="Löschen">✕</button>
        <button type="button" class="preview-btn">${isPreview ? 'Vorschau ✓' : 'Als Vorschau'}</button>
      `;
      div.querySelector('.remove-btn').addEventListener('click', async () => {
        if (!editingStand) return;
        const res = await api(`/api/stands/${editingStand.id}/screenshots/${shot.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Screenshot gelöscht.');
          await refreshCurrentStand();
        } else {
          showToast('Löschen fehlgeschlagen.', true);
        }
      });
      div.querySelector('.preview-btn').addEventListener('click', async () => {
        if (!editingStand) return;
        const nextPreview = isPreview ? '' : shot.id;
        const res = await api(`/api/stands/${editingStand.id}`, {
          method: 'PUT',
          body: JSON.stringify({ previewScreenshotId: nextPreview })
        });
        if (res.ok) {
          showToast(nextPreview ? 'Vorschaubild für das Programm gesetzt.' : 'Vorschaubild entfernt.');
          await refreshCurrentStand();
        } else {
          showToast('Aktion fehlgeschlagen.', true);
        }
      });
      screenshotGrid.appendChild(div);
    });
  }

  screenshotInput.addEventListener('change', async () => {
    if (!editingStand || !screenshotInput.files.length) return;
    const formData = new FormData();
    [...screenshotInput.files].forEach((f) => formData.append('screenshots', f));
    const res = await api(`/api/stands/${editingStand.id}/screenshots`, { method: 'POST', body: formData });
    screenshotInput.value = '';
    if (res.ok) {
      showToast('Screenshots hochgeladen.');
      await refreshCurrentStand();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Upload fehlgeschlagen.', true);
    }
  });

  instructionsFileInput.addEventListener('change', async () => {
    if (!editingStand || !instructionsFileInput.files.length) return;
    const formData = new FormData();
    formData.append('instructions', instructionsFileInput.files[0]);
    const res = await api(`/api/stands/${editingStand.id}/instructions-file`, { method: 'POST', body: formData });
    instructionsFileInput.value = '';
    if (res.ok) {
      showToast('Anleitung hochgeladen.');
      await refreshCurrentStand();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Upload fehlgeschlagen.', true);
    }
  });

  async function refreshCurrentStand() {
    if (!editingStand) return;
    const res = await api(`/api/stands/${editingStand.id}`);
    const updated = await res.json();
    editingStand = updated;
    renderScreenshots(updated.screenshots || []);
    currentInstructionsFile.textContent = updated.instructionsFile
      ? `Aktuell hinterlegt: ${updated.instructionsFile}`
      : 'Noch keine Datei hochgeladen.';
    await loadStands();
    const stillExists = stands.find((s) => s.id === updated.id);
    if (stillExists) editingStand = stillExists;
    renderStandList();
  }

  // ---------- Import / Export ----------
  // Exportiert nur Konfigurationsdaten (keine Screenshots/Anleitungsdateien);
  // Bilder/Dateien muessen nach einem Import ggf. erneut hochgeladen werden.
  function sanitizeStandPayload(s) {
    return {
      name: s.name || 'Importiertes Programm',
      category: s.category || '',
      tagline: s.tagline || '',
      description: s.description || '',
      procurement: s.procurement || '',
      instructionsUrl: s.instructionsUrl || '',
      webhookUrl: s.webhookUrl || '',
      requestMode: s.requestMode === 'url' ? 'url' : 'form',
      requestUrl: s.requestUrl || '',
      requiredUploads: Array.isArray(s.requiredUploads)
        ? s.requiredUploads
            .filter((u) => u && typeof u.label === 'string')
            .map((u) => ({ label: u.label }))
        : [],
      color: s.color || '#2f6fed'
    };
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function slugify(str) {
    return (str || 'programm')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'programm';
  }

  exportStandBtn.addEventListener('click', () => {
    if (!editingStand) return;
    downloadJson(`programm-${slugify(editingStand.name)}.json`, {
      type: 'marketplace-stand',
      version: 1,
      stand: sanitizeStandPayload(editingStand)
    });
  });

  exportAllBtn.addEventListener('click', () => {
    downloadJson('software-marktplatz-export.json', {
      type: 'marketplace-export',
      version: 1,
      stands: stands.map(sanitizeStandPayload)
    });
  });

  // Verhindert unabsichtliche Dubletten beim (wiederholten) Import: ein
  // Programm mit identischem Namen (ohne Gross-/Kleinschreibung) gilt als
  // bereits vorhanden und wird uebersprungen.
  function findStandByName(name) {
    const norm = (name || '').trim().toLowerCase();
    return stands.find((s) => (s.name || '').trim().toLowerCase() === norm);
  }

  async function importSingleStand(standData) {
    const payload = sanitizeStandPayload(standData);
    if (findStandByName(payload.name)) {
      showToast(`„${payload.name}“ existiert bereits – Import übersprungen.`, true);
      return;
    }
    const res = await api('/api/stands', { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) {
      showToast(`„${payload.name}“ importiert.`);
    } else {
      showToast('Import fehlgeschlagen.', true);
      return;
    }
    await loadStands();
  }

  async function importFullExport(data) {
    let standOk = 0;
    let standFail = 0;
    let standSkipped = 0;
    for (const s of data.stands || []) {
      const payload = sanitizeStandPayload(s);
      if (findStandByName(payload.name)) {
        standSkipped++;
        continue;
      }
      const res = await api('/api/stands', { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        standOk++;
        await loadStands(); // Zwischenstand aktualisieren, damit findStandByName() den naechsten Import beruecksichtigt
      } else {
        standFail++;
      }
    }
    const notes = [];
    if (standSkipped) notes.push(`${standSkipped} Programme bereits vorhanden, übersprungen`);
    if (standFail) notes.push(`${standFail} Programme fehlgeschlagen`);
    const failNote = notes.length ? ` (${notes.join('; ')})` : '';
    showToast(`Import abgeschlossen: ${standOk} Programme importiert${failNote}.`, Boolean(standFail || standSkipped));
    await loadStands();
  }

  importFileInput.addEventListener('change', async () => {
    if (!importFileInput.files.length) return;
    const file = importFileInput.files[0];
    importFileInput.value = '';
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      showToast('Ungültige Datei – kein lesbares JSON.', true);
      return;
    }
    if (data && data.type === 'marketplace-stand' && data.stand) {
      await importSingleStand(data.stand);
    } else if (data && data.type === 'marketplace-export') {
      await importFullExport(data);
    } else {
      showToast('Unbekanntes Dateiformat.', true);
    }
  });

  // ---------- Requests Tab ----------
  async function loadRequests() {
    const res = await api('/api/requests');
    currentRequests = await res.json();
    selectedRequestIds.clear();
    renderRequestsStats(currentRequests);
    renderRequestsTable(currentRequests);
    updateSelectedRequestsUI();
  }

  function renderRequestsStats(requests) {
    requestsStatsList.innerHTML = '';
    if (requests.length === 0) {
      requestsStatsList.innerHTML = '<p class="requests-stats-empty">Noch keine Anforderungen eingegangen.</p>';
      return;
    }
    const counts = new Map();
    requests.forEach((r) => {
      const name = r.standName || 'Unbekannt';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = sorted[0][1];
    sorted.forEach(([name, count]) => {
      const row = document.createElement('div');
      row.className = 'requests-stats-row';
      row.innerHTML = `
        <span class="requests-stats-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="requests-stats-track"><span class="requests-stats-bar" style="width:${(count / max) * 100}%"></span></span>
        <span class="requests-stats-count">${count}</span>
      `;
      requestsStatsList.appendChild(row);
    });
  }

  function renderRequestsTable(requests) {
    requestsTbody.innerHTML = '';
    if (requests.length === 0) {
      requestsTbody.innerHTML = '<tr><td colspan="7" class="muted">Noch keine Anforderungen eingegangen.</td></tr>';
      return;
    }
    requests.forEach((r) => {
      const tr = document.createElement('tr');
      const date = new Date(r.createdAt).toLocaleString('de-DE');
      tr.innerHTML = `
        <td class="col-checkbox"><input type="checkbox" class="request-checkbox" data-id="${r.id}" /></td>
        <td>${date}</td>
        <td>${escapeHtml(r.standName)}</td>
        <td>${escapeHtml(r.requesterName || '–')}${r.requesterEmail ? `<br><span class="muted">${escapeHtml(r.requesterEmail)}</span>` : ''}</td>
        <td>${escapeHtml(r.message || '–')}</td>
        <td>${
          Array.isArray(r.uploadedFiles) && r.uploadedFiles.length > 0
            ? r.uploadedFiles.map((u) => escapeHtml(`${u.label}: ${u.filename}`)).join('<br>')
            : '–'
        }</td>
        <td>${escapeHtml(r.webhookStatus || '–')}</td>
      `;
      tr.querySelector('.request-checkbox').addEventListener('change', (e) => {
        if (e.target.checked) selectedRequestIds.add(r.id);
        else selectedRequestIds.delete(r.id);
        updateSelectedRequestsUI();
      });
      requestsTbody.appendChild(tr);
    });
  }

  function updateSelectedRequestsUI() {
    selectedRequestsCount.textContent = String(selectedRequestIds.size);
    deleteSelectedRequestsBtn.disabled = selectedRequestIds.size === 0;
    selectAllRequests.checked = currentRequests.length > 0 && selectedRequestIds.size === currentRequests.length;
    selectAllRequests.indeterminate = selectedRequestIds.size > 0 && selectedRequestIds.size < currentRequests.length;
  }

  selectAllRequests.addEventListener('change', () => {
    selectedRequestIds.clear();
    if (selectAllRequests.checked) {
      currentRequests.forEach((r) => selectedRequestIds.add(r.id));
    }
    requestsTbody.querySelectorAll('.request-checkbox').forEach((cb) => {
      cb.checked = selectedRequestIds.has(cb.dataset.id);
    });
    updateSelectedRequestsUI();
  });

  deleteSelectedRequestsBtn.addEventListener('click', async () => {
    const count = selectedRequestIds.size;
    if (!count) return;
    if (!confirm(`${count} ausgewählte Anforderung(en) wirklich endgültig löschen?`)) return;
    const res = await api('/api/requests', { method: 'DELETE', body: JSON.stringify({ ids: [...selectedRequestIds] }) });
    if (res.ok) {
      showToast('Ausgewählte Anforderungen gelöscht.');
      await loadRequests();
    } else {
      showToast('Löschen fehlgeschlagen.', true);
    }
  });

  deleteAllRequestsBtn.addEventListener('click', async () => {
    if (currentRequests.length === 0) return;
    if (!confirm('Wirklich ALLE eingegangenen Anforderungen endgültig löschen?')) return;
    const res = await api('/api/requests/all', { method: 'DELETE' });
    if (res.ok) {
      showToast('Alle Anforderungen gelöscht.');
      await loadRequests();
    } else {
      showToast('Löschen fehlgeschlagen.', true);
    }
  });

  checkSession();
})();
