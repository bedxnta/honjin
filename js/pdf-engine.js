/**
 * Honjin (本陣) - Core PDF Engine
 * Abstractions for PDF-Lib, PDF.js, and JSZip.
 */

// Configure PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export const PDFEngine = {
  /**
   * Read File as ArrayBuffer
   */
  async readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Read File as Data URL (Base64)
   */
  async readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as DataURL'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Read File as Text
   */
  async readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as text'));
      reader.readAsText(file);
    });
  },

  /**
   * Load PDF-Lib Document
   */
  async loadPDFLibDoc(bytes) {
    if (!window.PDFLib) throw new Error('PDFLib library not loaded');
    let buffer;
    if (bytes instanceof ArrayBuffer) {
      buffer = bytes.slice(0);
    } else if (ArrayBuffer.isView(bytes)) {
      buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } else {
      buffer = bytes;
    }
    return await window.PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
  },

  /**
   * Load PDF.js Document
   */
  async loadPDFJSDoc(bytes) {
    if (!window.pdfjsLib) throw new Error('PDF.js library not loaded');
    let data;
    if (bytes instanceof ArrayBuffer) {
      data = new Uint8Array(bytes.slice(0));
    } else if (ArrayBuffer.isView(bytes)) {
      data = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } else {
      data = bytes;
    }
    const loadingTask = window.pdfjsLib.getDocument({ data });
    return await loadingTask.promise;
  },

  /**
   * Render a PDF page onto an HTML5 Canvas (high DPI support)
   */
  async renderPageToCanvas(pdfDoc, pageNumber, canvas, scale = 1.0) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext('2d');

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    const renderContext = {
      canvasContext: ctx,
      transform: transform,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    return canvas;
  },

  /**
   * Trigger direct browser download from Blob / Uint8Array
   */
  downloadBlob(data, filename, mimeType = 'application/pdf') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  /**
   * Format bytes to readable string (e.g. 1.2 MB)
   */
  formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * Parse user range string like "1, 3-5, 8" into 1-based page numbers
   */
  parsePageRange(rangeStr, maxPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let i = from; i <= to; i++) {
            pages.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= maxPages) {
          pages.add(num);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }
};
