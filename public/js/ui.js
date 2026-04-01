(function () {
  const FLASH_KEY = 'greenleaf:flash';
  const DIALOG_ID = 'greenleaf-dialog-title';

  const state = {
    toastStack: null,
    dialogHost: null,
    backdrop: null,
    activeDialog: null
  };

  const motion = () => {
    const candidate = window.Motion;
    if (candidate && typeof candidate.animate === 'function') return candidate;
    return null;
  };

  const ensureRoots = () => {
    if (!state.toastStack) {
      const stack = document.createElement('div');
      stack.className = 'gl-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'true');
      document.body.appendChild(stack);
      state.toastStack = stack;
    }

    if (!state.dialogHost) {
      const host = document.createElement('div');
      host.className = 'gl-dialog-host';
      document.body.appendChild(host);
      state.dialogHost = host;
    }
  };

  const animateIn = (target, keyframes, options) => {
    const animator = motion();
    if (!animator) return null;
    return animator.animate(target, keyframes, options);
  };

  const animateOut = (target, keyframes, options) => {
    const animator = motion();
    if (!animator) return null;
    return animator.animate(target, keyframes, options);
  };

  const removeToast = (toast) => {
    if (!toast || !toast.parentNode) return;

    const finish = () => toast.remove();
    const animation = animateOut(
      toast,
      { opacity: [1, 0], y: [0, -10], scale: [1, 0.98] },
      { duration: 0.22, easing: 'ease-out' }
    );

    if (animation && typeof animation.finished?.then === 'function') {
      animation.finished.then(finish).catch(finish);
      return;
    }

    toast.classList.remove('is-visible');
    setTimeout(finish, 180);
  };

  const notify = ({
    title = 'GreenLeaf Nursery',
    message = '',
    tone = 'info',
    duration = 3200,
    sticky = false
  } = {}) => {
    ensureRoots();

    const toast = document.createElement('article');
    toast.className = `gl-toast tone-${tone}`;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

    toast.innerHTML = `
      <div class="gl-toast-accent" aria-hidden="true"></div>
      <div class="gl-toast-copy">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
      </div>
      <button type="button" class="gl-toast-close" aria-label="Dismiss notification">Close</button>
    `;

    const closeButton = toast.querySelector('.gl-toast-close');
    closeButton?.addEventListener('click', () => removeToast(toast));

    state.toastStack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
      animateIn(
        toast,
        { opacity: [0, 1], y: [20, 0], scale: [0.95, 1] },
        { duration: 0.45, easing: [0.22, 1, 0.36, 1] }
      );
    });

    if (!sticky) {
      window.setTimeout(() => removeToast(toast), Math.max(duration, 1200));
    }

    return toast;
  };

  const queueNotification = (options) => {
    try {
      sessionStorage.setItem(FLASH_KEY, JSON.stringify(options || {}));
    } catch {
      // ignore storage errors
    }
  };

  const replayQueuedNotification = () => {
    let raw = null;
    try {
      raw = sessionStorage.getItem(FLASH_KEY);
      sessionStorage.removeItem(FLASH_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;

    try {
      notify(JSON.parse(raw));
    } catch {
      // ignore malformed flash payloads
    }
  };

  const collectFieldValue = (element, type) => {
    if (!element) return '';
    if (type === 'checkbox') return element.checked ? 'true' : 'false';
    return String(element.value ?? '').trim();
  };

  const buildField = (field) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'gl-field';

    const heading = document.createElement('span');
    heading.textContent = field.label || field.name || 'Field';
    wrapper.appendChild(heading);

    let control;
    if (field.type === 'textarea') {
      control = document.createElement('textarea');
      control.rows = Number(field.rows || 4);
    } else if (field.type === 'select') {
      control = document.createElement('select');
      (field.options || []).forEach((option) => {
        const node = document.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        if (String(option.value) === String(field.value ?? '')) node.selected = true;
        control.appendChild(node);
      });
    } else {
      control = document.createElement('input');
      control.type = field.type || 'text';
      if (field.type === 'number') {
        if (field.min !== undefined) control.min = String(field.min);
        if (field.step !== undefined) control.step = String(field.step);
      }
    }

    control.name = field.name || 'value';
    control.placeholder = field.placeholder || '';
    if (field.required) control.required = true;
    if (field.type !== 'select' && field.value !== undefined) control.value = String(field.value ?? '');

    wrapper.appendChild(control);
    return wrapper;
  };

  const closeDialog = (result) => {
    const { backdrop, activeDialog } = state;
    if (!backdrop || !activeDialog) return;

    const finalize = () => {
      backdrop.remove();
      document.body.classList.remove('gl-dialog-open');
      state.backdrop = null;
      state.activeDialog = null;
      activeDialog.resolve(result);
    };

    const backdropAnimation = animateOut(
      backdrop,
      { opacity: [1, 0] },
      { duration: 0.18, easing: 'ease-out' }
    );
    animateOut(
      activeDialog.panel,
      { opacity: [1, 0], y: [0, 18], scale: [1, 0.98] },
      { duration: 0.22, easing: 'ease-out' }
    );

    if (backdropAnimation && typeof backdropAnimation.finished?.then === 'function') {
      backdropAnimation.finished.then(finalize).catch(finalize);
      return;
    }

    finalize();
  };

  const showDialog = ({
    title = 'GreenLeaf Nursery',
    message = '',
    tone = 'info',
    confirmText = 'Continue',
    cancelText = '',
    fields = []
  } = {}) =>
    new Promise((resolve) => {
      ensureRoots();

      if (state.activeDialog) {
        closeDialog({ confirmed: false, values: null });
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'gl-dialog-backdrop';

      const panel = document.createElement('div');
      panel.className = `gl-dialog tone-${tone}`;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', DIALOG_ID);

      const fieldMarkup = fields.map(buildField);

      panel.innerHTML = `
        <div class="gl-dialog-leaf" aria-hidden="true"></div>
        <div class="gl-dialog-copy">
          <h3 id="${DIALOG_ID}">${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
      `;

      const form = document.createElement('form');
      form.className = 'gl-dialog-form';

      fieldMarkup.forEach((node) => form.appendChild(node));

      const actions = document.createElement('div');
      actions.className = 'gl-dialog-actions';

      if (cancelText) {
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'cta-button secondary';
        cancelButton.textContent = cancelText;
        cancelButton.addEventListener('click', () =>
          closeDialog({ confirmed: false, values: null })
        );
        actions.appendChild(cancelButton);
      }

      const confirmButton = document.createElement('button');
      confirmButton.type = 'submit';
      confirmButton.className = 'cta-button';
      confirmButton.textContent = confirmText;
      actions.appendChild(confirmButton);
      form.appendChild(actions);
      panel.appendChild(form);
      backdrop.appendChild(panel);
      state.dialogHost.appendChild(backdrop);

      document.body.classList.add('gl-dialog-open');
      state.backdrop = backdrop;
      state.activeDialog = { panel, resolve };

      const firstField = form.querySelector('input, textarea, select, button');
      firstField?.focus();

      const onKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        window.removeEventListener('keydown', onKeyDown);
        closeDialog({ confirmed: false, values: null });
      };

      window.addEventListener('keydown', onKeyDown);

      backdrop.addEventListener('click', (event) => {
        if (event.target !== backdrop || !cancelText) return;
        window.removeEventListener('keydown', onKeyDown);
        closeDialog({ confirmed: false, values: null });
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        window.removeEventListener('keydown', onKeyDown);
        const values = {};
        fields.forEach((field) => {
          const element = form.elements.namedItem(field.name || 'value');
          values[field.name || 'value'] = collectFieldValue(element, field.type);
        });

        closeDialog({ confirmed: true, values });
      });

      requestAnimationFrame(() => {
        animateIn(backdrop, { opacity: [0, 1] }, { duration: 0.18, easing: 'ease-out' });
        animateIn(
          panel,
          { opacity: [0, 1], y: [22, 0], scale: [0.96, 1] },
          { duration: 0.42, easing: [0.22, 1, 0.36, 1] }
        );
      });
    });

  const alertDialog = async (message, options = {}) => {
    await showDialog({
      ...options,
      message,
      confirmText: options.confirmText || 'Keep growing'
    });
  };

  const confirmDialog = async (message, options = {}) => {
    const result = await showDialog({
      ...options,
      message,
      confirmText: options.confirmText || 'Continue',
      cancelText: options.cancelText || 'Cancel'
    });
    return Boolean(result?.confirmed);
  };

  const promptDialog = async (message, options = {}) => {
    const result = await showDialog({
      ...options,
      message,
      confirmText: options.confirmText || 'Save',
      cancelText: options.cancelText || 'Cancel',
      fields: [
        {
          name: 'value',
          label: options.label || 'Response',
          placeholder: options.placeholder || '',
          value: options.defaultValue || '',
          required: Boolean(options.required)
        }
      ]
    });

    if (!result?.confirmed) return null;
    return result.values?.value ?? '';
  };

  const formDialog = async (options = {}) => {
    const result = await showDialog({
      ...options,
      confirmText: options.confirmText || 'Save',
      cancelText: options.cancelText || 'Cancel',
      fields: Array.isArray(options.fields) ? options.fields : []
    });
    return result?.confirmed ? result.values || {} : null;
  };

  const addBackdropDecor = () => {
    if (document.querySelector('.forest-backdrop')) return;

    const shell = document.createElement('div');
    shell.className = 'forest-backdrop';
    shell.setAttribute('aria-hidden', 'true');

    const spores = Array.from({ length: 9 }, (_, index) => {
      const leaf = document.createElement('span');
      leaf.className = 'forest-spore';
      leaf.style.setProperty('--spore-left', `${8 + index * 10}%`);
      leaf.style.setProperty('--spore-top', `${18 + (index % 4) * 12}%`);
      leaf.style.setProperty('--spore-size', `${18 + (index % 3) * 8}px`);
      leaf.style.setProperty('--spore-delay', `${index * 0.22}s`);
      return leaf;
    });

    spores.forEach((spore) => shell.appendChild(spore));
    document.body.prepend(shell);
  };

  const revealPage = () => {
    const animator = motion();
    if (!animator) return;

    const { animate, stagger, inView } = animator;

    const header = document.querySelector('header');
    if (header) {
      animate(
        header,
        { opacity: [0, 1], y: [-28, 0], filter: ['blur(10px)', 'blur(0px)'] },
        { duration: 0.9, easing: [0.22, 1, 0.36, 1] }
      );
    }

    const initialTargets = Array.from(
      document.querySelectorAll(
        '.intro, .forest-panel, .plant-card, .card, .admin-table, .invoice-box, .table-scroll'
      )
    ).filter((node, index, list) => list.indexOf(node) === index);

    if (initialTargets.length) {
      animate(
        initialTargets,
        { opacity: [0, 1], y: [26, 0], scale: [0.98, 1] },
        {
          duration: 0.7,
          delay: stagger(0.06, { startDelay: 0.08 }),
          easing: [0.22, 1, 0.36, 1]
        }
      );
    }

    document.querySelectorAll('.forest-spore').forEach((spore, index) => {
      animate(
        spore,
        { y: [0, -18, 0], opacity: [0.16, 0.45, 0.16], scale: [1, 1.08, 0.96] },
        {
          duration: 5 + (index % 4),
          delay: index * 0.18,
          repeat: Infinity,
          easing: 'ease-in-out'
        }
      );
    });

    document.querySelectorAll('.plant-card, .forest-panel, .card').forEach((node) => {
      node.style.willChange = 'transform, opacity';
      inView(
        node,
        () => {
          animate(
            node,
            { opacity: [0, 1], y: [20, 0], scale: [0.98, 1] },
            { duration: 0.5, easing: [0.22, 1, 0.36, 1] }
          );
        },
        { margin: '0px 0px -60px 0px' }
      );
    });
  };

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  window.GreenLeafUI = {
    alert: alertDialog,
    confirm: confirmDialog,
    form: formDialog,
    notify,
    prompt: promptDialog,
    queueNotification
  };

  document.addEventListener('DOMContentLoaded', () => {
    addBackdropDecor();
    ensureRoots();
    replayQueuedNotification();
    revealPage();
  });
})();
