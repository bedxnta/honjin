import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderMergeTool(container) {
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
      <button id="btn-merge-exec" class="btn-primary">
        Merge PDFs
      </button>
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

    // Attach event listeners
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
