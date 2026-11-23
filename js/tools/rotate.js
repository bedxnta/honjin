import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderRotateTool(container) {
  let pdfBytes = null;
  let originalFilename = '';

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="rotate-workspace" style="display:none;">
      <div class="tool-options-panel">
        <div class="option-group">
          <label class="option-label">Rotation Angle</label>
          <div class="radio-pill-group" id="angle-group">
            <button class="radio-pill-btn active" data-angle="90">90° Clockwise</button>
            <button class="radio-pill-btn" data-angle="180">180° Invert</button>
            <button class="radio-pill-btn" data-angle="270">270° (90° Counter)</button>
          </div>
        </div>

        <div class="option-group">
          <label class="option-label" for="rotate-scope">Apply To</label>
          <select id="rotate-scope" class="option-select">
            <option value="all">All Pages</option>
            <option value="odd">Odd Pages Only (1, 3, 5...)</option>
            <option value="even">Even Pages Only (2, 4, 6...)</option>
          </select>
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-rotate-exec" class="btn-primary">Rotate & Download</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#rotate-workspace');
  const angleGroup = container.querySelector('#angle-group');
  const scopeSelect = container.querySelector('#rotate-scope');
  const rotateBtn = container.querySelector('#btn-rotate-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  let selectedAngle = 90;

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to rotate',
    desc: 'Rotate orientation for all or specific pages',
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

  angleGroup.querySelectorAll('.radio-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      angleGroup.querySelectorAll('.radio-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAngle = parseInt(btn.dataset.angle, 10);
    });
  });

  rotateBtn.addEventListener('click', async () => {
    if (!pdfBytes) return;

    try {
      UI.setButtonLoading(rotateBtn, true, 'Rotating pages...');
      const pdfDoc = await PDFEngine.loadPDFLibDoc(pdfBytes);
      const pages = pdfDoc.getPages();
      const scope = scopeSelect.value;

      pages.forEach((page, index) => {
        const pageNum = index + 1;
        let shouldRotate = false;
        if (scope === 'all') shouldRotate = true;
        else if (scope === 'odd' && pageNum % 2 !== 0) shouldRotate = true;
        else if (scope === 'even' && pageNum % 2 === 0) shouldRotate = true;

        if (shouldRotate) {
          const currentRot = page.getRotation().angle;
          page.setRotation(window.PDFLib.degrees((currentRot + selectedAngle) % 360));
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
