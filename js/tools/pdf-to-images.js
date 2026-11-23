import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderPdfToImagesTool(container) {
  let pdfBytes = null;
  let pdfJsDoc = null;
  let originalFilename = '';

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="images-workspace" style="display:none;">
      <div class="tool-options-panel">
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
            <label class="option-label" for="page-range-images">Pages</label>
            <input type="text" id="page-range-images" class="option-input" placeholder="e.g. all, or 1, 3-5">
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-export-images" class="btn-primary">Export Images</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#images-workspace');
  const scaleSelect = container.querySelector('#render-scale');
  const rangeInput = container.querySelector('#page-range-images');
  const exportBtn = container.querySelector('#btn-export-images');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to convert to images',
    desc: 'Render high-resolution PNG images from every page of your document',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      originalFilename = file.name;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfJsDoc = await PDFEngine.loadPDFJSDoc(pdfBytes);
        rangeInput.value = `1-${pdfJsDoc.numPages}`;

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
    pdfBytes = null;
    pdfJsDoc = null;
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  exportBtn.addEventListener('click', async () => {
    if (!pdfJsDoc) return;

    try {
      UI.setButtonLoading(exportBtn, true, 'Rendering pages...');
      const scale = parseFloat(scaleSelect.value) || 2.0;
      const total = pdfJsDoc.numPages;

      let pagesToExport = [];
      const val = rangeInput.value.trim().toLowerCase();
      if (!val || val === 'all') {
        pagesToExport = Array.from({ length: total }, (_, i) => i + 1);
      } else {
        pagesToExport = PDFEngine.parsePageRange(val, total);
      }

      if (pagesToExport.length === 0) {
        UI.toast('No valid pages selected.', 'error');
        UI.setButtonLoading(exportBtn, false);
        return;
      }

      const baseName = originalFilename.replace(/\.[^/.]+$/, '');

      // Single page: direct PNG download
      if (pagesToExport.length === 1) {
        const pageNum = pagesToExport[0];
        const canvas = document.createElement('canvas');
        await PDFEngine.renderPageToCanvas(pdfJsDoc, pageNum, canvas, scale);

        canvas.toBlob((blob) => {
          PDFEngine.downloadBlob(blob, `${baseName}-page-${pageNum}.png`, 'image/png');
          UI.toast('Exported page image!', 'success');
          UI.closeDialog();
        }, 'image/png');
        return;
      }

      // Multiple pages: Zip bundle
      if (!window.JSZip) throw new Error('JSZip not available');
      const zip = new window.JSZip();

      for (let i = 0; i < pagesToExport.length; i++) {
        const pageNum = pagesToExport[i];
        const canvas = document.createElement('canvas');
        await PDFEngine.renderPageToCanvas(pdfJsDoc, pageNum, canvas, scale);

        const dataUrl = canvas.toDataURL('image/png');
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        const padNum = String(pageNum).padStart(2, '0');
        zip.file(`${baseName}-page-${padNum}.png`, base64Data, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      PDFEngine.downloadBlob(zipBlob, `${baseName}-images.zip`, 'application/zip');
      UI.toast(`Exported ${pagesToExport.length} page images into ZIP!`, 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Error exporting images: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(exportBtn, false);
    }
  });
}
