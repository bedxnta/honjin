import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderSignTool(container) {
  let pdfBytes = null;
  let pdfDoc = null;
  let totalPages = 1;
  let originalFilename = '';

  let inkColor = '#1a1a1a';
  let penWidth = 3;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let hasDrawn = false;
  let activeTab = 'draw'; // 'draw' or 'type'

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="sign-workspace" style="display:none;" class="sign-workspace">
      <div class="sign-tabs">
        <button class="sign-tab-btn active" data-tab="draw">Draw Signature</button>
        <button class="sign-tab-btn" data-tab="type">Type Signature</button>
      </div>

      <!-- Draw Signature Tab -->
      <div id="draw-tab-content">
        <div class="signature-canvas-box">
          <canvas id="sig-canvas" class="signature-canvas"></canvas>
          <div class="canvas-baseline"></div>
        </div>

        <div class="sign-tools-row" style="margin-top: 0.75rem;">
          <div class="ink-color-picker">
            <span class="file-meta">Ink:</span>
            <div class="ink-swatch active" data-color="#1a1a1a" style="background:#1a1a1a;" title="Black"></div>
            <div class="ink-swatch" data-color="#1e40af" style="background:#1e40af;" title="Blue"></div>
            <div class="ink-swatch" data-color="#b91c1c" style="background:#b91c1c;" title="Red"></div>
          </div>
          <button id="btn-clear-sig" class="btn-subtle" style="margin:0; font-size:0.8rem; padding: 0.35rem 0.8rem;">
            Clear Pad
          </button>
        </div>
      </div>

      <!-- Type Signature Tab -->
      <div id="type-tab-content" style="display:none;">
        <div class="signature-canvas-box">
          <canvas id="type-canvas" width="400" height="180" style="width:100%; height:180px;"></canvas>
        </div>
        <div class="option-group" style="margin-top:0.75rem;">
          <label class="option-label" for="type-name-input">Your Full Name or Signature</label>
          <input type="text" id="type-name-input" class="option-input" value="John Doe" placeholder="Type your name...">
        </div>
      </div>

      <!-- Placement Options -->
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
    pdfBytes = null;
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  // Tab switching
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

  // Canvas Drawing Setup
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

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
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

  function stopDraw() {
    isDrawing = false;
  }

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

  // Typed Cursive Signature Renderer
  function renderTypedSignature() {
    const name = typeInput.value.trim() || 'Signature';
    const w = typeCanvas.width;
    const h = typeCanvas.height;
    typeCtx.clearRect(0, 0, w, h);

    typeCtx.fillStyle = inkColor;
    typeCtx.font = 'italic 48px "Newsreader", "Times New Roman", cursive, serif';
    typeCtx.textAlign = 'center';
    typeCtx.textBaseline = 'middle';
    typeCtx.fillText(name, w / 2, h / 2);

    // Subtle signature flourish line
    typeCtx.strokeStyle = inkColor;
    typeCtx.lineWidth = 1.5;
    typeCtx.beginPath();
    typeCtx.moveTo(w * 0.2, h * 0.72);
    typeCtx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.8, h * 0.7);
    typeCtx.stroke();
  }

  typeInput.addEventListener('input', renderTypedSignature);

  // Apply Signature to PDF
  applyBtn.addEventListener('click', async () => {
    let sourceCanvas = null;
    if (activeTab === 'draw') {
      if (!hasDrawn) {
        UI.toast('Please draw your signature first.', 'error');
        return;
      }
      sourceCanvas = canvas;
    } else {
      sourceCanvas = typeCanvas;
    }

    try {
      UI.setButtonLoading(applyBtn, true, 'Applying signature...');
      const targetDoc = await PDFEngine.loadPDFLibDoc(pdfBytes);
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
        const pNum = parseInt(targetVal, 10);
        targetPageIndices = [pNum - 1];
      }

      const imgWidth = 160;
      const imgHeight = (imgWidth / sourceCanvas.width) * sourceCanvas.height;
      const margin = 36; // 0.5 inch margin

      targetPageIndices.forEach(pIdx => {
        const page = targetDoc.getPage(pIdx);
        const { width: pWidth, height: pHeight } = page.getSize();
        let x = pWidth - imgWidth - margin;
        let y = margin;

        const pos = posSelect.value;
        if (pos === 'bottom-left') {
          x = margin;
          y = margin;
        } else if (pos === 'bottom-center') {
          x = (pWidth - imgWidth) / 2;
          y = margin;
        } else if (pos === 'top-right') {
          x = pWidth - imgWidth - margin;
          y = pHeight - imgHeight - margin;
        } else if (pos === 'center') {
          x = (pWidth - imgWidth) / 2;
          y = (pHeight - imgHeight) / 2;
        }

        page.drawImage(embeddedImage, {
          x: x,
          y: y,
          width: imgWidth,
          height: imgHeight,
        });
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
