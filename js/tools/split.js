import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderSplitTool(container) {
  let currentFile = null;
  let totalPages = 0;
  let pdfBytes = null;

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="split-workspace" style="display:none;">
      <div class="tool-options-panel">
        <div class="option-group">
          <label class="option-label">Split Mode</label>
          <div class="radio-pill-group" id="split-mode-group">
            <button class="radio-pill-btn active" data-mode="range">Extract Range into Single PDF</button>
            <button class="radio-pill-btn" data-mode="all">Split All Pages into ZIP Archive</button>
          </div>
        </div>

        <div class="option-group" id="range-input-group">
          <label class="option-label" for="page-range">
            <span>Page Range</span>
            <span class="file-meta" id="doc-meta-info">Total pages: 0</span>
          </label>
          <input type="text" id="page-range" class="option-input" placeholder="e.g. 1-3, 5, 8">
          <span class="dropzone-desc">Specify comma-separated page numbers or ranges (e.g. 1-3, 5).</span>
        </div>

        <div class="option-group">
          <label class="option-label" for="split-filename">Output Filename</label>
          <input type="text" id="split-filename" class="option-input" value="split-output.pdf">
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-split-exec" class="btn-primary">Execute Split</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const splitWorkspace = container.querySelector('#split-workspace');
  const rangeInputGroup = container.querySelector('#range-input-group');
  const modeGroup = container.querySelector('#split-mode-group');
  const pageRangeInput = container.querySelector('#page-range');
  const filenameInput = container.querySelector('#split-filename');
  const docMetaInfo = container.querySelector('#doc-meta-info');
  const execBtn = container.querySelector('#btn-split-exec');
  const changeFileBtn = container.querySelector('#btn-change-file');

  let activeMode = 'range';

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to split',
    desc: 'Select a document to extract pages or bundle into a zip archive',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      currentFile = file;
      try {
        pdfBytes = await PDFEngine.readFileAsArrayBuffer(file);
        const pdfDoc = await PDFEngine.loadPDFLibDoc(pdfBytes);
        totalPages = pdfDoc.getPageCount();

        docMetaInfo.textContent = `Document has ${totalPages} page${totalPages > 1 ? 's' : ''}`;
        pageRangeInput.placeholder = `e.g. 1-${Math.min(totalPages, 3)}`;
        pageRangeInput.value = `1-${totalPages}`;
        
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        filenameInput.value = `${baseName}-extracted.pdf`;

        dropArea.style.display = 'none';
        splitWorkspace.style.display = 'block';
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
    splitWorkspace.style.display = 'none';
  });

  modeGroup.querySelectorAll('.radio-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modeGroup.querySelectorAll('.radio-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.dataset.mode;

      if (activeMode === 'range') {
        rangeInputGroup.style.display = 'flex';
        filenameInput.value = filenameInput.value.replace(/\.zip$/i, '.pdf');
      } else {
        rangeInputGroup.style.display = 'none';
        filenameInput.value = filenameInput.value.replace(/\.pdf$/i, '.zip');
      }
    });
  });

  execBtn.addEventListener('click', async () => {
    if (!pdfBytes) return;

    try {
      UI.setButtonLoading(execBtn, true, 'Splitting...');
      const sourceDoc = await PDFEngine.loadPDFLibDoc(pdfBytes);

      if (activeMode === 'range') {
        const rangeText = pageRangeInput.value.trim();
        const selectedPages = PDFEngine.parsePageRange(rangeText, totalPages);

        if (selectedPages.length === 0) {
          UI.toast('Please specify at least one valid page number.', 'error');
          UI.setButtonLoading(execBtn, false);
          return;
        }

        const newDoc = await window.PDFLib.PDFDocument.create();
        // Convert 1-based page indices to 0-based
        const indices = selectedPages.map(p => p - 1);
        const copiedPages = await newDoc.copyPages(sourceDoc, indices);
        copiedPages.forEach(p => newDoc.addPage(p));

        const savedBytes = await newDoc.save();
        const outName = filenameInput.value.trim() || 'split-document.pdf';
        PDFEngine.downloadBlob(savedBytes, outName.endsWith('.pdf') ? outName : `${outName}.pdf`);
        UI.toast(`Extracted ${selectedPages.length} pages successfully!`, 'success');
        UI.closeDialog();
      } else {
        // Split all into ZIP
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
