import { PDFEngine } from '../pdf-engine.js';
import { UI } from '../ui.js';

export function renderImagesToPdfTool(container) {
  let imageFiles = [];

  container.innerHTML = `
    <div id="drop-area"></div>
    <div id="image-list-container" class="file-list-wrap" style="display:none;"></div>

    <div id="options-panel" class="tool-options-panel" style="display:none;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="option-group">
          <label class="option-label" for="page-size-select">Page Size</label>
          <select id="page-size-select" class="option-select">
            <option value="a4">A4 (Standard)</option>
            <option value="letter">Letter</option>
            <option value="fit">Fit to Image Size</option>
          </select>
        </div>
        <div class="option-group">
          <label class="option-label" for="margin-select">Margin</label>
          <select id="margin-select" class="option-select">
            <option value="none">None (0pt)</option>
            <option value="normal" selected>Normal (36pt / 0.5")</option>
            <option value="large">Large (72pt / 1")</option>
          </select>
        </div>
      </div>

      <div class="option-group">
        <label class="option-label" for="out-filename">Output Filename</label>
        <input type="text" id="out-filename" class="option-input" value="images-converted.pdf">
      </div>
    </div>

    <div class="action-bar" style="display:none;" id="action-bar">
      <span class="organizer-info" id="img-count-info">0 images ready</span>
      <button id="btn-convert-exec" class="btn-primary">Create PDF</button>
    </div>
  `;

  const dropArea = container.querySelector('#drop-area');
  const listContainer = container.querySelector('#image-list-container');
  const optionsPanel = container.querySelector('#options-panel');
  const actionBar = container.querySelector('#action-bar');
  const countInfo = container.querySelector('#img-count-info');
  const pageSizeSelect = container.querySelector('#page-size-select');
  const marginSelect = container.querySelector('#margin-select');
  const filenameInput = container.querySelector('#out-filename');
  const convertBtn = container.querySelector('#btn-convert-exec');

  const dropzone = UI.createDropzone({
    accept: 'image/png,image/jpeg,image/webp',
    multiple: true,
    title: 'Drop image files here',
    desc: 'Select PNG, JPG, or WebP images to bind into a PDF document',
    onFiles: (files) => {
      const valid = files.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name));
      if (valid.length === 0) {
        UI.toast('Please select valid image files (PNG, JPG, WebP).', 'error');
        return;
      }
      imageFiles = [...imageFiles, ...valid];
      renderList();
    }
  });
  dropArea.appendChild(dropzone);

  function renderList() {
    if (imageFiles.length === 0) {
      listContainer.style.display = 'none';
      optionsPanel.style.display = 'none';
      actionBar.style.display = 'none';
      return;
    }

    listContainer.style.display = 'flex';
    optionsPanel.style.display = 'flex';
    actionBar.style.display = 'flex';
    countInfo.textContent = `${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} ready`;

    listContainer.innerHTML = imageFiles.map((file, idx) => `
      <div class="file-item" data-index="${idx}">
        <div class="file-info">
          <div class="file-badge-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </div>
          <div>
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">${PDFEngine.formatBytes(file.size)}</div>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn-mini btn-move-up" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
          <button class="btn-mini btn-move-down" ${idx === imageFiles.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
          <button class="btn-mini btn-remove" title="Remove">✕</button>
        </div>
      </div>
    `).join('');

    listContainer.querySelectorAll('.file-item').forEach(item => {
      const idx = parseInt(item.dataset.index, 10);
      item.querySelector('.btn-move-up')?.addEventListener('click', () => {
        if (idx > 0) {
          const temp = imageFiles[idx];
          imageFiles[idx] = imageFiles[idx - 1];
          imageFiles[idx - 1] = temp;
          renderList();
        }
      });
      item.querySelector('.btn-move-down')?.addEventListener('click', () => {
        if (idx < imageFiles.length - 1) {
          const temp = imageFiles[idx];
          imageFiles[idx] = imageFiles[idx + 1];
          imageFiles[idx + 1] = temp;
          renderList();
        }
      });
      item.querySelector('.btn-remove')?.addEventListener('click', () => {
        imageFiles.splice(idx, 1);
        renderList();
      });
    });
  }

  convertBtn.addEventListener('click', async () => {
    if (imageFiles.length === 0) return;

    try {
      UI.setButtonLoading(convertBtn, true, 'Creating PDF...');
      const pdfDoc = await window.PDFLib.PDFDocument.create();

      const PAGE_SIZES = {
        a4: [595.28, 841.89],
        letter: [612.0, 792.0]
      };

      const MARGINS = {
        none: 0,
        normal: 36,
        large: 72
      };

      const margin = MARGINS[marginSelect.value] || 0;

      for (const file of imageFiles) {
        const buffer = await PDFEngine.readFileAsArrayBuffer(file);
        let embeddedImage;

        if (file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name)) {
          embeddedImage = await pdfDoc.embedJpg(buffer);
        } else {
          // If PNG or WebP, convert to standard PNG data URL via canvas
          const imgUrl = await PDFEngine.readFileAsDataURL(file);
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imgUrl;
          });

          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const pngUrl = c.toDataURL('image/png');
          const pngBytes = await fetch(pngUrl).then(r => r.arrayBuffer());
          embeddedImage = await pdfDoc.embedPng(pngBytes);
        }

        const imgWidth = embeddedImage.width;
        const imgHeight = embeddedImage.height;

        let pageWidth, pageHeight;
        if (pageSizeSelect.value === 'fit') {
          pageWidth = imgWidth + margin * 2;
          pageHeight = imgHeight + margin * 2;
        } else {
          [pageWidth, pageHeight] = PAGE_SIZES[pageSizeSelect.value];
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        const availableWidth = pageWidth - margin * 2;
        const availableHeight = pageHeight - margin * 2;
        const scale = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);

        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        const x = margin + (availableWidth - scaledWidth) / 2;
        const y = margin + (availableHeight - scaledHeight) / 2;

        page.drawImage(embeddedImage, {
          x,
          y,
          width: scaledWidth,
          height: scaledHeight
        });
      }

      const pdfBytes = await pdfDoc.save();
      const outName = filenameInput.value.trim() || 'converted-images.pdf';
      PDFEngine.downloadBlob(pdfBytes, outName.endsWith('.pdf') ? outName : `${outName}.pdf`);
      UI.toast(`Created PDF from ${imageFiles.length} images!`, 'success');
      UI.closeDialog();
    } catch (err) {
      console.error(err);
      UI.toast('Failed to create PDF: ' + err.message, 'error');
    } finally {
      UI.setButtonLoading(convertBtn, false);
    }
  });
}
