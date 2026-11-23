import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderPageNumbersTool(container) {
  let pdfBytes = null;
  let originalFilename = '';
  let totalPages = 0;

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="page-num-workspace" style="display:none;">
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

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
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
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        const doc = await PDFEngine.loadPDFLibDoc(pdfBytes);
        totalPages = doc.getPageCount();

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
    if (!pdfBytes) return;

    try {
      UI.setButtonLoading(applyBtn, true, 'Numbering pages...');
      const doc = await PDFEngine.loadPDFLibDoc(pdfBytes);
      const font = await doc.embedFont(window.PDFLib.StandardFonts.Helvetica);
      const pages = doc.getPages();

      const startNum = parseInt(startNumInput.value, 10) || 1;
      const skipFirst = skipFirstSelect.value === 'yes';
      const format = formatSelect.value;
      const pos = posSelect.value;
      const margin = 30; // 30pt from margin
      const fontSize = 10;
      const color = window.PDFLib.rgb(0.3, 0.3, 0.3);

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

        if (pos === 'bottom-left') {
          x = margin;
          y = margin;
        } else if (pos === 'bottom-right') {
          x = width - textWidth - margin;
          y = margin;
        } else if (pos === 'top-center') {
          x = (width - textWidth) / 2;
          y = height - margin - fontSize;
        } else if (pos === 'top-right') {
          x = width - textWidth - margin;
          y = height - margin - fontSize;
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color,
        });
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
