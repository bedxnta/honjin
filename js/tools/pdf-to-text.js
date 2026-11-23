import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderPdfToTextTool(container) {
  let extractedText = '';
  let originalFilename = '';

  container.innerHTML = `
    <div id="drop-area"></div>

    <div id="text-workspace" style="display:none;">
      <div class="tool-options-panel">
        <div class="option-group">
          <div class="option-label">
            <span>Extracted Text</span>
            <button id="btn-copy-text" class="btn-subtle" style="margin:0; padding:0.25rem 0.75rem; font-size:0.75rem;">
              Copy to Clipboard
            </button>
          </div>
          <textarea id="text-output" class="option-input" style="height: 240px; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.6; resize: vertical; padding: 0.75rem;" readonly></textarea>
        </div>
      </div>

      <div class="action-bar">
        <button id="btn-change-file" class="btn-secondary">Choose another PDF</button>
        <button id="btn-download-txt" class="btn-primary">Download .txt File</button>
      </div>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const workspace = container.querySelector('#text-workspace');
  const textOutput = container.querySelector('#text-output');
  const copyBtn = container.querySelector('#btn-copy-text');
  const downloadBtn = container.querySelector('#btn-download-txt');
  const changeFileBtn = container.querySelector('#btn-change-file');

  const dropzone = UI.createDropzone({
    accept: '.pdf',
    multiple: false,
    title: 'Drop PDF to extract text',
    desc: 'Extract clean selectable text layer into readable plaintext',
    onFiles: async (files) => {
      const file = files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        UI.toast('Please select a valid PDF file.', 'error');
        return;
      }
      originalFilename = file.name;
      try {
        const bytes = await PDFEngine.readFileAsArrayBuffer(file);
        const pdf = await PDFEngine.loadPDFJSDoc(bytes);
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items.map(item => item.str);
          fullText += `--- PAGE ${i} ---\n` + pageStrings.join(' ') + '\n\n';
        }

        extractedText = fullText.trim();
        textOutput.value = extractedText;

        dropArea.style.display = 'none';
        workspace.style.display = 'block';
      } catch (err) {
        console.error(err);
        UI.toast('Failed to extract text: ' + err.message, 'error');
      }
    }
  });
  dropArea.appendChild(dropzone);

  changeFileBtn.addEventListener('click', () => {
    extractedText = '';
    textOutput.value = '';
    dropArea.style.display = 'block';
    workspace.style.display = 'none';
  });

  copyBtn.addEventListener('click', async () => {
    if (!extractedText) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      UI.toast('Text copied to clipboard!', 'success');
    } catch {
      textOutput.select();
      document.execCommand('copy');
      UI.toast('Text copied to clipboard!', 'success');
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!extractedText) return;
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    PDFEngine.downloadBlob(blob, `${baseName}-text.txt`, 'text/plain');
    UI.toast('Text file downloaded!', 'success');
  });
}
