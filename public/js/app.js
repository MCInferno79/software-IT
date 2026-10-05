(() => {
  'use strict';

  const programGrid = document.getElementById('program-grid');
  const programEmpty = document.getElementById('program-empty');
  const searchInput = document.getElementById('search-input');

  // Modal elements
  const modal = document.getElementById('stand-modal');
  const modalBackdrop = modal.querySelector('.modal-backdrop');
  const modalClose = document.getElementById('modal-close');
  const modalCategory = document.getElementById('modal-category');
  const modalTitle = document.getElementById('modal-title');
  const modalTagline = document.getElementById('modal-tagline');
  const modalDescription = document.getElementById('modal-description');
  const modalProcurement = document.getElementById('modal-procurement');
  const modalInstructions = document.getElementById('modal-instructions');
  const modalRequestBtn = document.getElementById('modal-request-btn');
  const requestForm = document.getElementById('request-form');
  const reqName = document.getElementById('req-name');
  const reqEmail = document.getElementById('req-email');
  const reqMessage = document.getElementById('req-message');
  const reqUploads = document.getElementById('req-uploads');
  const reqCancel = document.getElementById('req-cancel');
  const reqStatus = document.getElementById('req-status');

  const carouselEl = document.getElementById('carousel');
  const carouselTrack = document.getElementById('carousel-track');
  const carouselDots = document.getElementById('carousel-dots');
  const carouselPrev = document.getElementById('carousel-prev');
  const carouselNext = document.getElementById('carousel-next');
  const carouselEmpty = document.getElementById('carousel-empty');

  const CAROUSEL_INTERVAL_MS = 4500;

  let stands = [];
  let currentStand = null;
  let carouselIndex = 0;
  let carouselTimer = null;
  let searchTerm = '';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ---------- Daten laden & Programm-Kacheln aufbauen ----------
  async function loadStands() {
    try {
      const res = await fetch('/api/stands');
      stands = await res.json();
    } catch (err) {
      stands = [];
    }
    renderGrid();
  }

  function previewScreenshot(stand) {
    const list = stand.screenshots || [];
    if (list.length === 0) return null;
    const sorted = [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (stand.previewScreenshotId) {
      const match = sorted.find((s) => s.id === stand.previewScreenshotId);
      if (match) return match;
    }
    return sorted[0];
  }

  function matchesSearch(stand, term) {
    if (!term) return true;
    const haystack = `${stand.name} ${stand.category || ''} ${stand.tagline || ''}`.toLowerCase();
    return haystack.includes(term);
  }

  function renderGrid() {
    const term = searchTerm.trim().toLowerCase();
    const visible = stands.filter((s) => matchesSearch(s, term));
    programGrid.innerHTML = '';
    programEmpty.classList.toggle('hidden', visible.length > 0);
    visible.forEach((stand) => {
      const card = document.createElement('article');
      card.className = 'program-card';
      card.style.setProperty('--accent', stand.color || '#2f6fed');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${stand.name} ansehen`);

      const shot = previewScreenshot(stand);
      const thumbInner = shot
        ? `<img src="/uploads/screenshots/${shot.filename}" alt="" loading="lazy" />`
        : `<svg viewBox="0 0 24 24" class="icon program-thumb-placeholder"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/></svg>`;

      card.innerHTML = `
        <div class="program-thumb">${thumbInner}</div>
        <div class="program-body">
          ${stand.category ? `<span class="category-badge">${escapeHtml(stand.category)}</span>` : ''}
          <h3>${escapeHtml(stand.name)}</h3>
          <p class="program-tagline">${escapeHtml(stand.tagline || '')}</p>
          <span class="btn btn-secondary program-more">Mehr erfahren</span>
        </div>
      `;
      card.addEventListener('click', () => openModal(stand));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(stand);
        }
      });
      programGrid.appendChild(card);
    });
  }

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    renderGrid();
  });

  // ---------- Modal / Karussell ----------
  function openModal(stand) {
    currentStand = stand;
    modalCategory.textContent = stand.category || 'Software';
    modalTitle.textContent = stand.name;
    modalTagline.textContent = stand.tagline || '';
    modalDescription.textContent = stand.description || 'Noch keine Beschreibung hinterlegt.';
    modalProcurement.textContent = stand.procurement || 'Keine Angaben zur Beschaffung hinterlegt.';

    if (stand.instructionsFile) {
      modalInstructions.href = `/uploads/anleitungen/${stand.instructionsFile}`;
      modalInstructions.classList.remove('hidden');
    } else if (stand.instructionsUrl) {
      modalInstructions.href = stand.instructionsUrl;
      modalInstructions.classList.remove('hidden');
    } else {
      modalInstructions.classList.add('hidden');
    }

    carouselIndex = 0;
    buildCarousel(stand.screenshots || []);

    if (stand.requestMode === 'url' && stand.requestUrl) {
      modalRequestBtn.innerHTML = `<svg viewBox="0 0 24 24" class="icon"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7H3V3h7"/></svg> Zur Registrierung`;
    } else {
      modalRequestBtn.innerHTML = `<svg viewBox="0 0 24 24" class="icon"><path d="M4 4h16v16H4Z"/><path d="m4 5 8 7 8-7"/></svg> Anforderung an IT-Strategie senden`;
    }

    buildUploadFields(stand);
    requestForm.classList.add('hidden');
    requestForm.reset();
    reqStatus.classList.add('hidden');

    modal.classList.remove('hidden');
  }

  // Erforderliche Uploads (z. B. Zertifikate, die vor Freischaltung vorliegen
  // muessen) - gilt unabhaengig vom requestMode des Standes (Formular oder
  // eigene Registrierungsseite), siehe Feldbenennung upload_<requirementId>
  // in server/index.js.
  function buildUploadFields(stand) {
    reqUploads.innerHTML = '';
    const uploads = stand.requiredUploads || [];
    if (uploads.length === 0) return;
    const hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = 'Zusätzlich erforderlich (Voraussetzung für die Freischaltung):';
    reqUploads.appendChild(hint);
    uploads.forEach((u) => {
      const label = document.createElement('label');
      label.textContent = `${u.label} *`;
      const input = document.createElement('input');
      input.type = 'file';
      input.name = `upload_${u.id}`;
      input.accept = '.pdf,.png,.jpg,.jpeg,.webp';
      input.required = true;
      label.appendChild(input);
      reqUploads.appendChild(label);
    });
  }

  function buildCarousel(screenshots) {
    stopCarouselAutoplay();
    carouselTrack.innerHTML = '';
    carouselDots.innerHTML = '';
    const sorted = [...screenshots].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (sorted.length === 0) {
      carouselEmpty.classList.remove('hidden');
      carouselPrev.classList.add('hidden');
      carouselNext.classList.add('hidden');
      return;
    }
    carouselEmpty.classList.add('hidden');
    carouselPrev.classList.toggle('hidden', sorted.length <= 1);
    carouselNext.classList.toggle('hidden', sorted.length <= 1);

    sorted.forEach((shot, i) => {
      const img = document.createElement('img');
      img.src = `/uploads/screenshots/${shot.filename}`;
      img.alt = shot.caption || `Screenshot ${i + 1}`;
      carouselTrack.appendChild(img);

      const dot = document.createElement('span');
      dot.addEventListener('click', () => {
        carouselIndex = i;
        updateCarousel();
        startCarouselAutoplay();
      });
      carouselDots.appendChild(dot);
    });
    updateCarousel();
    startCarouselAutoplay();
  }

  function updateCarousel() {
    carouselTrack.style.transform = `translateX(-${carouselIndex * 100}%)`;
    [...carouselDots.children].forEach((dot, i) => dot.classList.toggle('active', i === carouselIndex));
  }

  function stopCarouselAutoplay() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function startCarouselAutoplay() {
    stopCarouselAutoplay();
    const count = carouselTrack.children.length;
    if (count <= 1) return;
    carouselTimer = setInterval(() => {
      const c = carouselTrack.children.length;
      if (c === 0) return;
      carouselIndex = (carouselIndex + 1) % c;
      updateCarousel();
    }, CAROUSEL_INTERVAL_MS);
  }

  carouselEl.addEventListener('mouseenter', stopCarouselAutoplay);
  carouselEl.addEventListener('mouseleave', startCarouselAutoplay);

  carouselPrev.addEventListener('click', () => {
    const count = carouselTrack.children.length;
    if (count === 0) return;
    carouselIndex = (carouselIndex - 1 + count) % count;
    updateCarousel();
    startCarouselAutoplay();
  });
  carouselNext.addEventListener('click', () => {
    const count = carouselTrack.children.length;
    if (count === 0) return;
    carouselIndex = (carouselIndex + 1) % count;
    updateCarousel();
    startCarouselAutoplay();
  });

  function closeModal() {
    modal.classList.add('hidden');
    stopCarouselAutoplay();
    currentStand = null;
  }
  modalClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });

  // ---------- Anforderungsformular (alle Felder Pflicht) ----------
  modalRequestBtn.addEventListener('click', () => {
    const needsUploads = currentStand && (currentStand.requiredUploads || []).length > 0;
    if (currentStand && currentStand.requestMode === 'url' && currentStand.requestUrl) {
      window.open(currentStand.requestUrl, '_blank', 'noopener');
      // Bei einer eigenen Registrierungsseite werden nur dann zusaetzlich
      // Name/E-Mail/Uploads abgefragt, wenn der Stand Pflicht-Uploads hat
      // (z. B. Zertifikate) - sonst bleibt es wie bisher beim reinen Link.
      if (!needsUploads) return;
    }
    requestForm.classList.remove('hidden');
    reqStatus.classList.add('hidden');
    requestForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  reqCancel.addEventListener('click', () => {
    requestForm.classList.add('hidden');
  });
  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentStand) return;
    if (!requestForm.checkValidity()) {
      requestForm.reportValidity();
      return;
    }
    const submitBtn = requestForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    reqStatus.classList.add('hidden');
    try {
      const formData = new FormData();
      formData.append('requesterName', reqName.value.trim());
      formData.append('requesterEmail', reqEmail.value.trim());
      formData.append('message', reqMessage.value.trim());
      (currentStand.requiredUploads || []).forEach((u) => {
        const input = reqUploads.querySelector(`input[name="upload_${u.id}"]`);
        if (input && input.files[0]) formData.append(`upload_${u.id}`, input.files[0]);
      });
      const res = await fetch(`/api/stands/${currentStand.id}/request`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        reqStatus.textContent = data.webhookConfigured
          ? 'Danke! Ihre Anforderung wurde an die IT-Strategie gesendet.'
          : 'Danke! Ihre Anforderung wurde gespeichert (kein Webhook konfiguriert).';
        reqStatus.className = 'req-status ok';
        setTimeout(() => requestForm.classList.add('hidden'), 1800);
      } else {
        reqStatus.textContent = data.error || 'Senden fehlgeschlagen. Bitte später erneut versuchen.';
        reqStatus.className = 'req-status error';
      }
    } catch (err) {
      reqStatus.textContent = 'Senden fehlgeschlagen. Bitte später erneut versuchen.';
      reqStatus.className = 'req-status error';
    }
    reqStatus.classList.remove('hidden');
    submitBtn.disabled = false;
  });

  loadStands();
})();
