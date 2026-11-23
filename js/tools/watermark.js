import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderWatermarkTool(container) {
  let pdfBytes = null;
  let originalFilename = '';

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="watermark-workspace" style="display:none;">
      <div class="tool-options-panel">
        <div class="option-group">
          <label class="option-label" for="wm-text">Watermark Text</label>
          <input type="text" id="wm-text" class="option-input" value="CONFIDENTIAL" placeholder="e.g. CONFIDENTIAL, DRAFT, COPY">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="option-group">
            <label class="option-label" for="wm-color">Ink Color</label>
            <select id="wm-color" class="option-select">
              <option value="slate">Warm Gray</option>
              <option value="vermilion">Vermilion (Hanko Red)</option>
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
  const textInput = container.querySelector('#wm-text');
  const colorSelect = container.querySelector('#wm-color');
  const opacityInput = container.querySelector('#wm-opacity');
  const opacityVal = container.querySelector('#opacity-val');
  const diagonalCheck = container.querySelector('#wm-diagonal');
  const applyBtn = container.querySelector('#btn-wm-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  opacityInput.addEventListener('input', () => {
    opacityVal.textContent = `${Math.round(opacityInput.value * 100)}%`;
  });

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to add watermark',
    desc: 'Stamp subtle diagonal text or status labels on all pages',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
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
    pdfBytes = null;
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
      const doc = await PDFEngine.loadPDFLibDoc(pdfBytes);
      const font = await doc.embedFont(window.PDFLib.StandardFonts.HelveticaBold);
      const pages = doc.getPages();

      const opacity = parseFloat(opacityInput.value);
      const isDiagonal = diagonalCheck.checked;

      let color = window.PDFLib.rgb(0.4, 0.4, 0.4);
      if (colorSelect.value === 'vermilion') {
        color = window.PDFLib.rgb(0.77, 0.24, 0.15);
      } else if (colorSelect.value === 'indigo') {
        color = window.PDFLib.rgb(0.12, 0.22, 0.38);
      }

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
