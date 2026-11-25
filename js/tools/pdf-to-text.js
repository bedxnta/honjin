import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderPdfToTextTool(container) {
  let pdfDoc = null;
  let originalFilename = '';
  let pagesData = []; // Array of { pageNum, text, lines, charCount, isScanned, isOcrDone, isOcrRunning, ocrProgress }
  let activeView = 'document'; // 'document' | 'raw'
  let searchQuery = '';

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="text-workspace" style="display:none;" class="doc-text-wrapper">
      <!-- Document Controls Toolbar -->
      <div class="doc-text-toolbar">
        <div class="doc-toolbar-left">
          <div class="doc-search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="doc-search-input" class="doc-search-input" placeholder="Search in document...">
            <button id="doc-search-clear" class="doc-search-clear" aria-label="Clear search">✕</button>
          </div>
          <span id="doc-stat-pages" class="doc-stat-pill"><strong>0</strong> Pages</span>
          <span id="doc-stat-words" class="doc-stat-pill"><strong>0</strong> Words</span>
          <span id="doc-stat-scanned" class="doc-stat-pill" style="display:none; color:#f59e0b; border-color:rgba(245, 158, 11, 0.3);">
            <strong>0</strong> Scanned
          </span>
          <span id="doc-search-matches" class="doc-stat-pill" style="display:none; color:var(--hanko-red);">
            <strong>0</strong> Matches
          </span>
        </div>

        <div class="doc-toolbar-right">
          <div class="doc-view-toggle">
            <button id="btn-view-doc" class="doc-view-btn active" title="Document Paper View">
              📄 Paper View
            </button>
            <button id="btn-view-raw" class="doc-view-btn" title="Raw Plaintext Stream">
              💻 Plain Text
            </button>
          </div>
          <button id="btn-ocr-all" class="btn-sheet-mini btn-ocr-highlight" style="display:none;">
            ✨ OCR All Pages
          </button>
          <button id="btn-copy-all" class="btn-sheet-mini" title="Copy all document text">
            📋 Copy All
          </button>
          <button id="btn-download-txt" class="btn-sheet-mini" title="Download as .txt">
            ⬇ .txt
          </button>
          <button id="btn-download-md" class="btn-sheet-mini" title="Download formatted .md">
            ⬇ .md
          </button>
          <button id="btn-download-docx" class="btn-sheet-mini" title="Download Word document (.docx)">
            ⬇ .docx
          </button>
          <button id="btn-change-file" class="btn-sheet-mini" title="Choose another PDF">
            ✕ Close
          </button>
        </div>
      </div>

      <!-- Document Paper View Container -->
      <div id="doc-sheets-container" class="doc-sheets-container"></div>

      <!-- Raw Stream Textarea Container -->
      <div id="doc-raw-container" class="doc-raw-container">
        <textarea id="doc-raw-textarea" class="doc-raw-textarea" placeholder="Extracted plaintext will appear here..." readonly></textarea>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#text-workspace');
  const sheetsContainer = container.querySelector('#doc-sheets-container');
  const rawContainer = container.querySelector('#doc-raw-container');
  const rawTextarea = container.querySelector('#doc-raw-textarea');
  const searchInput = container.querySelector('#doc-search-input');
  const searchClear = container.querySelector('#doc-search-clear');
  const statPages = container.querySelector('#doc-stat-pages');
  const statWords = container.querySelector('#doc-stat-words');
  const statScanned = container.querySelector('#doc-stat-scanned');
  const statMatches = container.querySelector('#doc-search-matches');
  const btnViewDoc = container.querySelector('#btn-view-doc');
  const btnViewRaw = container.querySelector('#btn-view-raw');
  const btnOcrAll = container.querySelector('#btn-ocr-all');
  const btnCopyAll = container.querySelector('#btn-copy-all');
  const btnDownloadTxt = container.querySelector('#btn-download-txt');
  const btnDownloadMd = container.querySelector('#btn-download-md');
  const btnDownloadDocx = container.querySelector('#btn-download-docx');
  const changeFileBtn = container.querySelector('#btn-change-file');

  function getFullDocumentText(format = 'txt') {
    if (pagesData.length === 0) return '';
    if (format === 'md') {
      return pagesData.map(p => `## Page ${p.pageNum}\n\n${p.text || '*(Empty page)*'}`).join('\n\n---\n\n');
    }
    return pagesData.map(p => `--- PAGE ${p.pageNum} ---\n${p.text}`).join('\n\n');
  }

  function updateStats() {
    statPages.innerHTML = `<strong>${pagesData.length}</strong> ${pagesData.length === 1 ? 'Page' : 'Pages'}`;
    const allText = pagesData.map(p => p.text).join(' ');
    const words = allText.trim() ? allText.trim().split(/\s+/).length : 0;
    statWords.innerHTML = `<strong>${words.toLocaleString()}</strong> Words`;

    const scannedCount = pagesData.filter(p => p.isScanned && !p.isOcrDone).length;
    if (scannedCount > 0) {
      statScanned.style.display = 'inline-flex';
      statScanned.innerHTML = `<strong>${scannedCount}</strong> Scanned`;
      btnOcrAll.style.display = 'inline-flex';
      btnOcrAll.textContent = `✨ OCR ${scannedCount} Scanned ${scannedCount === 1 ? 'Page' : 'Pages'}`;
    } else {
      statScanned.style.display = 'none';
      btnOcrAll.style.display = 'none';
    }

    rawTextarea.value = getFullDocumentText('txt');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSheetText(text, query) {
    if (!text || !text.trim()) {
      return '<span style="color:var(--ink-muted); font-style:italic;">(No selectable text on this page)</span>';
    }
    const safe = escapeHtml(text);
    if (!query || !query.trim()) return safe;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return safe.replace(regex, '<mark class="doc-search-match">$1</mark>');
  }

  function renderSheetDom(p) {
    const sheet = document.createElement('div');
    sheet.className = 'doc-paper-sheet';
    sheet.id = `doc-sheet-${p.pageNum}`;

    let statusBadge = '<span class="doc-tag-badge tag-ready">Text Extracted</span>';
    if (p.isOcrDone) {
      statusBadge = '<span class="doc-tag-badge tag-ocr">✨ OCR Extracted</span>';
    } else if (p.isScanned) {
      statusBadge = '<span class="doc-tag-badge tag-scanned">⚠ Scanned Image</span>';
    }

    const ocrBtnVisible = (!p.isOcrDone) ? '' : 'style="display:none;"';

    sheet.innerHTML = `
      <div class="doc-sheet-header">
        <div class="doc-sheet-badge-group">
          <span class="doc-page-badge">Page ${p.pageNum} of ${pagesData.length}</span>
          ${statusBadge}
        </div>
        <div class="doc-sheet-actions">
          <button class="btn-sheet-mini btn-page-copy" data-page="${p.pageNum}">
            📋 Copy Page
          </button>
          <button class="btn-sheet-mini btn-ocr-highlight btn-page-ocr" data-page="${p.pageNum}" ${ocrBtnVisible}>
            ✨ Run OCR
          </button>
        </div>
      </div>

      <div class="ocr-progress-box-wrapper" style="padding: 0 1.25rem;"></div>

      ${(p.isScanned && !p.isOcrDone && !p.isOcrRunning && (!p.text || p.text.length < 25)) ? `
        <div class="doc-scanned-notice">
          <div class="doc-scanned-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <div>
              <strong>Scanned Page Detected (Image Only)</strong>
              <div style="font-size:0.75rem; color:var(--ink-secondary);">Run on-device OCR to read and extract text from this page.</div>
            </div>
          </div>
          <button class="btn-sheet-mini btn-ocr-highlight btn-page-ocr" data-page="${p.pageNum}">
            ✨ Extract Text via OCR
          </button>
        </div>
      ` : ''}

      <div class="doc-sheet-body" id="doc-sheet-body-${p.pageNum}">${formatSheetText(p.text, searchQuery)}</div>
    `;

    const copyBtn = sheet.querySelector('.btn-page-copy');
    copyBtn.addEventListener('click', async () => {
      if (!p.text) {
        UI.toast('No text to copy on this page.', 'info');
        return;
      }
      try {
        await navigator.clipboard.writeText(p.text);
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Page'; }, 2000);
        UI.toast(`Page ${p.pageNum} text copied!`, 'success');
      } catch {
        UI.toast('Failed to copy to clipboard', 'error');
      }
    });

    sheet.querySelectorAll('.btn-page-ocr').forEach(btn => {
      btn.addEventListener('click', () => runOcrForPage(p.pageNum));
    });

    return sheet;
  }

  function renderAllSheets() {
    sheetsContainer.innerHTML = '';
    pagesData.forEach(p => {
      sheetsContainer.appendChild(renderSheetDom(p));
    });
    applySearchFilter();
  }

  async function runOcrForPage(pageNum) {
    const pageData = pagesData.find(p => p.pageNum === pageNum);
    if (!pageData || pageData.isOcrRunning) return;

    const sheetElem = document.getElementById(`doc-sheet-${pageNum}`);
    if (!sheetElem) return;

    const progressWrapper = sheetElem.querySelector('.ocr-progress-box-wrapper');
    progressWrapper.innerHTML = `
      <div class="ocr-progress-container">
        <div class="ocr-progress-bar">
          <div class="ocr-progress-fill" id="ocr-fill-${pageNum}" style="width: 5%;"></div>
        </div>
        <span class="ocr-progress-label" id="ocr-label-${pageNum}">0%</span>
      </div>
    `;

    pageData.isOcrRunning = true;
    const ocrBtns = sheetElem.querySelectorAll('.btn-page-ocr');
    ocrBtns.forEach(b => {
      b.disabled = true;
      b.textContent = '⏳ Processing...';
    });

    try {
      UI.toast(`Running OCR on Page ${pageNum}...`, 'info');
      const ocrResult = await PDFEngine.ocrPageToText(pdfDoc, pageNum, (pct) => {
        const fill = document.getElementById(`ocr-fill-${pageNum}`);
        const label = document.getElementById(`ocr-label-${pageNum}`);
        if (fill) fill.style.width = `${pct}%`;
        if (label) label.textContent = `${pct}%`;
      });

      pageData.text = ocrResult.text;
      pageData.charCount = ocrResult.text.length;
      pageData.isScanned = false;
      pageData.isOcrDone = true;
      pageData.isOcrRunning = false;

      const updatedSheet = renderSheetDom(pageData);
      sheetElem.replaceWith(updatedSheet);

      updateStats();
      UI.toast(`Page ${pageNum} OCR completed (${ocrResult.confidence}% confidence)!`, 'success');
    } catch (err) {
      console.error(err);
      pageData.isOcrRunning = false;
      progressWrapper.innerHTML = '';
      ocrBtns.forEach(b => {
        b.disabled = false;
        b.textContent = '✨ Run OCR';
      });
      UI.toast(`OCR failed for Page ${pageNum}: ` + err.message, 'error');
    }
  }

  async function runOcrAllScanned() {
    const scannedPages = pagesData.filter(p => p.isScanned && !p.isOcrDone);
    if (scannedPages.length === 0) {
      UI.toast('No scanned pages need OCR.', 'info');
      return;
    }

    btnOcrAll.disabled = true;
    UI.toast(`Starting batch OCR on ${scannedPages.length} scanned pages...`, 'info');

    for (let i = 0; i < scannedPages.length; i++) {
      const p = scannedPages[i];
      btnOcrAll.textContent = `⏳ Running OCR (${i + 1}/${scannedPages.length})...`;
      await runOcrForPage(p.pageNum);
    }

    btnOcrAll.disabled = false;
    updateStats();
    UI.toast('All scanned pages processed with OCR!', 'success');
  }

  function applySearchFilter() {
    searchQuery = (searchInput.value || '').trim();
    if (searchQuery) {
      searchClear.style.display = 'inline-flex';
    } else {
      searchClear.style.display = 'none';
      statMatches.style.display = 'none';
    }

    let totalMatches = 0;
    pagesData.forEach(p => {
      const body = document.getElementById(`doc-sheet-body-${p.pageNum}`);
      if (body) {
        body.innerHTML = formatSheetText(p.text, searchQuery);
      }
      if (searchQuery && p.text) {
        const matches = p.text.match(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
        if (matches) totalMatches += matches.length;
      }
    });

    if (searchQuery) {
      statMatches.style.display = 'inline-flex';
      statMatches.innerHTML = `<strong>${totalMatches}</strong> ${totalMatches === 1 ? 'Match' : 'Matches'}`;
      if (totalMatches > 0) {
        const firstMatch = sheetsContainer.querySelector('mark.doc-search-match');
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  searchInput.addEventListener('input', applySearchFilter);
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    applySearchFilter();
    searchInput.focus();
  });

  btnViewDoc.addEventListener('click', () => {
    activeView = 'document';
    btnViewDoc.classList.add('active');
    btnViewRaw.classList.remove('active');
    sheetsContainer.style.display = 'flex';
    rawContainer.style.display = 'none';
  });

  btnViewRaw.addEventListener('click', () => {
    activeView = 'raw';
    btnViewRaw.classList.add('active');
    btnViewDoc.classList.remove('active');
    sheetsContainer.style.display = 'none';
    rawContainer.style.display = 'flex';
    rawTextarea.value = getFullDocumentText('txt');
  });

  btnOcrAll.addEventListener('click', runOcrAllScanned);

  btnCopyAll.addEventListener('click', async () => {
    const fullText = getFullDocumentText('txt');
    if (!fullText) {
      UI.toast('No text available to copy.', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(fullText);
      btnCopyAll.textContent = '✓ Copied All!';
      setTimeout(() => { btnCopyAll.textContent = '📋 Copy All'; }, 2000);
      UI.toast('All document text copied to clipboard!', 'success');
    } catch {
      rawTextarea.select();
      document.execCommand('copy');
      UI.toast('All document text copied to clipboard!', 'success');
    }
  });

  btnDownloadTxt.addEventListener('click', () => {
    const fullText = getFullDocumentText('txt');
    if (!fullText) return;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    PDFEngine.downloadBlob(blob, `${baseName}-text.txt`, 'text/plain');
    UI.toast('Text document (.txt) downloaded!', 'success');
  });

  btnDownloadMd.addEventListener('click', () => {
    const fullMd = getFullDocumentText('md');
    if (!fullMd) return;
    const blob = new Blob([fullMd], { type: 'text/markdown;charset=utf-8' });
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    PDFEngine.downloadBlob(blob, `${baseName}-document.md`, 'text/markdown');
    UI.toast('Markdown document (.md) downloaded!', 'success');
  });

  btnDownloadDocx.addEventListener('click', async () => {
    if (pagesData.length === 0) return;
    try {
      UI.setButtonLoading(btnDownloadDocx, true, 'Generating...');
      const docxBlob = await PDFEngine.generateDocxBlob(pagesData);
      const baseName = originalFilename.replace(/\.[^/.]+$/, '');
      PDFEngine.downloadBlob(docxBlob, `${baseName}-document.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      UI.toast('Word document (.docx) downloaded!', 'success');
    } catch (err) {
      console.error(err);
      UI.toast('Failed to generate .docx: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(btnDownloadDocx, false);
      btnDownloadDocx.innerHTML = '⬇ .docx';
    }
  });

  changeFileBtn.addEventListener('click', () => {
    pdfDoc = null;
    pagesData = [];
    searchQuery = '';
    searchInput.value = '';
    rawTextarea.value = '';
    sheetsContainer.innerHTML = '';
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to extract document text',
    desc: 'Extract clean formatted layout with on-device OCR for scanned pages',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      originalFilename = file.name;
      try {
        UI.toast('Loading and analyzing PDF structure...', 'info');
        const bytes = await PDFEngine.readFileAsArrayBuffer(file);
        pdfDoc = await PDFEngine.loadPDFJSDoc(bytes);
        pagesData = [];

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const layout = await PDFEngine.extractPageLayoutText(page);
          pagesData.push({
            pageNum: i,
            text: layout.text,
            lines: layout.lines,
            charCount: layout.charCount,
            isScanned: layout.isScanned,
            isOcrDone: false,
            isOcrRunning: false,
            ocrProgress: 0
          });
        }

        updateStats();
        renderAllSheets();

        dropArea.style.display = 'none';
        workspace.style.display = 'flex';
        UI.toast(`Extracted ${pagesData.length} ${pagesData.length === 1 ? 'page' : 'pages'} with spatial layout!`, 'success');
      } catch (err) {
        console.error(err);
        UI.toast('Failed to analyze PDF: ' + err.message, 'error');
      }
    }
  });

  dropArea.appendChild(dropzone);
}
