/**
 * Honjin - PDF Toolkit
 * Single self-contained bundle for zero-build & file:// compatibility.
 */

// Configure PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ==========================================================================
   1. PDF Engine Helpers
   ========================================================================== */
const PDFEngine = {
  async readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  },

  async readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as DataURL'));
      reader.readAsDataURL(file);
    });
  },

  async loadPDFLibDoc(bytes) {
    if (!window.PDFLib) throw new Error('PDFLib library not loaded');
    let buffer;
    if (bytes instanceof ArrayBuffer) {
      buffer = bytes.slice(0);
    } else if (ArrayBuffer.isView(bytes)) {
      buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } else {
      buffer = bytes;
    }
    return await window.PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
  },

  async loadPDFJSDoc(bytes) {
    if (!window.pdfjsLib) throw new Error('PDF.js library not loaded');
    let data;
    if (bytes instanceof ArrayBuffer) {
      data = new Uint8Array(bytes.slice(0));
    } else if (ArrayBuffer.isView(bytes)) {
      data = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } else {
      data = bytes;
    }
    const loadingTask = window.pdfjsLib.getDocument({ data });
    return await loadingTask.promise;
  },

  async renderPageToCanvas(pdfDoc, pageNumber, canvas, scale = 1.0) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext('2d');

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    const renderContext = {
      canvasContext: ctx,
      transform: transform,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    return canvas;
  },

  downloadBlob(data, filename, mimeType = 'application/pdf') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  parsePageRange(rangeStr, maxPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let i = from; i <= to; i++) {
            pages.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= maxPages) {
          pages.add(num);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }
};

/* ==========================================================================
   2. UI Controller Helpers
   ========================================================================== */
const UI = {
  dialog: null,
  dialogTitle: null,
  dialogDesc: null,
  dialogIcon: null,
  dialogBody: null,
  toastContainer: null,

  init() {
    this.dialog = document.getElementById('tool-dialog');
    this.dialogTitle = document.getElementById('dialog-title');
    this.dialogDesc = document.getElementById('dialog-desc');
    this.dialogIcon = document.getElementById('dialog-icon');
    this.dialogBody = document.getElementById('dialog-body');
    this.toastContainer = document.getElementById('toast-container');

    const closeBtn = document.getElementById('dialog-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDialog());
    }

    if (this.dialog) {
      this.dialog.addEventListener('click', (e) => {
        const rect = this.dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          this.closeDialog();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dialog && this.dialog.open) {
        this.closeDialog();
      }
    });
  },

  openDialog({ title, desc, iconSvg, renderContent }) {
    if (!this.dialog) this.init();

    this.dialogTitle.textContent = title;
    this.dialogDesc.textContent = desc;
    this.dialogIcon.innerHTML = iconSvg;
    this.dialogBody.innerHTML = '';

    renderContent(this.dialogBody);

    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute('open', '');
    }
  },

  closeDialog() {
    if (this.dialog) {
      if (typeof this.dialog.close === 'function') {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
      }
      this.dialogBody.innerHTML = '';
    }
  },

  toast(message, type = 'info', duration = 3500) {
    if (!this.toastContainer) this.init();

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    toastEl.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-msg">${message}</span>
    `;

    this.toastContainer.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.transition = 'opacity 200ms ease, transform 200ms ease';
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(8px)';
      setTimeout(() => toastEl.remove(), 250);
    }, duration);
  },

  createDropzone({ accept = '.pdf', multiple = false, title = 'Drop files here', desc = 'or click to browse from device', onFiles }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dropzone';
    wrapper.innerHTML = `
      <div class="dropzone-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div>
        <div class="dropzone-title">${title}</div>
        <div class="dropzone-desc">${desc}</div>
      </div>
      <input type="file" class="dropzone-input" accept="${accept}" ${multiple ? 'multiple' : ''}>
    `;

    const input = wrapper.querySelector('.dropzone-input');

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(Array.from(e.target.files));
      }
    });

    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      wrapper.classList.add('drag-over');
    });

    wrapper.addEventListener('dragleave', () => {
      wrapper.classList.remove('drag-over');
    });

    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFiles(Array.from(e.dataTransfer.files));
      }
    });

    return wrapper;
  },

  setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
    if (isLoading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> <span>${loadingText}</span>`;
      btn.disabled = true;
    } else {
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
      }
      btn.disabled = false;
    }
  }
};

/* ==========================================================================
   3. Tool Handlers
   ========================================================================== */

// 1. Organize Pages
function renderOrganizeTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  let pagesState = [];

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="organizer-workspace" style="display:none;">
      <div class="page-organizer-toolbar">
        <div class="organizer-info">
          <strong id="page-count-badge">0 pages</strong>
          <span>• Drag pages to reorder, rotate, or remove</span>
        </div>
        <div class="organizer-quick-actions">
          <button id="btn-rotate-all" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">
            ⟳ Rotate All 90°
          </button>
          <button id="btn-reset-pages" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">
            Reset
          </button>
        </div>
      </div>
      <div id="visual-grid" class="visual-page-grid"></div>
      <div class="action-bar">
        <button id="btn-change-doc" class="btn-secondary">Choose another PDF</button>
        <button id="btn-save-organized" class="btn-primary">Save & Download PDF</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#organizer-workspace');
  const grid = container.querySelector('#visual-grid');
  const pageCountBadge = container.querySelector('#page-count-badge');
  const rotateAllBtn = container.querySelector('#btn-rotate-all');
  const resetBtn = container.querySelector('#btn-reset-pages');
  const saveBtn = container.querySelector('#btn-save-organized');
  const changeDocBtn = container.querySelector('#btn-change-doc');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to organize visually',
    desc: 'See live page thumbnails, drag to reorder, rotate or remove pages',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        await initPages();
        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load document: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeDocBtn.addEventListener('click', () => {
    pdfBytes = null;
    pdfJsDoc = null;
    pagesState = [];
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  async function initPages() {
    const numPages = pdfJsDoc.numPages;
    pagesState = [];
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--ink-muted);">
        <span class="spinner" style="display:inline-block; border-color: var(--border-strong); border-top-color: var(--hanko-red);"></span>
        <p style="margin-top:0.75rem;">Rendering page thumbnails...</p>
      </div>
    `;

    for (let i = 1; i <= numPages; i++) {
      const canvas = document.createElement('canvas');
      await PDFEngine.renderPageToCanvas(pdfJsDoc, i, canvas, 0.35);
      pagesState.push({
        originalIndex: i - 1,
        rotation: 0,
        canvas: canvas
      });
    }
    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    pageCountBadge.textContent = `${pagesState.length} page${pagesState.length === 1 ? '' : 's'}`;

    if (pagesState.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--ink-muted);">
          All pages have been removed. Click "Reset" to restore.
        </div>
      `;
      saveBtn.disabled = true;
      return;
    }

    saveBtn.disabled = false;

    pagesState.forEach((page, index) => {
      const card = document.createElement('div');
      card.className = 'page-thumb-card';
      card.draggable = true;
      card.dataset.index = index;

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'page-canvas-wrapper';

      const displayCanvas = document.createElement('canvas');
      displayCanvas.className = 'page-thumb-canvas';
      displayCanvas.width = page.canvas.width;
      displayCanvas.height = page.canvas.height;
      displayCanvas.style.transform = `rotate(${page.rotation}deg)`;
      const ctx = displayCanvas.getContext('2d');
      ctx.drawImage(page.canvas, 0, 0);

      canvasWrapper.appendChild(displayCanvas);
      card.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'page-thumb-footer';
      footer.innerHTML = `
        <span class="page-number-tag">${index + 1}</span>
        <div class="page-thumb-controls">
          <button class="btn-thumb-action rotate-btn ${page.rotation > 0 ? 'is-rotated' : ''}" title="Rotate 90° Clockwise">⟳</button>
          <button class="btn-thumb-action delete delete-btn" title="Remove page">✕</button>
        </div>
      `;
      card.appendChild(footer);

      const rotateBtn = footer.querySelector('.rotate-btn');
      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        page.rotation = (page.rotation + 90) % 360;
        displayCanvas.style.transform = `rotate(${page.rotation}deg)`;
        rotateBtn.classList.toggle('is-rotated', page.rotation > 0);
      });

      footer.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        pagesState.splice(index, 1);
        renderGrid();
      });

      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', index);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        grid.querySelectorAll('.page-thumb-card').forEach(c => c.classList.remove('drag-target'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-target');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-target');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-target');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = index;
        if (fromIndex !== toIndex && !isNaN(fromIndex)) {
          const moved = pagesState.splice(fromIndex, 1)[0];
          pagesState.splice(toIndex, 0, moved);
          renderGrid();
        }
      });

      grid.appendChild(card);
    });
  }

  rotateAllBtn.addEventListener('click', () => {
    pagesState.forEach(p => { p.rotation = (p.rotation + 90) % 360; });
    renderGrid();
  });

  resetBtn.addEventListener('click', () => { initPages(); });

  saveBtn.addEventListener('click', async () => {
    if (pagesState.length === 0) return;
    try {
      UI.setButtonLoading(saveBtn, true, 'Building PDF...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const sourcePdf = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const newPdf = await window.PDFLib.PDFDocument.create();

      const indicesToCopy = pagesState.map(p => p.originalIndex);
      const copiedPages = await newPdf.copyPages(sourcePdf, indicesToCopy);

      copiedPages.forEach((page, i) => {
        const rotationToAdd = pagesState[i].rotation;
        if (rotationToAdd !== 0) {
          const currentRot = page.getRotation().angle;
          page.setRotation(window.PDFLib.degrees((currentRot + rotationToAdd) % 360));
        }
        newPdf.addPage(page);
      });

      const savedBytes = await newPdf.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(savedBytes, `${baseName}-organized.pdf`);
      UI.toast('Document reorganized and saved!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Error saving PDF: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(saveBtn, false);
    }
  });
}

// 2. Sign PDF
function renderSignTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfDoc = null;
  let totalPages = 1;
  let originalFilename = '';

  let inkColor = '#111827';
  let penWidth = 3;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let hasDrawn = false;
  let activeTab = 'draw';

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="sign-workspace" style="display:none;" class="sign-workspace">
      <div class="sign-tabs">
        <button class="sign-tab-btn active" data-tab="draw">Draw Signature</button>
        <button class="sign-tab-btn" data-tab="type">Type Signature</button>
      </div>
      <div id="draw-tab-content">
        <div class="signature-canvas-box">
          <canvas id="sig-canvas" class="signature-canvas"></canvas>
          <div class="canvas-baseline"></div>
        </div>
        <div class="sign-tools-row" style="margin-top: 0.75rem;">
          <div class="ink-color-picker">
            <span class="file-meta" style="font-weight:600;">Ink:</span>
            <div class="ink-swatch active" data-color="#111827" style="background:#111827;" title="Classic Black"></div>
            <div class="ink-swatch" data-color="#1d4ed8" style="background:#1d4ed8;" title="Navy Blue"></div>
            <div class="ink-swatch" data-color="#dc2626" style="background:#dc2626;" title="Crimson Red"></div>
            <div class="ink-swatch" data-color="#15803d" style="background:#15803d;" title="Forest Green"></div>
            <div class="ink-swatch" data-color="#7e22ce" style="background:#7e22ce;" title="Deep Violet"></div>
            <div class="ink-swatch" data-color="#4b5563" style="background:#4b5563;" title="Graphite Slate"></div>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <select id="pen-width-select" class="option-select" style="height:2rem; padding:0 0.5rem; font-size:0.8rem;">
              <option value="2">Fine (2px)</option>
              <option value="3.5" selected>Medium (3.5px)</option>
              <option value="5.5">Bold (5.5px)</option>
            </select>
            <button id="btn-clear-sig" class="btn-subtle" style="margin:0; font-size:0.8rem; padding: 0.35rem 0.8rem;">
              Clear Pad
            </button>
          </div>
        </div>
      </div>
      <div id="type-tab-content" style="display:none;">
        <div class="signature-canvas-box">
          <canvas id="type-canvas" width="450" height="190" style="width:100%; height:190px;"></canvas>
        </div>
        <div class="option-group" style="margin-top:0.75rem;">
          <label class="option-label" for="type-name-input">Your Full Name or Signature</label>
          <input type="text" id="type-name-input" class="option-input" value="Jane Doe" placeholder="Type your name...">
        </div>
      </div>
      <div class="tool-options-panel">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="option-group">
            <label class="option-label" for="target-page-select">Apply to Page</label>
            <select id="target-page-select" class="option-select">
              <option value="last">Last Page</option>
              <option value="first">First Page</option>
              <option value="all">All Pages</option>
            </select>
          </div>
          <div class="option-group">
            <label class="option-label" for="sig-position-select">Position</label>
            <select id="sig-position-select" class="option-select">
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-center">Bottom Center</option>
              <option value="top-right">Top Right</option>
              <option value="center">Center</option>
            </select>
          </div>
        </div>
      </div>
      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-apply-sig" class="btn-primary">Sign & Download PDF</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#sign-workspace');
  const tabs = container.querySelectorAll('.sign-tab-btn');
  const drawTabContent = container.querySelector('#draw-tab-content');
  const typeTabContent = container.querySelector('#type-tab-content');
  const canvas = container.querySelector('#sig-canvas');
  const typeCanvas = container.querySelector('#type-canvas');
  const typeInput = container.querySelector('#type-name-input');
  const clearBtn = container.querySelector('#btn-clear-sig');
  const penWidthSelect = container.querySelector('#pen-width-select');
  const inkSwatches = container.querySelectorAll('.ink-swatch');
  const pageSelect = container.querySelector('#target-page-select');
  const posSelect = container.querySelector('#sig-position-select');
  const applyBtn = container.querySelector('#btn-apply-sig');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const ctx = canvas.getContext('2d');
  const typeCtx = typeCanvas.getContext('2d');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to sign',
    desc: 'Draw or type your signature to securely sign your document',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfDoc = await PDFEngine.loadPDFLibDoc(pdfBytes);
        totalPages = pdfDoc.getPageCount();

        pageSelect.innerHTML = `
          <option value="last">Last Page (Page ${totalPages})</option>
          <option value="first">First Page (Page 1)</option>
          <option value="all">All Pages (${totalPages} pages)</option>
        `;
        for (let i = 1; i <= totalPages; i++) {
          pageSelect.innerHTML += `<option value="${i}">Page ${i}</option>`;
        }

        dropArea.style.display = 'none';
        workspace.style.display = 'flex';
        initCanvas();
        renderTypedSignature();
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load PDF: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      if (activeTab === 'draw') {
        drawTabContent.style.display = 'block';
        typeTabContent.style.display = 'none';
        initCanvas();
      } else {
        drawTabContent.style.display = 'none';
        typeTabContent.style.display = 'block';
        renderTypedSignature();
      }
    });
  });

  function initCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = penWidth;
  }

  penWidthSelect?.addEventListener('change', (e) => {
    penWidth = parseFloat(e.target.value) || 3;
    ctx.lineWidth = penWidth;
  });

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e) {
    isDrawing = true;
    hasDrawn = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
  }

  function stopDraw() { isDrawing = false; }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);

  clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
  });

  inkSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      inkSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      inkColor = swatch.dataset.color;
      ctx.strokeStyle = inkColor;
      renderTypedSignature();
    });
  });

  function renderTypedSignature() {
    const name = typeInput.value.trim() || 'Signature';
    const w = typeCanvas.width;
    const h = typeCanvas.height;
    typeCtx.clearRect(0, 0, w, h);
    typeCtx.fillStyle = inkColor;
    typeCtx.font = 'italic 46px "Newsreader", "Times New Roman", cursive, serif';
    typeCtx.textAlign = 'center';
    typeCtx.textBaseline = 'middle';
    typeCtx.fillText(name, w / 2, h / 2);

    typeCtx.strokeStyle = inkColor;
    typeCtx.lineWidth = 1.5;
    typeCtx.beginPath();
    typeCtx.moveTo(w * 0.2, h * 0.72);
    typeCtx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.8, h * 0.7);
    typeCtx.stroke();
  }

  typeInput.addEventListener('input', renderTypedSignature);

  applyBtn.addEventListener('click', async () => {
    let sourceCanvas = activeTab === 'draw' ? canvas : typeCanvas;
    if (activeTab === 'draw' && !hasDrawn) {
      UI.toast('Please draw your signature first.', 'error');
      return;
    }

    try {
      UI.setButtonLoading(applyBtn, true, 'Applying signature...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const targetDoc = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const pngDataUrl = sourceCanvas.toDataURL('image/png');
      const pngBytes = await fetch(pngDataUrl).then(res => res.arrayBuffer());
      const embeddedImage = await targetDoc.embedPng(pngBytes);

      const targetVal = pageSelect.value;
      let targetPageIndices = [];
      if (targetVal === 'all') {
        targetPageIndices = Array.from({ length: totalPages }, (_, i) => i);
      } else if (targetVal === 'first') {
        targetPageIndices = [0];
      } else if (targetVal === 'last') {
        targetPageIndices = [totalPages - 1];
      } else {
        targetPageIndices = [parseInt(targetVal, 10) - 1];
      }

      const imgWidth = 160;
      const imgHeight = (imgWidth / sourceCanvas.width) * sourceCanvas.height;
      const margin = 36;

      targetPageIndices.forEach(pIdx => {
        const page = targetDoc.getPage(pIdx);
        const { width: pWidth, height: pHeight } = page.getSize();
        let x = pWidth - imgWidth - margin;
        let y = margin;

        const pos = posSelect.value;
        if (pos === 'bottom-left') { x = margin; y = margin; }
        else if (pos === 'bottom-center') { x = (pWidth - imgWidth) / 2; y = margin; }
        else if (pos === 'top-right') { x = pWidth - imgWidth - margin; y = pHeight - imgHeight - margin; }
        else if (pos === 'center') { x = (pWidth - imgWidth) / 2; y = (pHeight - imgHeight) / 2; }

        page.drawImage(embeddedImage, { x, y, width: imgWidth, height: imgHeight });
      });

      const signedBytes = await targetDoc.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(signedBytes, `${baseName}-signed.pdf`);
      UI.toast('Document signed successfully!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to sign document: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(applyBtn, false);
    }
  });
}

// 3. Merge PDF
function renderMergeTool(container) {
  let files = [];
  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="file-list-container" class="file-list-wrap" style="display:none;"></div>
    <div id="options-panel" class="tool-options-panel" style="display:none;">
      <div class="option-group">
        <label class="option-label" for="merge-filename">Output Filename</label>
        <input type="text" id="merge-filename" class="option-input" value="merged-document.pdf">
      </div>
    </div>
    <div class="action-bar" style="display:none;" id="action-bar">
      <span class="organizer-info" id="file-count-info">0 files ready</span>
      <button id="btn-merge-exec" class="btn-primary">Merge PDFs</button>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const listContainer = container.querySelector('#file-list-container');
  const optionsPanel = container.querySelector('#options-panel');
  const actionBar = container.querySelector('#action-bar');
  const countInfo = container.querySelector('#file-count-info');
  const mergeBtn = container.querySelector('#btn-merge-exec');
  const filenameInput = container.querySelector('#merge-filename');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: true,
    title: 'Drop multiple PDFs here',
    desc: 'Select 2 or more PDF documents to combine in order',
    onFiles: (newFiles) => {
      const pdfs = newFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length === 0) {
        UI.toast('Please select valid PDF documents.', 'error');
        return;
      }
      files = [...files, ...pdfs];
      renderList();
    }
  });
  dropArea.appendChild(dropzone);

  function renderList() {
    if (files.length === 0) {
      listContainer.style.display = 'none';
      optionsPanel.style.display = 'none';
      actionBar.style.display = 'none';
      return;
    }
    listContainer.style.display = 'flex';
    optionsPanel.style.display = 'flex';
    actionBar.style.display = 'flex';
    countInfo.textContent = `${files.length} document${files.length > 1 ? 's' : ''} loaded`;

    listContainer.innerHTML = files.map((file, idx) => `
      <div class="file-item" data-index="${idx}">
        <div class="file-info">
          <div class="file-badge-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div>
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">${PDFEngine.formatBytes(file.size)}</div>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn-mini btn-move-up" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
          <button class="btn-mini btn-move-down" ${idx === files.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
          <button class="btn-mini btn-remove" title="Remove">✕</button>
        </div>
      </div>
    `).join('');

    listContainer.querySelectorAll('.file-item').forEach(item => {
      const idx = parseInt(item.dataset.index, 10);
      item.querySelector('.btn-move-up')?.addEventListener('click', () => {
        if (idx > 0) {
          const temp = files[idx];
          files[idx] = files[idx - 1];
          files[idx - 1] = temp;
          renderList();
        }
      });
      item.querySelector('.btn-move-down')?.addEventListener('click', () => {
        if (idx < files.length - 1) {
          const temp = files[idx];
          files[idx] = files[idx + 1];
          files[idx + 1] = temp;
          renderList();
        }
      });
      item.querySelector('.btn-remove')?.addEventListener('click', () => {
        files.splice(idx, 1);
        renderList();
      });
    });
  }

  mergeBtn.addEventListener('click', async () => {
    if (files.length < 2) {
      UI.toast('Please add at least 2 PDF files to merge.', 'error');
      return;
    }
    try {
      UI.setButtonLoading(mergeBtn, true, 'Merging documents...');
      const mergedPdf = await window.PDFLib.PDFDocument.create();
      for (const file of files) {
        const fileBuffer = await PDFEngine.readFileAsArrayBuffer(file);
        const donorPdf = await PDFEngine.loadPDFLibDoc(fileBuffer);
        const donorPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
        donorPages.forEach(p => mergedPdf.addPage(p));
      }
      const mergedBytes = await mergedPdf.save();
      const outputName = filenameInput.value.trim() || 'merged-document.pdf';
      PDFEngine.downloadBlob(mergedBytes, outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`);
      UI.toast('PDFs merged successfully!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to merge PDFs: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(mergeBtn, false);
    }
  });
}

// 4. Split PDF (Visualized)
function renderSplitTool(container) {
  let currentFile = null;
  let totalPages = 0;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let activeMode = 'selected';
  let pagesState = [];

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="split-workspace" style="display:none;">
      <div class="page-organizer-toolbar">
        <div class="organizer-info">
          <strong id="split-count-badge">0 pages</strong>
          <span id="split-instruction">• Click thumbnails to select pages to extract</span>
        </div>
        <div class="organizer-quick-actions" id="split-quick-actions">
          <button id="btn-split-all" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Select All</button>
          <button id="btn-split-none" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Clear</button>
          <button id="btn-split-odd" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Odd</button>
          <button id="btn-split-even" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Even</button>
        </div>
      </div>

      <div id="split-visual-grid" class="visual-page-grid"></div>

      <div class="tool-options-panel" style="margin-top:1rem;">
        <div class="option-group">
          <label class="option-label">Extraction Mode</label>
          <div class="radio-pill-group" id="split-mode-group">
            <button class="radio-pill-btn active" data-mode="selected">Extract Selected Pages into Single PDF</button>
            <button class="radio-pill-btn" data-mode="zip">Split All Pages into ZIP Archive</button>
          </div>
        </div>
        <div class="option-group">
          <label class="option-label" for="split-filename">Output Filename</label>
          <input type="text" id="split-filename" class="option-input" value="extracted-document.pdf">
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-split-exec" class="btn-primary">Extract & Download</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#split-workspace');
  const grid = container.querySelector('#split-visual-grid');
  const countBadge = container.querySelector('#split-count-badge');
  const instruction = container.querySelector('#split-instruction');
  const quickActions = container.querySelector('#split-quick-actions');
  const modeGroup = container.querySelector('#split-mode-group');
  const filenameInput = container.querySelector('#split-filename');
  const execBtn = container.querySelector('#btn-split-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to split',
    desc: 'Visually select pages to extract or split entire document into a ZIP',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        totalPages = pdfJsDoc.numPages;

        const baseName = file.name.replace(/\.[^/.]+$/, '');
        filenameInput.value = `${baseName}-extracted.pdf`;

        await initPages();
        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load PDF: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pdfJsDoc = null;
    pagesState = [];
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  async function initPages() {
    pagesState = [];
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--ink-muted);">
        <span class="spinner" style="display:inline-block; border-color: var(--border-strong); border-top-color: var(--hanko-red);"></span>
        <p style="margin-top:0.75rem;">Rendering page thumbnails...</p>
      </div>
    `;

    for (let i = 1; i <= totalPages; i++) {
      const canvas = document.createElement('canvas');
      await PDFEngine.renderPageToCanvas(pdfJsDoc, i, canvas, 0.35);
      pagesState.push({
        pageNum: i,
        selected: i === 1,
        canvas: canvas
      });
    }

    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    const selectedCount = pagesState.filter(p => p.selected).length;
    countBadge.textContent = `${selectedCount} of ${totalPages} selected`;

    pagesState.forEach(page => {
      const card = document.createElement('div');
      card.className = `page-thumb-card selectable ${page.selected ? 'selected-extract' : ''}`;
      card.title = `Click to ${page.selected ? 'deselect' : 'select'} page ${page.pageNum}`;

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'page-canvas-wrapper';
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = page.canvas.width;
      displayCanvas.height = page.canvas.height;
      displayCanvas.getContext('2d').drawImage(page.canvas, 0, 0);
      canvasWrapper.appendChild(displayCanvas);
      card.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'page-thumb-footer';
      footer.innerHTML = `<span class="page-number-tag">Page ${page.pageNum}</span>`;
      card.appendChild(footer);

      card.addEventListener('click', () => {
        if (activeMode === 'selected') {
          page.selected = !page.selected;
          renderGrid();
        }
      });

      grid.appendChild(card);
    });

    if (activeMode === 'selected') {
      execBtn.disabled = selectedCount === 0;
      execBtn.textContent = `Extract ${selectedCount} Page${selectedCount === 1 ? '' : 's'}`;
    }
  }

  container.querySelector('#btn-split-all')?.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = true);
    renderGrid();
  });
  container.querySelector('#btn-split-none')?.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = false);
    renderGrid();
  });
  container.querySelector('#btn-split-odd')?.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = (p.pageNum % 2 !== 0));
    renderGrid();
  });
  container.querySelector('#btn-split-even')?.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = (p.pageNum % 2 === 0));
    renderGrid();
  });

  modeGroup.querySelectorAll('.radio-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modeGroup.querySelectorAll('.radio-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.dataset.mode;
      const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'document';

      if (activeMode === 'selected') {
        quickActions.style.display = 'flex';
        instruction.textContent = '• Click thumbnails to select pages to extract';
        filenameInput.value = `${baseName}-extracted.pdf`;
        renderGrid();
      } else {
        quickActions.style.display = 'none';
        instruction.textContent = '• All pages will be packaged into a zip archive';
        filenameInput.value = `${baseName}-pages.zip`;
        execBtn.disabled = false;
        execBtn.textContent = `Split All ${totalPages} Pages (ZIP)`;
      }
    });
  });

  execBtn.addEventListener('click', async () => {
    try {
      UI.setButtonLoading(execBtn, true, 'Splitting...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const sourceDoc = await PDFEngine.loadPDFLibDoc(freshBuffer);

      if (activeMode === 'selected') {
        const selectedPageIndices = pagesState.filter(p => p.selected).map(p => p.pageNum - 1);
        if (selectedPageIndices.length === 0) {
          UI.toast('Please select at least one page to extract.', 'error');
          UI.setButtonLoading(execBtn, false);
          return;
        }

        const newDoc = await window.PDFLib.PDFDocument.create();
        const copiedPages = await newDoc.copyPages(sourceDoc, selectedPageIndices);
        copiedPages.forEach(p => newDoc.addPage(p));

        const savedBytes = await newDoc.save();
        const outName = filenameInput.value.trim() || 'split-document.pdf';
        PDFEngine.downloadBlob(savedBytes, outName.endsWith('.pdf') ? outName : `${outName}.pdf`);
        UI.toast(`Extracted ${selectedPageIndices.length} pages successfully!`, 'success');
        UI.closeDialog();
      } else {
        if (!window.JSZip) throw new Error('JSZip library not available');
        const zip = new window.JSZip();
        const baseName = currentFile.name.replace(/\.[^/.]+$/, '');

        for (let i = 0; i < totalPages; i++) {
          const singleDoc = await window.PDFLib.PDFDocument.create();
          const [copiedPage] = await singleDoc.copyPages(sourceDoc, [i]);
          singleDoc.addPage(copiedPage);
          const singleBytes = await singleDoc.save();
          const pageNumStr = String(i + 1).padStart(2, '0');
          zip.file(`${baseName}-page-${pageNumStr}.pdf`, singleBytes);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const outZipName = filenameInput.value.trim() || `${baseName}-pages.zip`;
        PDFEngine.downloadBlob(zipBlob, outZipName.endsWith('.zip') ? outZipName : `${outZipName}.zip`, 'application/zip');
        UI.toast(`Split all ${totalPages} pages into ZIP archive!`, 'success');
        UI.closeDialog();
      }
    } catch (err) {
      console.error(err);
      UI.toast('Error splitting PDF: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(execBtn, false);
    }
  });
}

// 5. Images to PDF
function renderImagesToPdfTool(container) {
  let imageFiles = [];
  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="image-list-container" class="file-list-wrap" style="display:none; gap: 0.625rem;"></div>
    <div id="options-panel" class="tool-options-panel" style="display:none;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="option-group">
          <label class="option-label" for="page-size-select">Page Size</label>
          <select id="page-size-select" class="option-select">
            <option value="a4">A4 (Standard)</option>
            <option value="letter">Letter</option>
            <option value="fit">Fit to Image Size</option>
          </select>
        </div>
        <div class="option-group">
          <label class="option-label" for="margin-select">Margin</label>
          <select id="margin-select" class="option-select">
            <option value="none">None (0pt)</option>
            <option value="normal" selected>Normal (36pt / 0.5")</option>
            <option value="large">Large (72pt / 1")</option>
          </select>
        </div>
      </div>
      <div class="option-group">
        <label class="option-label" for="out-filename">Output Filename</label>
        <input type="text" id="out-filename" class="option-input" value="images-converted.pdf">
      </div>
    </div>
    <div class="action-bar" style="display:none;" id="action-bar">
      <span class="organizer-info" id="img-count-info">0 images ready</span>
      <button id="btn-convert-exec" class="btn-primary">Create PDF</button>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const listContainer = container.querySelector('#image-list-container');
  const optionsPanel = container.querySelector('#options-panel');
  const actionBar = container.querySelector('#action-bar');
  const countInfo = container.querySelector('#img-count-info');
  const pageSizeSelect = container.querySelector('#page-size-select');
  const marginSelect = container.querySelector('#margin-select');
  const filenameInput = container.querySelector('#out-filename');
  const convertBtn = container.querySelector('#btn-convert-exec');

  const dropzone = UI.createDropzone({
    accept: 'image/png,image/jpeg,image/webp',
    multiple: true,
    title: 'Drop image files here',
    desc: 'Select PNG, JPG, or WebP images to bind into a PDF document',
    onFiles: (files) => {
      const valid = files.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name));
      if (valid.length === 0) {
        UI.toast('Please select valid image files (PNG, JPG, WebP).', 'error');
        return;
      }
      imageFiles = [...imageFiles, ...valid];
      renderList();
    }
  });
  dropArea.appendChild(dropzone);

  function renderList() {
    if (imageFiles.length === 0) {
      listContainer.style.display = 'none';
      optionsPanel.style.display = 'none';
      actionBar.style.display = 'none';
      return;
    }
    listContainer.style.display = 'flex';
    optionsPanel.style.display = 'flex';
    actionBar.style.display = 'flex';
    countInfo.textContent = `${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} ready`;

    listContainer.innerHTML = imageFiles.map((file, idx) => {
      const objUrl = URL.createObjectURL(file);
      return `
      <div class="image-thumb-card" data-index="${idx}">
        <div style="display:flex; align-items:center; gap:0.875rem; min-width:0;">
          <div class="image-thumb-preview-box">
            <img src="${objUrl}" alt="${file.name}">
          </div>
          <div style="min-width:0;">
            <div class="file-name" style="font-weight:600; font-size:0.875rem;" title="${file.name}">${file.name}</div>
            <div class="file-meta" style="font-size:0.75rem; color:var(--ink-muted);">${PDFEngine.formatBytes(file.size)} · Page ${idx + 1}</div>
          </div>
        </div>
        <div class="file-actions" style="margin-left:auto;">
          <button class="btn-mini btn-move-up" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
          <button class="btn-mini btn-move-down" ${idx === imageFiles.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
          <button class="btn-mini btn-remove" title="Remove">✕</button>
        </div>
      </div>
    `;
    }).join('');

    listContainer.querySelectorAll('.image-thumb-card').forEach(item => {
      const idx = parseInt(item.dataset.index, 10);
      item.querySelector('.btn-move-up')?.addEventListener('click', () => {
        if (idx > 0) {
          const temp = imageFiles[idx];
          imageFiles[idx] = imageFiles[idx - 1];
          imageFiles[idx - 1] = temp;
          renderList();
        }
      });
      item.querySelector('.btn-move-down')?.addEventListener('click', () => {
        if (idx < imageFiles.length - 1) {
          const temp = imageFiles[idx];
          imageFiles[idx] = imageFiles[idx + 1];
          imageFiles[idx + 1] = temp;
          renderList();
        }
      });
      item.querySelector('.btn-remove')?.addEventListener('click', () => {
        imageFiles.splice(idx, 1);
        renderList();
      });
    });
  }

  convertBtn.addEventListener('click', async () => {
    if (imageFiles.length === 0) return;
    try {
      UI.setButtonLoading(convertBtn, true, 'Creating PDF...');
      const pdfDoc = await window.PDFLib.PDFDocument.create();
      const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612.0, 792.0] };
      const MARGINS = { none: 0, normal: 36, large: 72 };
      const margin = MARGINS[marginSelect.value] || 0;

      for (const file of imageFiles) {
        const buffer = await PDFEngine.readFileAsArrayBuffer(file);
        let embeddedImage;

        if (file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name)) {
          embeddedImage = await pdfDoc.embedJpg(buffer);
        } else {
          const imgUrl = await PDFEngine.readFileAsDataURL(file);
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imgUrl;
          });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const pngUrl = c.toDataURL('image/png');
          const pngBytes = await fetch(pngUrl).then(r => r.arrayBuffer());
          embeddedImage = await pdfDoc.embedPng(pngBytes);
        }

        const imgWidth = embeddedImage.width;
        const imgHeight = embeddedImage.height;
        let pageWidth, pageHeight;

        if (pageSizeSelect.value === 'fit') {
          pageWidth = imgWidth + margin * 2;
          pageHeight = imgHeight + margin * 2;
        } else {
          [pageWidth, pageHeight] = PAGE_SIZES[pageSizeSelect.value];
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        const availableWidth = pageWidth - margin * 2;
        const availableHeight = pageHeight - margin * 2;
        const scale = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);

        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;
        const x = margin + (availableWidth - scaledWidth) / 2;
        const y = margin + (availableHeight - scaledHeight) / 2;

        page.drawImage(embeddedImage, { x, y, width: scaledWidth, height: scaledHeight });
      }

      const pdfBytes = await pdfDoc.save();
      const outName = filenameInput.value.trim() || 'converted-images.pdf';
      PDFEngine.downloadBlob(pdfBytes, outName.endsWith('.pdf') ? outName : `${outName}.pdf`);
      UI.toast(`Created PDF from ${imageFiles.length} images!`, 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to create PDF: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(convertBtn, false);
    }
  });
}

// 6. PDF to Images (100% Visual Interactive Selection)
function renderPdfToImagesTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  let totalPages = 0;
  let pagesState = [];

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="images-workspace" style="display:none;">
      <div class="organizer-toolbar">
        <div>
          <span class="organizer-info" id="img-export-count-badge">0 of 0 selected</span>
          <span style="font-size:0.75rem; color:var(--ink-muted); margin-left:0.5rem;">Click pages to select/deselect for export</span>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button id="btn-export-all" class="btn-subtle">Select All</button>
          <button id="btn-export-none" class="btn-subtle">Clear</button>
          <button id="btn-export-odd" class="btn-subtle">Odd</button>
          <button id="btn-export-even" class="btn-subtle">Even</button>
        </div>
      </div>

      <div class="organizer-grid" id="images-visual-grid" style="max-height: 380px; overflow-y: auto; padding: 0.5rem 0.25rem;"></div>

      <div class="tool-options-panel" style="margin-top: 1rem;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
          <div class="option-group">
            <label class="option-label" for="render-scale">Resolution / Quality</label>
            <select id="render-scale" class="option-select">
              <option value="1.5">Standard (1.5x)</option>
              <option value="2.0" selected>High Resolution (2x HD)</option>
              <option value="3.0">Ultra Crisp (3x Print)</option>
            </select>
          </div>
          <div class="option-group">
            <label class="option-label" for="img-export-format">Image Format</label>
            <select id="img-export-format" class="option-select">
              <option value="image/png" selected>PNG (Lossless)</option>
              <option value="image/jpeg">JPEG (Compressed)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-export-images" class="btn-primary">Export Selected Images</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#images-workspace');
  const grid = container.querySelector('#images-visual-grid');
  const countBadge = container.querySelector('#img-export-count-badge');
  const scaleSelect = container.querySelector('#render-scale');
  const formatSelect = container.querySelector('#img-export-format');
  const exportBtn = container.querySelector('#btn-export-images');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const btnAll = container.querySelector('#btn-export-all');
  const btnNone = container.querySelector('#btn-export-none');
  const btnOdd = container.querySelector('#btn-export-odd');
  const btnEven = container.querySelector('#btn-export-even');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to convert to images',
    desc: 'Visually select pages to render into high-resolution images',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        totalPages = pdfJsDoc.numPages;

        await initPages();
        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load document: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pdfJsDoc = null;
    pagesState = [];
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  async function initPages() {
    pagesState = [];
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--ink-muted);">
        <span class="spinner" style="display:inline-block; border-color: var(--border-strong); border-top-color: #059669;"></span>
        <p style="margin-top:0.75rem;">Rendering page thumbnails...</p>
      </div>
    `;

    for (let i = 1; i <= totalPages; i++) {
      const canvas = document.createElement('canvas');
      await PDFEngine.renderPageToCanvas(pdfJsDoc, i, canvas, 0.35);
      pagesState.push({
        pageNum: i,
        selected: true, // Default to all selected
        canvas: canvas
      });
    }

    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    const selectedCount = pagesState.filter(p => p.selected).length;
    countBadge.textContent = `${selectedCount} of ${totalPages} selected`;
    exportBtn.textContent = selectedCount === 1 ? 'Export 1 Image' : `Export ${selectedCount} Images`;
    exportBtn.disabled = selectedCount === 0;

    pagesState.forEach(page => {
      const card = document.createElement('div');
      card.className = `page-thumb-card selectable ${page.selected ? 'selected-export' : ''}`;
      card.title = `Click to ${page.selected ? 'deselect' : 'select'} page ${page.pageNum}`;

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'page-canvas-wrapper';
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = page.canvas.width;
      displayCanvas.height = page.canvas.height;
      displayCanvas.getContext('2d').drawImage(page.canvas, 0, 0);
      canvasWrapper.appendChild(displayCanvas);
      card.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'page-thumb-footer';
      footer.innerHTML = `
        <span class="page-number-tag">Page ${page.pageNum}</span>
        <span style="font-size:0.7rem; color:${page.selected ? '#059669' : 'var(--ink-muted)'}; font-weight:600;">
          ${page.selected ? 'Ready' : 'Skipped'}
        </span>
      `;
      card.appendChild(footer);

      card.addEventListener('click', () => {
        page.selected = !page.selected;
        renderGrid();
      });

      grid.appendChild(card);
    });
  }

  btnAll.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = true);
    renderGrid();
  });

  btnNone.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = false);
    renderGrid();
  });

  btnOdd.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = (p.pageNum % 2 !== 0));
    renderGrid();
  });

  btnEven.addEventListener('click', () => {
    pagesState.forEach(p => p.selected = (p.pageNum % 2 === 0));
    renderGrid();
  });

  exportBtn.addEventListener('click', async () => {
    const selectedPages = pagesState.filter(p => p.selected).map(p => p.pageNum);
    if (selectedPages.length === 0) {
      UI.toast('Please select at least one page to export.', 'error');
      return;
    }
    try {
      UI.setButtonLoading(exportBtn, true, 'Rendering pages...');
      const scale = parseFloat(scaleSelect.value) || 2.0;
      const mimeType = formatSelect.value;
      const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');

      if (selectedPages.length === 1) {
        const pageNum = selectedPages[0];
        const canvas = document.createElement('canvas');
        await PDFEngine.renderPageToCanvas(pdfJsDoc, pageNum, canvas, scale);
        canvas.toBlob((blob) => {
          PDFEngine.downloadBlob(blob, `${baseName}-page-${pageNum}.${ext}`, mimeType);
          UI.toast('Exported page image!', 'success');
          UI.closeDialog();
        }, mimeType, 0.92);
        return;
      }

      if (!window.JSZip) throw new Error('JSZip not available');
      const zip = new window.JSZip();

      for (let i = 0; i < selectedPages.length; i++) {
        const pageNum = selectedPages[i];
        const canvas = document.createElement('canvas');
        await PDFEngine.renderPageToCanvas(pdfJsDoc, pageNum, canvas, scale);
        const dataUrl = canvas.toDataURL(mimeType, 0.92);
        const base64Data = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
        const padNum = String(pageNum).padStart(2, '0');
        zip.file(`${baseName}-page-${padNum}.${ext}`, base64Data, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      PDFEngine.downloadBlob(zipBlob, `${baseName}-images.zip`, 'application/zip');
      UI.toast(`Exported ${selectedPages.length} page images into ZIP!`, 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Error exporting images: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(exportBtn, false);
    }
  });
}

// 7. Rotate PDF (Visualized)
function renderRotateTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  let totalPages = 0;
  let pagesState = [];

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="rotate-workspace" style="display:none;">
      <div class="page-organizer-toolbar">
        <div class="organizer-info">
          <strong id="rotate-count-badge">0 pages</strong>
          <span>• Click rotate handles or use batch controls</span>
        </div>
        <div class="organizer-quick-actions">
          <button id="btn-rot-all-90" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Rotate All +90°</button>
          <button id="btn-rot-odd-90" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Odd +90°</button>
          <button id="btn-rot-even-90" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Even +90°</button>
          <button id="btn-rot-reset" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Reset</button>
        </div>
      </div>

      <div id="rotate-visual-grid" class="visual-page-grid"></div>

      <div class="action-bar" style="margin-top: 1.25rem;">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-rotate-exec" class="btn-primary">Save Rotated PDF</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#rotate-workspace');
  const grid = container.querySelector('#rotate-visual-grid');
  const countBadge = container.querySelector('#rotate-count-badge');
  const rotateBtn = container.querySelector('#btn-rotate-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to rotate',
    desc: 'Visually rotate all or specific pages with live orientation preview',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        totalPages = pdfJsDoc.numPages;

        await initPages();
        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load PDF: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pdfJsDoc = null;
    pagesState = [];
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  async function initPages() {
    pagesState = [];
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--ink-muted);">
        <span class="spinner" style="display:inline-block; border-color: var(--border-strong); border-top-color: var(--hanko-red);"></span>
        <p style="margin-top:0.75rem;">Rendering page thumbnails...</p>
      </div>
    `;

    for (let i = 1; i <= totalPages; i++) {
      const canvas = document.createElement('canvas');
      await PDFEngine.renderPageToCanvas(pdfJsDoc, i, canvas, 0.35);
      pagesState.push({
        pageNum: i,
        rotation: 0,
        canvas: canvas
      });
    }

    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    countBadge.textContent = `${totalPages} page${totalPages === 1 ? '' : 's'}`;

    pagesState.forEach(page => {
      const card = document.createElement('div');
      card.className = 'page-thumb-card';

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'page-canvas-wrapper';

      const displayCanvas = document.createElement('canvas');
      displayCanvas.className = 'page-thumb-canvas';
      displayCanvas.width = page.canvas.width;
      displayCanvas.height = page.canvas.height;
      displayCanvas.style.transform = `rotate(${page.rotation}deg)`;
      displayCanvas.getContext('2d').drawImage(page.canvas, 0, 0);
      canvasWrapper.appendChild(displayCanvas);
      card.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'page-thumb-footer';
      footer.innerHTML = `
        <span class="page-number-tag">Page ${page.pageNum}</span>
        <button class="btn-thumb-action rotate-handle ${page.rotation > 0 ? 'is-rotated' : ''}" title="Rotate +90°">⟳ ${page.rotation > 0 ? page.rotation + '°' : ''}</button>
      `;
      card.appendChild(footer);

      const rotateHandle = footer.querySelector('.rotate-handle');
      rotateHandle.addEventListener('click', () => {
        page.rotation = (page.rotation + 90) % 360;
        displayCanvas.style.transform = `rotate(${page.rotation}deg)`;
        rotateHandle.innerHTML = `⟳ ${page.rotation > 0 ? page.rotation + '°' : ''}`;
        rotateHandle.classList.toggle('is-rotated', page.rotation > 0);
      });

      grid.appendChild(card);
    });
  }

  container.querySelector('#btn-rot-all-90')?.addEventListener('click', () => {
    pagesState.forEach(p => p.rotation = (p.rotation + 90) % 360);
    renderGrid();
  });
  container.querySelector('#btn-rot-odd-90')?.addEventListener('click', () => {
    pagesState.forEach(p => { if (p.pageNum % 2 !== 0) p.rotation = (p.rotation + 90) % 360; });
    renderGrid();
  });
  container.querySelector('#btn-rot-even-90')?.addEventListener('click', () => {
    pagesState.forEach(p => { if (p.pageNum % 2 === 0) p.rotation = (p.rotation + 90) % 360; });
    renderGrid();
  });
  container.querySelector('#btn-rot-reset')?.addEventListener('click', () => {
    pagesState.forEach(p => p.rotation = 0);
    renderGrid();
  });

  rotateBtn.addEventListener('click', async () => {
    try {
      UI.setButtonLoading(rotateBtn, true, 'Rotating pages...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const pdfDoc = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const addedRot = pagesState[index].rotation;
        if (addedRot !== 0) {
          const currentRot = page.getRotation().angle;
          page.setRotation(window.PDFLib.degrees((currentRot + addedRot) % 360));
        }
      });

      const rotatedBytes = await pdfDoc.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(rotatedBytes, `${baseName}-rotated.pdf`);
      UI.toast('PDF rotated successfully!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to rotate PDF: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(rotateBtn, false);
    }
  });
}

// 8. Delete Pages (Visualized)
function renderDeletePagesTool(container) {
  let currentFile = null;
  let totalPages = 0;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  // Array of { pageNum: 1, toDelete: false, canvas: HTMLCanvasElement }
  let pagesState = [];

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="delete-workspace" style="display:none;">
      <div class="page-organizer-toolbar">
        <div class="organizer-info">
          <strong id="delete-count-badge">0 to delete</strong>
          <span>• Click thumbnails you wish to permanently discard</span>
        </div>
        <div class="organizer-quick-actions">
          <button id="btn-del-all" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Select All</button>
          <button id="btn-del-none" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Clear</button>
          <button id="btn-del-invert" class="btn-subtle" style="margin:0; padding: 0.35rem 0.8rem; font-size:0.8rem;">Invert</button>
        </div>
      </div>

      <div id="delete-visual-grid" class="visual-page-grid"></div>

      <div class="action-bar" style="margin-top: 1.25rem;">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-delete-exec" class="btn-primary" style="background-color: var(--hanko-red);">
          Delete Pages & Save
        </button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#delete-workspace');
  const grid = container.querySelector('#delete-visual-grid');
  const countBadge = container.querySelector('#delete-count-badge');
  const deleteBtn = container.querySelector('#btn-delete-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to remove pages',
    desc: 'Visually click pages you want to discard from your document',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        totalPages = pdfJsDoc.numPages;

        await initPages();
        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load PDF: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pdfJsDoc = null;
    pagesState = [];
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  async function initPages() {
    pagesState = [];
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--ink-muted);">
        <span class="spinner" style="display:inline-block; border-color: var(--border-strong); border-top-color: var(--hanko-red);"></span>
        <p style="margin-top:0.75rem;">Rendering page thumbnails...</p>
      </div>
    `;

    for (let i = 1; i <= totalPages; i++) {
      const canvas = document.createElement('canvas');
      await PDFEngine.renderPageToCanvas(pdfJsDoc, i, canvas, 0.35);
      pagesState.push({
        pageNum: i,
        toDelete: false,
        canvas: canvas
      });
    }

    renderGrid();
  }

  function renderGrid() {
    grid.innerHTML = '';
    const toDeleteCount = pagesState.filter(p => p.toDelete).length;
    const remainingCount = totalPages - toDeleteCount;

    countBadge.textContent = `${toDeleteCount} marked to discard (${remainingCount} remain)`;

    pagesState.forEach(page => {
      const card = document.createElement('div');
      card.className = `page-thumb-card selectable ${page.toDelete ? 'marked-delete' : ''}`;
      card.title = `Click to ${page.toDelete ? 'keep' : 'discard'} page ${page.pageNum}`;

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'page-canvas-wrapper';
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = page.canvas.width;
      displayCanvas.height = page.canvas.height;
      displayCanvas.getContext('2d').drawImage(page.canvas, 0, 0);
      canvasWrapper.appendChild(displayCanvas);
      card.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'page-thumb-footer';
      footer.innerHTML = `
        <span class="page-number-tag">Page ${page.pageNum}</span>
        <span style="font-size:0.7rem; color:${page.toDelete ? '#ef4444' : 'var(--ink-muted)'}; font-weight:600;">
          ${page.toDelete ? 'Discard' : 'Keep'}
        </span>
      `;
      card.appendChild(footer);

      card.addEventListener('click', () => {
        page.toDelete = !page.toDelete;
        renderGrid();
      });

      grid.appendChild(card);
    });

    deleteBtn.disabled = (toDeleteCount === 0 || toDeleteCount >= totalPages);
    if (toDeleteCount === 0) {
      deleteBtn.textContent = 'Select pages to delete';
    } else if (toDeleteCount >= totalPages) {
      deleteBtn.textContent = 'Cannot delete all pages';
    } else {
      deleteBtn.textContent = `Delete ${toDeleteCount} Page${toDeleteCount === 1 ? '' : 's'} & Save`;
    }
  }

  container.querySelector('#btn-del-all')?.addEventListener('click', () => {
    pagesState.forEach(p => p.toDelete = true);
    renderGrid();
  });
  container.querySelector('#btn-del-none')?.addEventListener('click', () => {
    pagesState.forEach(p => p.toDelete = false);
    renderGrid();
  });
  container.querySelector('#btn-del-invert')?.addEventListener('click', () => {
    pagesState.forEach(p => p.toDelete = !p.toDelete);
    renderGrid();
  });

  deleteBtn.addEventListener('click', async () => {
    const pagesToDelete = pagesState.filter(p => p.toDelete).map(p => p.pageNum);
    if (pagesToDelete.length === 0 || pagesToDelete.length >= totalPages) return;

    try {
      UI.setButtonLoading(deleteBtn, true, 'Deleting pages...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const sourceDoc = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const newDoc = await window.PDFLib.PDFDocument.create();

      const deleteSet = new Set(pagesToDelete);
      const pagesToKeep = [];
      for (let i = 1; i <= totalPages; i++) {
        if (!deleteSet.has(i)) {
          pagesToKeep.push(i - 1);
        }
      }

      const copied = await newDoc.copyPages(sourceDoc, pagesToKeep);
      copied.forEach(p => newDoc.addPage(p));

      const newBytes = await newDoc.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(newBytes, `${baseName}-cleaned.pdf`);
      UI.toast(`Deleted ${pagesToDelete.length} pages successfully!`, 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to delete pages: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(deleteBtn, false);
    }
  });
}

// 9. Watermark (Visualized)
function renderWatermarkTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  let baseCanvas = null;

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="watermark-workspace" style="display:none;">
      <div class="live-preview-box" style="margin-top:0;">
        <span class="file-meta" style="margin-bottom:0.5rem; font-weight:600;">Live Watermark Preview</span>
        <div class="live-preview-canvas-wrapper">
          <canvas id="wm-preview-canvas"></canvas>
        </div>
      </div>

      <div class="tool-options-panel" style="margin-top: 1rem;">
        <div class="option-group">
          <label class="option-label" for="wm-text">Watermark Text</label>
          <input type="text" id="wm-text" class="option-input" value="CONFIDENTIAL" placeholder="e.g. CONFIDENTIAL, DRAFT, COPY">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="option-group">
            <label class="option-label" for="wm-color">Ink Color</label>
            <select id="wm-color" class="option-select">
              <option value="slate">Warm Slate</option>
              <option value="vermilion">Vermilion Red</option>
              <option value="indigo">Deep Indigo</option>
            </select>
          </div>
          <div class="option-group">
            <label class="option-label" for="wm-opacity">
              <span>Opacity</span>
              <span id="opacity-val" class="file-meta">25%</span>
            </label>
            <input type="range" id="wm-opacity" min="0.1" max="0.8" step="0.05" value="0.25" style="margin-top:0.5rem; accent-color: var(--hanko-red);">
          </div>
        </div>
        <div class="option-group">
          <label class="option-label" style="cursor:pointer; display:flex; align-items:center; gap:0.5rem;">
            <input type="checkbox" id="wm-diagonal" checked style="accent-color: var(--hanko-red); width: 1.1rem; height: 1.1rem;">
            <span>Render diagonally (-45° angle across page)</span>
          </label>
        </div>
      </div>
      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-wm-exec" class="btn-primary">Apply Watermark</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#watermark-workspace');
  const previewCanvas = container.querySelector('#wm-preview-canvas');
  const textInput = container.querySelector('#wm-text');
  const colorSelect = container.querySelector('#wm-color');
  const opacityInput = container.querySelector('#wm-opacity');
  const opacityVal = container.querySelector('#opacity-val');
  const diagonalCheck = container.querySelector('#wm-diagonal');
  const applyBtn = container.querySelector('#btn-wm-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const pCtx = previewCanvas.getContext('2d');

  function updateLivePreview() {
    if (!baseCanvas) return;
    const w = baseCanvas.width;
    const h = baseCanvas.height;
    previewCanvas.width = w;
    previewCanvas.height = h;

    pCtx.clearRect(0, 0, w, h);
    pCtx.drawImage(baseCanvas, 0, 0);

    const text = textInput.value.trim();
    if (!text) return;

    const opacity = parseFloat(opacityInput.value) || 0.25;
    const isDiagonal = diagonalCheck.checked;

    let colorStr = 'rgba(75, 85, 99, ';
    if (colorSelect.value === 'vermilion') colorStr = 'rgba(220, 38, 38, ';
    else if (colorSelect.value === 'indigo') colorStr = 'rgba(29, 78, 216, ';

    pCtx.save();
    pCtx.fillStyle = colorStr + opacity + ')';
    pCtx.font = `bold ${Math.floor(w / 8)}px "Newsreader", sans-serif`;
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';

    if (isDiagonal) {
      pCtx.translate(w / 2, h / 2);
      pCtx.rotate(-45 * Math.PI / 180);
      pCtx.fillText(text, 0, 0);
    } else {
      pCtx.fillText(text, w / 2, h / 2);
    }
    pCtx.restore();
  }

  opacityInput.addEventListener('input', () => {
    opacityVal.textContent = `${Math.round(opacityInput.value * 100)}%`;
    updateLivePreview();
  });
  textInput.addEventListener('input', updateLivePreview);
  colorSelect.addEventListener('change', updateLivePreview);
  diagonalCheck.addEventListener('change', updateLivePreview);

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to add watermark',
    desc: 'Stamp subtle diagonal text with live real-time preview',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);

        baseCanvas = document.createElement('canvas');
        await PDFEngine.renderPageToCanvas(pdfJsDoc, 1, baseCanvas, 0.45);

        dropArea.style.display = 'none';
        workspace.style.display = 'block';
        updateLivePreview();
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load PDF: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    baseCanvas = null;
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  applyBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
      UI.toast('Please enter watermark text.', 'error');
      return;
    }
    try {
      UI.setButtonLoading(applyBtn, true, 'Applying watermark...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const doc = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const font = await doc.embedFont(window.PDFLib.StandardFonts.HelveticaBold);
      const pages = doc.getPages();
      const opacity = parseFloat(opacityInput.value);
      const isDiagonal = diagonalCheck.checked;

      let color = window.PDFLib.rgb(0.4, 0.4, 0.4);
      if (colorSelect.value === 'vermilion') color = window.PDFLib.rgb(0.77, 0.24, 0.15);
      else if (colorSelect.value === 'indigo') color = window.PDFLib.rgb(0.12, 0.22, 0.38);

      pages.forEach(page => {
        const { width, height } = page.getSize();
        const fontSize = Math.min(width, height) / 10;
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        if (isDiagonal) {
          page.drawText(text, {
            x: (width - textWidth * 0.707) / 2,
            y: (height - textWidth * 0.707) / 2,
            size: fontSize,
            font: font,
            color: color,
            opacity: opacity,
            rotate: window.PDFLib.degrees(45),
          });
        } else {
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: (height - textHeight) / 2,
            size: fontSize,
            font: font,
            color: color,
            opacity: opacity,
          });
        }
      });

      const savedBytes = await doc.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(savedBytes, `${baseName}-watermarked.pdf`);
      UI.toast('Watermark applied successfully!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Error applying watermark: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(applyBtn, false);
    }
  });
}

// 10. Page Numbers (Live Real-time Preview)
function renderPageNumbersTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let baseCanvas = null;
  let originalFilename = '';
  let totalPages = 0;

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="page-num-workspace" style="display:none;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;">
        <div class="tool-options-panel">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="option-group">
              <label class="option-label" for="num-position">Position</label>
              <select id="num-position" class="option-select">
                <option value="bottom-center" selected>Bottom Center</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-center">Top Center</option>
                <option value="top-right">Top Right</option>
                <option value="top-left">Top Left</option>
              </select>
            </div>
            <div class="option-group">
              <label class="option-label" for="num-format">Format</label>
              <select id="num-format" class="option-select">
                <option value="number" selected>1, 2, 3...</option>
                <option value="page-n">Page 1, Page 2...</option>
                <option value="n-of-total">1 of 10, 2 of 10...</option>
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
            <div class="option-group">
              <label class="option-label" for="start-num">Start Number</label>
              <input type="number" id="start-num" class="option-input" value="1" min="1">
            </div>
            <div class="option-group">
              <label class="option-label" for="skip-first">Cover Page</label>
              <select id="skip-first" class="option-select">
                <option value="no">Number all pages</option>
                <option value="yes">Skip first page (Cover)</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <div class="option-label" style="margin-bottom:0.5rem; display:flex; justify-content:space-between;">
            <span>Live Preview</span>
            <span id="preview-page-indicator" style="font-weight:400; color:var(--ink-muted);">Page 1</span>
          </div>
          <div class="live-preview-box">
            <div class="live-preview-canvas-wrapper">
              <canvas id="pagenum-preview-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-num-exec" class="btn-primary">Add Numbers & Save</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#page-num-workspace');
  const posSelect = container.querySelector('#num-position');
  const formatSelect = container.querySelector('#num-format');
  const startNumInput = container.querySelector('#start-num');
  const skipFirstSelect = container.querySelector('#skip-first');
  const applyBtn = container.querySelector('#btn-num-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');
  const previewCanvas = container.querySelector('#pagenum-preview-canvas');
  const previewPageIndicator = container.querySelector('#preview-page-indicator');
  const pCtx = previewCanvas.getContext('2d');

  function updateLivePreview() {
    if (!baseCanvas) return;
    const w = baseCanvas.width;
    const h = baseCanvas.height;
    previewCanvas.width = w;
    previewCanvas.height = h;

    pCtx.clearRect(0, 0, w, h);
    pCtx.drawImage(baseCanvas, 0, 0);

    const startNum = parseInt(startNumInput.value, 10) || 1;
    const skipFirst = skipFirstSelect.value === 'yes';
    const format = formatSelect.value;
    const pos = posSelect.value;

    if (skipFirst) {
      previewPageIndicator.textContent = 'Page 1 (Cover - Skipped)';
      pCtx.save();
      pCtx.fillStyle = 'rgba(100, 116, 139, 0.7)';
      pCtx.font = `italic ${Math.floor(w / 20)}px sans-serif`;
      pCtx.textAlign = 'center';
      pCtx.textBaseline = 'middle';
      pCtx.fillText('[Cover - No Number]', w / 2, h - 35);
      pCtx.restore();
      return;
    }

    previewPageIndicator.textContent = 'Page 1';
    let text = `${startNum}`;
    if (format === 'page-n') text = `Page ${startNum}`;
    else if (format === 'n-of-total') text = `${startNum} of ${totalPages || 1}`;

    const fontSize = Math.floor(w / 22);
    pCtx.save();
    pCtx.font = `600 ${fontSize}px sans-serif`;
    pCtx.fillStyle = '#1e293b';

    const margin = Math.floor(w * 0.06);
    let x = w / 2;
    let y = h - margin;
    let align = 'center';
    let baseline = 'bottom';

    if (pos === 'bottom-left') { x = margin; y = h - margin; align = 'left'; baseline = 'bottom'; }
    else if (pos === 'bottom-right') { x = w - margin; y = h - margin; align = 'right'; baseline = 'bottom'; }
    else if (pos === 'bottom-center') { x = w / 2; y = h - margin; align = 'center'; baseline = 'bottom'; }
    else if (pos === 'top-left') { x = margin; y = margin; align = 'left'; baseline = 'top'; }
    else if (pos === 'top-center') { x = w / 2; y = margin; align = 'center'; baseline = 'top'; }
    else if (pos === 'top-right') { x = w - margin; y = margin; align = 'right'; baseline = 'top'; }

    pCtx.textAlign = align;
    pCtx.textBaseline = baseline;
    pCtx.fillText(text, x, y);
    pCtx.restore();
  }

  posSelect.addEventListener('change', updateLivePreview);
  formatSelect.addEventListener('change', updateLivePreview);
  startNumInput.addEventListener('input', updateLivePreview);
  skipFirstSelect.addEventListener('change', updateLivePreview);

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to number pages',
    desc: 'Stamp header or footer page numbers across your entire document',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        totalPages = pdfJsDoc.numPages;

        baseCanvas = document.createElement('canvas');
        await PDFEngine.renderPageToCanvas(pdfJsDoc, 1, baseCanvas, 0.45);

        dropArea.style.display = 'none';
        workspace.style.display = 'block';
        updateLivePreview();
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load PDF: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pdfJsDoc = null;
    baseCanvas = null;
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  applyBtn.addEventListener('click', async () => {
    if (!currentFile && !pdfBytes) return;
    try {
      UI.setButtonLoading(applyBtn, true, 'Numbering pages...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const doc = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const font = await doc.embedFont(window.PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();

      const startNum = parseInt(startNumInput.value, 10) || 1;
      const skipFirst = skipFirstSelect.value === 'yes';
      const format = formatSelect.value;
      const pos = posSelect.value;
      const margin = 30;
      const fontSize = 10;
      const color = window.PDFLib.rgb(0.25, 0.25, 0.25);

      pages.forEach((page, idx) => {
        if (skipFirst && idx === 0) return;
        const currentNum = startNum + (skipFirst ? idx - 1 : idx);
        let text = `${currentNum}`;
        if (format === 'page-n') text = `Page ${currentNum}`;
        else if (format === 'n-of-total') {
          const count = skipFirst ? totalPages - 1 : totalPages;
          text = `${currentNum} of ${count}`;
        }

        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const { width, height } = page.getSize();
        let x = (width - textWidth) / 2;
        let y = margin;

        if (pos === 'bottom-left') { x = margin; y = margin; }
        else if (pos === 'bottom-right') { x = width - textWidth - margin; y = margin; }
        else if (pos === 'top-left') { x = margin; y = height - margin - fontSize; }
        else if (pos === 'top-center') { x = (width - textWidth) / 2; y = height - margin - fontSize; }
        else if (pos === 'top-right') { x = width - textWidth - margin; y = height - margin - fontSize; }

        page.drawText(text, { x, y, size: fontSize, font, color });
      });

      const savedBytes = await doc.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(savedBytes, `${baseName}-numbered.pdf`);
      UI.toast('Page numbers added successfully!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Error adding page numbers: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(applyBtn, false);
    }
  });
}

// 11. PDF to Text
function renderPdfToTextTool(container) {
  let extractedText = '';
  let originalFilename = '';

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="text-workspace" style="display:none;">
      <div class="tool-options-panel">
        <div class="option-group">
          <div class="option-label">
            <span>Extracted Text</span>
            <button id="btn-copy-text" class="btn-subtle" style="margin:0; padding:0.25rem 0.75rem; font-size:0.75rem;">
              Copy to Clipboard
            </button>
          </div>
          <textarea id="text-output" class="option-input" style="height: 240px; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.6; resize: vertical; padding: 0.75rem;" readonly></textarea>
        </div>
      </div>
      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-download-txt" class="btn-primary">Download .txt File</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#text-workspace');
  const textOutput = container.querySelector('#text-output');
  const copyBtn = container.querySelector('#btn-copy-text');
  const downloadBtn = container.querySelector('#btn-download-txt');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to extract text',
    desc: 'Extract clean selectable text layer into readable plaintext',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      originalFilename = file.name;
      try {
        const bytes = await PDFEngine.readFileAsArrayBuffer(file);
        const pdf = await PDFEngine.loadPDFJSDoc(bytes);
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items.map(item => item.str);
          fullText += `--- PAGE ${i} ---\n` + pageStrings.join(' ') + '\n\n';
        }

        extractedText = fullText.trim();
        textOutput.value = extractedText;
        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to extract text: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    extractedText = '';
    textOutput.value = '';
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  copyBtn.addEventListener('click', async () => {
    if (!extractedText) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      UI.toast('Text copied to clipboard!', 'success');
    } catch {
      textOutput.select();
      document.execCommand('copy');
      UI.toast('Text copied to clipboard!', 'success');
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!extractedText) return;
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    PDFEngine.downloadBlob(blob, `${baseName}-text.txt`, 'text/plain');
    UI.toast('Text file downloaded!', 'success');
  });
}

// 12. Crop & Margin Trim PDF (Interactive Draggable Viewport)
function renderCropTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  let totalPages = 0;
  let currentPage = 1;
  let originalPageSize = { width: 595, height: 842 };

  let canvasDisplayWidth = 0;
  let canvasDisplayHeight = 0;
  let cropBox = { left: 0, top: 0, width: 0, height: 0 };

  let isDragging = false;
  let dragHandle = null; // 'box' or handle direction
  let dragStartX = 0, dragStartY = 0;
  let dragStartCrop = { left: 0, top: 0, width: 0, height: 0 };

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="crop-workspace" style="display:none;">
      <div class="crop-layout">
        <div class="crop-preview-area">
          <div class="crop-page-nav">
            <button id="btn-crop-prev" class="btn-subtle" style="padding:0.25rem 0.6rem; font-size:0.75rem;">◀ Prev</button>
            <span id="crop-page-indicator" style="font-weight:600; font-family:var(--font-mono); font-size:0.8125rem; color:var(--ink-primary);">Page 1 of 1</span>
            <button id="btn-crop-next" class="btn-subtle" style="padding:0.25rem 0.6rem; font-size:0.75rem;">Next ▶</button>
          </div>
          <div class="crop-stage" id="crop-stage">
            <canvas id="crop-canvas"></canvas>
            <div class="crop-overlay-layer">
              <div class="crop-selection-box" id="crop-selection-box">
                <div class="crop-selection-grid"></div>
                <div class="crop-handle handle-nw" data-handle="nw"></div>
                <div class="crop-handle handle-ne" data-handle="ne"></div>
                <div class="crop-handle handle-se" data-handle="se"></div>
                <div class="crop-handle handle-sw" data-handle="sw"></div>
                <div class="crop-handle handle-n" data-handle="n"></div>
                <div class="crop-handle handle-s" data-handle="s"></div>
                <div class="crop-handle handle-e" data-handle="e"></div>
                <div class="crop-handle handle-w" data-handle="w"></div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="tool-options-panel" style="margin-top:0;">
            <div class="option-group">
              <label class="option-label">Quick Presets</label>
              <div class="preset-chip-group">
                <button class="preset-chip" data-preset="reset">Full Page</button>
                <button class="preset-chip" data-preset="margin-5">Trim 5%</button>
                <button class="preset-chip" data-preset="margin-10">Trim 10%</button>
                <button class="preset-chip" data-preset="header-footer">Trim Headers</button>
              </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-top:0.75rem;">
              <div class="option-group">
                <label class="option-label" for="crop-margin-top">Top Trim %</label>
                <input type="number" id="crop-margin-top" class="option-input" min="0" max="45" value="0">
              </div>
              <div class="option-group">
                <label class="option-label" for="crop-margin-bottom">Bottom Trim %</label>
                <input type="number" id="crop-margin-bottom" class="option-input" min="0" max="45" value="0">
              </div>
              <div class="option-group">
                <label class="option-label" for="crop-margin-left">Left Trim %</label>
                <input type="number" id="crop-margin-left" class="option-input" min="0" max="45" value="0">
              </div>
              <div class="option-group">
                <label class="option-label" for="crop-margin-right">Right Trim %</label>
                <input type="number" id="crop-margin-right" class="option-input" min="0" max="45" value="0">
              </div>
            </div>

            <div class="option-group" style="margin-top:0.75rem;">
              <label class="option-label" for="crop-target-pages">Apply Crop To</label>
              <select id="crop-target-pages" class="option-select">
                <option value="all" selected>All Pages</option>
                <option value="current">Current Page Only</option>
                <option value="odd">Odd Pages Only</option>
                <option value="even">Even Pages Only</option>
              </select>
            </div>

            <div class="crop-stats-box" style="margin-top:0.75rem;">
              <div><strong>Original:</strong> <span id="stat-orig-size">595 × 842 pt</span></div>
              <div><strong>Cropped:</strong> <span id="stat-crop-size">595 × 842 pt (100%)</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="action-bar" style="margin-top:1.25rem;">
        <button id="btn-crop-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-crop-exec" class="btn-primary">Crop & Download PDF</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#crop-workspace');
  const canvas = container.querySelector('#crop-canvas');
  const selectionBox = container.querySelector('#crop-selection-box');
  const pageIndicator = container.querySelector('#crop-page-indicator');
  const prevBtn = container.querySelector('#btn-crop-prev');
  const nextBtn = container.querySelector('#btn-crop-next');
  const targetPagesSelect = container.querySelector('#crop-target-pages');
  const topInput = container.querySelector('#crop-margin-top');
  const bottomInput = container.querySelector('#crop-margin-bottom');
  const leftInput = container.querySelector('#crop-margin-left');
  const rightInput = container.querySelector('#crop-margin-right');
  const statOrig = container.querySelector('#stat-orig-size');
  const statCrop = container.querySelector('#stat-crop-size');
  const cropExecBtn = container.querySelector('#btn-crop-exec');
  const changeFileBtn = container.querySelector('#btn-crop-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to crop or trim margins',
    desc: 'Visually drag crop handles or apply margin trim presets with live preview',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        totalPages = pdfJsDoc.numPages;
        currentPage = 1;

        dropArea.style.display = 'none';
        workspace.style.display = 'block';

        await renderCurrentPage(true);
      } catch (err) {
        console.error(err);
        UI.toast('Failed to load document: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pdfJsDoc = null;
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  async function renderCurrentPage(resetBox = false) {
    if (!pdfJsDoc) return;
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    const page = await pdfJsDoc.getPage(currentPage);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    originalPageSize = {
      width: Math.round(unscaledViewport.width),
      height: Math.round(unscaledViewport.height)
    };

    // Scale preview to fit max width ~360px and max height ~430px
    const scale = Math.min(360 / unscaledViewport.width, 430 / unscaledViewport.height);
    await PDFEngine.renderPageToCanvas(pdfJsDoc, currentPage, canvas, scale);

    canvasDisplayWidth = canvas.clientWidth || Math.floor(unscaledViewport.width * scale);
    canvasDisplayHeight = canvas.clientHeight || Math.floor(unscaledViewport.height * scale);

    if (resetBox || cropBox.width === 0) {
      cropBox = {
        left: 0,
        top: 0,
        width: canvasDisplayWidth,
        height: canvasDisplayHeight
      };
    } else {
      // Clamp existing box to current canvas size
      cropBox.left = Math.min(cropBox.left, canvasDisplayWidth - 30);
      cropBox.top = Math.min(cropBox.top, canvasDisplayHeight - 30);
      cropBox.width = Math.min(cropBox.width, canvasDisplayWidth - cropBox.left);
      cropBox.height = Math.min(cropBox.height, canvasDisplayHeight - cropBox.top);
    }

    updateCropUI(true);
  }

  function updateCropUI(updateInputs = true) {
    selectionBox.style.left = `${cropBox.left}px`;
    selectionBox.style.top = `${cropBox.top}px`;
    selectionBox.style.width = `${cropBox.width}px`;
    selectionBox.style.height = `${cropBox.height}px`;

    const topPct = canvasDisplayHeight ? Math.round((cropBox.top / canvasDisplayHeight) * 100) : 0;
    const bottomPct = canvasDisplayHeight ? Math.round(((canvasDisplayHeight - cropBox.top - cropBox.height) / canvasDisplayHeight) * 100) : 0;
    const leftPct = canvasDisplayWidth ? Math.round((cropBox.left / canvasDisplayWidth) * 100) : 0;
    const rightPct = canvasDisplayWidth ? Math.round(((canvasDisplayWidth - cropBox.left - cropBox.width) / canvasDisplayWidth) * 100) : 0;

    if (updateInputs) {
      topInput.value = Math.max(0, topPct);
      bottomInput.value = Math.max(0, bottomPct);
      leftInput.value = Math.max(0, leftPct);
      rightInput.value = Math.max(0, rightPct);
    }

    const croppedPtW = Math.round(originalPageSize.width * (cropBox.width / (canvasDisplayWidth || 1)));
    const croppedPtH = Math.round(originalPageSize.height * (cropBox.height / (canvasDisplayHeight || 1)));
    const areaPct = Math.round((croppedPtW * croppedPtH) / (originalPageSize.width * originalPageSize.height) * 100);

    statOrig.textContent = `${originalPageSize.width} × ${originalPageSize.height} pt`;
    statCrop.textContent = `${croppedPtW} × ${croppedPtH} pt (${areaPct}% retained)`;
  }

  function applyPercentagesToBox() {
    const t = Math.min(45, Math.max(0, parseFloat(topInput.value) || 0)) / 100;
    const b = Math.min(45, Math.max(0, parseFloat(bottomInput.value) || 0)) / 100;
    const l = Math.min(45, Math.max(0, parseFloat(leftInput.value) || 0)) / 100;
    const r = Math.min(45, Math.max(0, parseFloat(rightInput.value) || 0)) / 100;

    const left = Math.round(canvasDisplayWidth * l);
    const top = Math.round(canvasDisplayHeight * t);
    const width = Math.max(30, Math.round(canvasDisplayWidth * (1 - l - r)));
    const height = Math.max(30, Math.round(canvasDisplayHeight * (1 - t - b)));

    cropBox = { left, top, width, height };
    updateCropUI(false);
  }

  [topInput, bottomInput, leftInput, rightInput].forEach(inp => {
    inp.addEventListener('input', applyPercentagesToBox);
  });

  // Presets
  container.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset === 'reset') {
        topInput.value = 0; bottomInput.value = 0; leftInput.value = 0; rightInput.value = 0;
      } else if (preset === 'margin-5') {
        topInput.value = 5; bottomInput.value = 5; leftInput.value = 5; rightInput.value = 5;
      } else if (preset === 'margin-10') {
        topInput.value = 10; bottomInput.value = 10; leftInput.value = 10; rightInput.value = 10;
      } else if (preset === 'header-footer') {
        topInput.value = 12; bottomInput.value = 12; leftInput.value = 3; rightInput.value = 3;
      }
      applyPercentagesToBox();
    });
  });

  // Drag handles & selection box moving
  function startDrag(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragHandle = handle;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCrop = { ...cropBox };

    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const minSize = 25;

    let { left, top, width, height } = dragStartCrop;

    if (dragHandle === 'box') {
      left = Math.max(0, Math.min(canvasDisplayWidth - width, left + dx));
      top = Math.max(0, Math.min(canvasDisplayHeight - height, top + dy));
    } else {
      if (dragHandle.includes('w')) {
        const newLeft = Math.max(0, Math.min(dragStartCrop.left + dragStartCrop.width - minSize, left + dx));
        width = dragStartCrop.left + dragStartCrop.width - newLeft;
        left = newLeft;
      }
      if (dragHandle.includes('e')) {
        width = Math.max(minSize, Math.min(canvasDisplayWidth - left, dragStartCrop.width + dx));
      }
      if (dragHandle.includes('n')) {
        const newTop = Math.max(0, Math.min(dragStartCrop.top + dragStartCrop.height - minSize, top + dy));
        height = dragStartCrop.top + dragStartCrop.height - newTop;
        top = newTop;
      }
      if (dragHandle.includes('s')) {
        height = Math.max(minSize, Math.min(canvasDisplayHeight - top, dragStartCrop.height + dy));
      }
    }

    cropBox = { left, top, width, height };
    updateCropUI(true);
  }

  function onDragEnd() {
    isDragging = false;
    dragHandle = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
  }

  selectionBox.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('crop-handle')) {
      startDrag(e, e.target.dataset.handle);
    } else {
      startDrag(e, 'box');
    }
  });

  // Page Navigation
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderCurrentPage(false);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderCurrentPage(false);
    }
  });

  // Save / Crop Execution
  cropExecBtn.addEventListener('click', async () => {
    if (!currentFile && !pdfBytes) return;
    try {
      UI.setButtonLoading(cropExecBtn, true, 'Cropping document...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const pdfDoc = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const pages = pdfDoc.getPages();

      const cropLeftPct = cropBox.left / canvasDisplayWidth;
      const cropTopPct = cropBox.top / canvasDisplayHeight;
      const cropWidthPct = cropBox.width / canvasDisplayWidth;
      const cropHeightPct = cropBox.height / canvasDisplayHeight;

      const targetMode = targetPagesSelect.value;

      pages.forEach((page, idx) => {
        const pageNum = idx + 1;
        const matches = (
          targetMode === 'all' ||
          (targetMode === 'current' && pageNum === currentPage) ||
          (targetMode === 'odd' && pageNum % 2 !== 0) ||
          (targetMode === 'even' && pageNum % 2 === 0)
        );

        if (matches) {
          const { width, height } = page.getSize();
          const pdfX = width * cropLeftPct;
          const pdfWidth = width * cropWidthPct;
          const pdfHeight = height * cropHeightPct;
          // In PDF coordinates, (0,0) is bottom-left
          const pdfY = height - (height * (cropTopPct + cropHeightPct));

          page.setCropBox(pdfX, pdfY, pdfWidth, pdfHeight);
          page.setMediaBox(pdfX, pdfY, pdfWidth, pdfHeight);
        }
      });

      const croppedBytes = await pdfDoc.save();
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(croppedBytes, `${baseName}-cropped.pdf`);
      UI.toast('PDF cropped successfully!', 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to crop PDF: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(cropExecBtn, false);
    }
  });
}

/* ==========================================================================
   4. Tool Registry & App Bootstrapper
   ========================================================================== */
const TOOL_RENDERERS = {
  'organize': renderOrganizeTool,
  'sign': renderSignTool,
  'merge': renderMergeTool,
  'split': renderSplitTool,
  'images-to-pdf': renderImagesToPdfTool,
  'pdf-to-images': renderPdfToImagesTool,
  'rotate': renderRotateTool,
  'delete-pages': renderDeletePagesTool,
  'watermark': renderWatermarkTool,
  'page-numbers': renderPageNumbersTool,
  'pdf-to-text': renderPdfToTextTool,
  'crop-pdf': renderCropTool
};

function initApp() {
  UI.init();

  // 1. Theme Toggle
  const themeToggleBtn = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('honjin-theme') || 'dark';
  if (savedTheme === 'dark') {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  }

  themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      localStorage.setItem('honjin-theme', 'light');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      localStorage.setItem('honjin-theme', 'dark');
    }
  });

  // 2. Card Click Handlers
  const cards = document.querySelectorAll('.tool-card');
  cards.forEach(card => {
    const toolId = card.dataset.id;
    const renderer = TOOL_RENDERERS[toolId];
    if (!renderer) return;

    const title = card.querySelector('.tool-title span')?.textContent || 'Tool';
    const desc = card.querySelector('.tool-desc')?.textContent || '';
    const iconSvg = card.querySelector('.tool-icon-box')?.innerHTML || '';

    const triggerOpen = () => {
      UI.openDialog({
        title,
        desc,
        iconSvg,
        renderContent: (dialogBody) => renderer(dialogBody)
      });
    };

    card.addEventListener('click', triggerOpen);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerOpen();
      }
    });
  });

  // 3. Search and Category Filter
  const searchInput = document.getElementById('tool-search');
  const shortcutHint = document.getElementById('search-shortcut-hint');
  if (shortcutHint) {
    shortcutHint.textContent = '/';
  }
  if (searchInput) {
    searchInput.placeholder = "Search tools (type '/' or name)...";
  }
  const categoryPills = document.querySelectorAll('.cat-pill');
  const resetSearchBtn = document.getElementById('reset-search');
  const noResultsEl = document.getElementById('no-results');

  let activeCat = 'all';
  let query = '';

  function filterCards() {
    let visibleCount = 0;
    const q = query.toLowerCase().trim();

    cards.forEach(card => {
      const cardCat = card.dataset.category;
      const title = card.querySelector('.tool-title span')?.textContent.toLowerCase() || '';
      const desc = card.querySelector('.tool-desc')?.textContent.toLowerCase() || '';
      const badge = card.querySelector('.tool-badge')?.textContent.toLowerCase() || '';

      const matchesCat = (activeCat === 'all' || cardCat === activeCat);
      const matchesSearch = (!q || title.includes(q) || desc.includes(q) || badge.includes(q));

      if (matchesCat && matchesSearch) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (visibleCount === 0) {
      noResultsEl?.classList.remove('hidden');
    } else {
      noResultsEl?.classList.add('hidden');
    }
  }

  searchInput?.addEventListener('input', (e) => {
    query = e.target.value;
    filterCards();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && document.activeElement !== searchInput) {
      if (UI.dialog && UI.dialog.open) return;
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    }
  });

  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-selected', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-selected', 'true');
      activeCat = pill.dataset.category;
      filterCards();
    });
  });

  resetSearchBtn?.addEventListener('click', () => {
    query = '';
    if (searchInput) searchInput.value = '';
    activeCat = 'all';
    categoryPills.forEach(p => {
      p.classList.toggle('active', p.dataset.category === 'all');
      p.setAttribute('aria-selected', p.dataset.category === 'all' ? 'true' : 'false');
    });
    filterCards();
  });
}

// Run immediately or on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
