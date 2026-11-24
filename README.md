# 本 Honjin — Minimalist PDF Toolkit

> Fast, private, client-side PDF utility suite with zero server uploads.

![Honjin Banner](https://raw.githubusercontent.com/bedantad/honjin/main/screenshot.png) *(Optional banner placeholder)*

Honjin (本陣) is a pure, client-side document toolkit built with tactile engineering restraint. Every document operation runs directly inside your browser using WebAssembly and Web APIs (`pdf-lib`, `PDF.js`, and HTML5 Canvas)—your sensitive files never touch any external server.

---

## Features & Included Tools

| Category | Tools Included | Description |
| :--- | :--- | :--- |
| **Organize** | **Organize Pages** | Live thumbnail drag-and-drop reordering, quick rotation, and page removal. |
| | **Rotate PDF** | Visual orientation grid with individual and batch ($90^\circ, 180^\circ, 270^\circ$) rotation. |
| | **Delete Pages** | Interactive visual grid to select and discard unwanted pages. |
| **Edit & Sign**| **Sign PDF** | Smooth canvas signature pad with ink options (Black, Blue, Red, Pencil), typed signatures, and placement stage. |
| | **Crop & Trim Margins** | Interactive visual box drag-handles and preset margin trimming with live multi-page preview. |
| | **Watermark PDF** | Diagonal/horizontal text watermark with live opacity, angle, and color preview. |
| **Convert** | **Images to PDF** | Merge JPG, PNG, WebP images into a formatted PDF with drag reordering. |
| | **PDF to Images** | High-resolution page export to PNG/JPEG with zip download. |
| | **PDF to Text** | Client-side text extraction using PDF.js text layer. |
| **Page Tools**| **Merge PDF** | Combine multiple documents into one in customizable order. |
| | **Split PDF** | Visual thumbnail selector or custom page range extractor. |
| | **Page Numbers** | Dynamic page numbering with live placement, style, and cover-skip options. |

---

## Architectural Highlights

- **100% On-Device & Zero Uploads:** All processing executes client-side. Works offline and protects document privacy.
- **Zero-Build Stack:** Vanilla HTML5, modern CSS3 with custom design tokens, and ES6 JavaScript. No bundlers or Node.js required to run.
- **Linear / Raycast Aesthetic:** Obsidian dark-mode first design system (`#09090b`), frosted glass navigation, micro-borders, and interactive keyboard command shortcuts (`/`).
- **Responsive & Accessible:** Works on mobile and desktop screens with full touch support for canvas tools.

---

## Getting Started

Because Honjin requires zero build steps, you can run it immediately with any static file server:

```bash
# Python 3
python -m http.server 8080

# Or Node.js
npx serve .
```

Open `http://localhost:8080` in your web browser.

---

## Author

Crafted by **[bedanta.space](https://bedanta.space)**.

---

## License

MIT License. Feel free to use, modify, and distribute.
