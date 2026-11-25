/**
 * Honjin (本陣) - UI Utilities
 * Modal dialogs, toast notifications, drag-and-drop binding.
 */

export const UI = {
  dialog: null,
  dialogTitle: null,
  dialogDesc: null,
  dialogIcon: null,
  dialogBody: null,
  toastContainer: null,

  init() {
    this.dialog = document.getElementById('tool-dialog');
    this.dialogTitle = document.getElementById('dialog-title');
    this.dialogDesc = document.getElementById('dialog-desc');
    this.dialogIcon = document.getElementById('dialog-icon');
    this.dialogBody = document.getElementById('dialog-body');
    this.toastContainer = document.getElementById('toast-container');

    const closeBtn = document.getElementById('dialog-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDialog());
    }

    if (this.dialog) {
      // Prevent scrolling the background when wheeling over the backdrop
      this.dialog.addEventListener('wheel', (e) => {
        if (e.target === this.dialog) {
          e.preventDefault();
        }
      }, { passive: false });

      // Restore body scroll lock on native dialog close / cancel
      this.dialog.addEventListener('close', () => {
        document.body.classList.remove('modal-open');
        this.dialogBody.innerHTML = '';
      });
    }

    // Handle Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dialog && this.dialog.open) {
        this.closeDialog();
      }
    });
  },

  /**
   * Open the tool workspace modal
   */
  openDialog({ title, desc, iconSvg, renderContent }) {
    if (!this.dialog) this.init();

    this.dialogTitle.textContent = title;
    this.dialogDesc.textContent = desc;
    this.dialogIcon.innerHTML = iconSvg;
    this.dialogBody.innerHTML = '';

    renderContent(this.dialogBody);

    document.body.classList.add('modal-open');

    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute('open', '');
    }
  },

  /**
   * Close the tool workspace modal
   */
  closeDialog() {
    if (this.dialog) {
      document.body.classList.remove('modal-open');
      if (typeof this.dialog.close === 'function') {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
      }
      this.dialogBody.innerHTML = '';
    }
  },

  /**
   * Show a clean toast notification
   */
  toast(message, type = 'info', duration = 3500) {
    if (!this.toastContainer) this.init();

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    toastEl.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-msg">${message}</span>
    `;

    this.toastContainer.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.transition = 'opacity 200ms ease, transform 200ms ease';
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(8px)';
      setTimeout(() => toastEl.remove(), 250);
    }, duration);
  },

  /**
   * Create and bind a dropzone
   */
  createDropzone({ accept = '.pdf', multiple = false, title = 'Drop files here', desc = 'or click to browse from device', onFiles }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dropzone';
    wrapper.innerHTML = `
      <div class="dropzone-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div>
        <div class="dropzone-title">${title}</div>
        <div class="dropzone-desc">${desc}</div>
      </div>
      <input type="file" class="dropzone-input" accept="${accept}" ${multiple ? 'multiple' : ''}>
    `;

    const input = wrapper.querySelector('.dropzone-input');

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(Array.from(e.target.files));
      }
    });

    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      wrapper.classList.add('drag-over');
    });

    wrapper.addEventListener('dragleave', () => {
      wrapper.classList.remove('drag-over');
    });

    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFiles(Array.from(e.dataTransfer.files));
      }
    });

    return wrapper;
  },

  /**
   * Helper to toggle button loading state
   */
  setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
    if (isLoading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> <span>${loadingText}</span>`;
      btn.disabled = true;
    } else {
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
      }
      btn.disabled = false;
    }
  }
};
