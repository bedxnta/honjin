import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderDeletePagesTool(container) {
  let pdfBytes = null;
  let totalPages = 0;
  let originalFilename = '';

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="delete-workspace" style="display:none;">
      <div class="tool-options-panel">
        <div class="option-group">
          <label class="option-label" for="pages-to-delete">
            <span>Pages to Discard</span>
            <span class="file-meta" id="delete-doc-meta">Total pages: 0</span>
          </label>
          <input type="text" id="pages-to-delete" class="option-input" placeholder="e.g. 1, 3-5, 9">
          <span class="dropzone-desc">Enter page numbers or ranges you wish to permanently remove.</span>
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-delete-exec" class="btn-primary" style="background-color: var(--hanko-red);">
          Delete Pages & Save
        </button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#delete-workspace');
  const deleteInput = container.querySelector('#pages-to-delete');
  const metaLabel = container.querySelector('#delete-doc-meta');
  const deleteBtn = container.querySelector('#btn-delete-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to remove pages',
    desc: 'Specify pages to delete and produce a streamlined clean document',
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

        metaLabel.textContent = `Document has ${totalPages} page${totalPages > 1 ? 's' : ''}`;
        deleteInput.placeholder = `e.g. 1, ${totalPages}`;

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

  deleteBtn.addEventListener('click', async () => {
    if (!pdfBytes) return;

    try {
      const rawText = deleteInput.value.trim();
      const pagesToDelete = PDFEngine.parsePageRange(rawText, totalPages);

      if (pagesToDelete.length === 0) {
        UI.toast('Please enter valid page numbers to delete.', 'error');
        return;
      }

      if (pagesToDelete.length >= totalPages) {
        UI.toast('Cannot delete all pages of the document.', 'error');
        return;
      }

      UI.setButtonLoading(deleteBtn, true, 'Deleting pages...');
      const sourceDoc = await PDFEngine.loadPDFLibDoc(pdfBytes);
      const newDoc = await window.PDFLib.PDFDocument.create();

      const deleteSet = new Set(pagesToDelete);
      const pagesToKeep = [];
      for (let i = 1; i <= totalPages; i++) {
        if (!deleteSet.has(i)) {
          pagesToKeep.push(i - 1); // 0-based
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
