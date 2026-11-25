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
  },

  /**
   * Reconstruct clean spatial text layout from a PDF.js page
   * Preserves horizontal gaps, columns, indentations, and vertical paragraph breaks.
   */
  async extractPageLayoutText(page) {
    const textContent = await page.getTextContent({ normalizeWhitespace: false });
    const items = textContent.items.filter(item => item.str && item.str.trim().length > 0);
    
    if (items.length === 0) {
      return { text: '', lines: [], charCount: 0, isScanned: true };
    }

    // Sort items vertically (descending Y from top to bottom)
    const sorted = [...items].sort((a, b) => {
      const yA = a.transform[5];
      const yB = b.transform[5];
      if (Math.abs(yA - yB) > 3.5) {
        return yB - yA; // top first
      }
      return a.transform[4] - b.transform[4]; // left to right
    });

    // Group items into horizontal lines
    const lineBuckets = [];
    for (const item of sorted) {
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width || 0;
      const height = item.height || Math.abs(item.transform[0]) || 12;

      let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= Math.max(3.5, height * 0.4));
      if (!bucket) {
        bucket = { y, height, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ x, y, width, height, str: item.str });
    }

    // Sort buckets vertically (top to bottom)
    lineBuckets.sort((a, b) => b.y - a.y);

    const formattedLines = [];
    let avgLineHeight = 12;
    if (lineBuckets.length > 0) {
      const totalH = lineBuckets.reduce((acc, b) => acc + (b.height || 12), 0);
      avgLineHeight = totalH / lineBuckets.length;
    }

    for (let i = 0; i < lineBuckets.length; i++) {
      const bucket = lineBuckets[i];
      // Sort items within line from left to right
      bucket.items.sort((a, b) => a.x - b.x);

      let lineText = '';
      let prevEnd = null;

      for (const item of bucket.items) {
        if (prevEnd !== null) {
          const gap = item.x - prevEnd;
          if (gap > 24) {
            lineText += '    ';
          } else if (gap > 3.5 && !lineText.endsWith(' ') && !item.str.startsWith(' ')) {
            lineText += ' ';
          }
        }
        lineText += item.str;
        prevEnd = item.x + item.width;
      }

      lineText = lineText.trimEnd();
      if (!lineText) continue;

      let isParagraphBreak = false;
      if (i > 0) {
        const prevBucket = lineBuckets[i - 1];
        const vGap = prevBucket.y - bucket.y;
        if (vGap > avgLineHeight * 1.65) {
          isParagraphBreak = true;
        }
      }

      formattedLines.push({
        y: bucket.y,
        text: lineText,
        isParagraphBreak
      });
    }

    let fullText = '';
    for (let i = 0; i < formattedLines.length; i++) {
      const line = formattedLines[i];
      if (i > 0) {
        fullText += line.isParagraphBreak ? '\n\n' : '\n';
      }
      fullText += line.text;
    }

    const charCount = fullText.trim().length;
    return {
      text: fullText,
      lines: formattedLines,
      charCount,
      isScanned: charCount < 20
    };
  },

  /**
   * On-device OCR using Tesseract.js WebAssembly
   */
  async ocrPageToText(pdfDoc, pageNumber, onProgress) {
    if (!window.Tesseract) {
      throw new Error('Tesseract.js OCR engine is not loaded. Please check your internet connection or reload.');
    }
    const canvas = document.createElement('canvas');
    await PDFEngine.renderPageToCanvas(pdfDoc, pageNumber, canvas, 2.0);

    const result = await window.Tesseract.recognize(canvas, 'eng', {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text') {
          onProgress(Math.round((m.progress || 0) * 100));
        }
      }
    });

    const ocrText = (result.data && result.data.text) ? result.data.text.trim() : '';
    return {
      text: ocrText,
      confidence: result.data ? Math.round(result.data.confidence) : 0
    };
  },

  /**
   * Generate a standard Microsoft Word (.docx) file from extracted pages
   * Uses window.JSZip to build valid OpenXML archive client-side.
   */
  async generateDocxBlob(pagesData) {
    if (!window.JSZip) throw new Error('JSZip library not available');

    const zip = new window.JSZip();

    // 1. [Content_Types].xml
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    zip.file('[Content_Types].xml', contentTypesXml);

    // 2. _rels/.rels
    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
    zip.file('_rels/.rels', rootRelsXml);

    // 3. word/document.xml
    function escapeXml(unsafe) {
      return (unsafe || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    let bodyXml = '';
    pagesData.forEach((p, idx) => {
      // Page Heading
      bodyXml += `<w:p>
        <w:pPr>
          <w:spacing w:before="240" w:after="120"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
            <w:b/>
            <w:sz w:val="28"/>
            <w:color w:val="0F172A"/>
          </w:rPr>
          <w:t>Page ${p.pageNum}</w:t>
        </w:r>
      </w:p>`;

      const paragraphs = (p.text || '').split(/\n\n+/);
      paragraphs.forEach((para) => {
        const trimmed = para.trim();
        if (!trimmed) return;
        bodyXml += `<w:p>
          <w:pPr>
            <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
          </w:pPr>`;
        const lines = trimmed.split(/\n/);
        lines.forEach((line, lIdx) => {
          if (lIdx > 0) {
            bodyXml += `<w:r><w:br/></w:r>`;
          }
          bodyXml += `<w:r>
            <w:rPr>
              <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
              <w:sz w:val="22"/>
              <w:color w:val="1E293B"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(line)}</w:t>
          </w:r>`;
        });
        bodyXml += `</w:p>`;
      });

      // Page break if not last page
      if (idx < pagesData.length - 1) {
        bodyXml += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      }
    });

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
  }
};
