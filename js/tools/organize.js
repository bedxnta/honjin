import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderOrganizeTool(container) {
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';
  // Array of page descriptor objects: { originalIndex: 0, currentRotation: 0, canvas: HTMLCanvasElement }
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

      <div id="visual-grid" class="visual-page-grid">
        <!-- Rendered page thumbnail cards -->
      </div>

      <div class="action-bar">
        <button id="btn-change-doc" class="btn-secondary">Choose another PDF</button>
        <button id="btn-save-organized" class="btn-primary">
          Save & Download PDF
        </button>
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
        originalIndex: i - 1, // 0-based for pdf-lib
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
      canvasWrapper.style.transform = `rotate(${page.rotation}deg)`;
      canvasWrapper.style.transition = 'transform 180ms ease';

      // Clone canvas image data onto thumbnail display
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = page.canvas.width;
      displayCanvas.height = page.canvas.height;
      const ctx = displayCanvas.getContext('2d');
      ctx.drawImage(page.canvas, 0, 0);

      canvasWrapper.appendChild(displayCanvas);
      card.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'page-thumb-footer';
      footer.innerHTML = `
        <span class="page-number-tag">${index + 1}</span>
        <div class="page-thumb-controls">
          <button class="btn-thumb-action rotate-btn" title="Rotate 90° Clockwise">⟳</button>
          <button class="btn-thumb-action delete delete-btn" title="Remove page">✕</button>
        </div>
      `;
      card.appendChild(footer);

      // Rotate page
      footer.querySelector('.rotate-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        page.rotation = (page.rotation + 90) % 360;
        canvasWrapper.style.transform = `rotate(${page.rotation}deg)`;
      });

      // Remove page
      footer.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        pagesState.splice(index, 1);
        renderGrid();
      });

      // Drag & Drop reordering
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
    pagesState.forEach(p => {
      p.rotation = (p.rotation + 90) % 360;
    });
    renderGrid();
  });

  resetBtn.addEventListener('click', () => {
    initPages();
  });

  saveBtn.addEventListener('click', async () => {
    if (pagesState.length === 0) return;

    try {
      UI.setButtonLoading(saveBtn, true, 'Building PDF...');
      const freshBuffer = currentFile ? await currentFile.arrayBuffer() : pdfBytes.slice(0);
      const sourcePdf = await PDFEngine.loadPDFLibDoc(freshBuffer);
      const newPdf = await window.PDFLib.PDFDocument.create();

      // Collect original indices to copy
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
