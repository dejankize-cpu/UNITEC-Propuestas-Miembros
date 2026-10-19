// Utilidades compartidas por los paneles de gestión (facultades y administrador).
(() => {
  const MEMBER_TITLES = ['Miembro', 'Secretario/a', 'Tesorero/a', 'Vocal', 'Representante de facultad', 'Otro cargo'];
  const SAFE_IMG = /^(data:image\/jpeg;base64,|https:\/\/res\.cloudinary\.com\/)/i;

  const create = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function errText(error) {
    const code = error?.code || '', msg = error?.message || '';
    if (/PERMISSION_DENIED/i.test(code + msg)) return 'No tienes permiso para esta acción. Revisa tu sesión y las reglas de Firebase.';
    if (/auth\/(wrong-password|invalid-credential)/.test(code)) return 'La contraseña no coincide.';
    if (code === 'auth/email-already-in-use') return 'Ese correo ya tiene una cuenta en Firebase. Usa "Restablecer contraseña" desde el panel de administrador.';
    if (code === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
    if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
    return msg || 'Ocurrió un error inesperado.';
  }

  function sanitizeProposalHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach(el => el.remove());
    const allowed = new Set(['P', 'DIV', 'BR', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'BLOCKQUOTE', 'IMG']);
    template.content.querySelectorAll('*').forEach(el => {
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!SAFE_IMG.test(src)) { el.remove(); return; }
        const alt = el.getAttribute('alt') || 'Imagen de la propuesta';
        for (const a of [...el.attributes]) el.removeAttribute(a.name);
        el.setAttribute('src', src); el.setAttribute('alt', alt);
      } else for (const a of [...el.attributes]) el.removeAttribute(a.name);
    });
    return template.innerHTML;
  }

  function drawImage(file, makeCanvas, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), image = new Image();
      image.onload = () => {
        try { const canvas = makeCanvas(image); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      image.src = url;
    });
  }
  const resizePhoto = file => drawImage(file, img => {
    const size = 320, side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c;
  }, .8);
  const resizeProposalImage = file => drawImage(file, img => {
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }, .82);

  // Las imágenes se insertan como data URL (vista previa) y se suben a Cloudinary al guardar (saveProposal).
  function setupProposalEditor(form, initialHtml = '', initialText = '') {
    const editor = form.querySelector('.proposal-editor'), fileInput = form.querySelector('.image-input'), insertButton = form.querySelector('[data-insert-image]');
    if (initialHtml) editor.innerHTML = sanitizeProposalHTML(initialHtml);
    else if (initialText) { const p = document.createElement('p'); p.textContent = initialText; editor.append(p); }
    let savedRange = null;
    const saveRange = () => { const s = getSelection(); if (s?.rangeCount && editor.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
    editor.addEventListener('keyup', saveRange); editor.addEventListener('mouseup', saveRange); editor.addEventListener('focus', saveRange);
    insertButton.addEventListener('pointerdown', e => { e.preventDefault(); saveRange(); });
    insertButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]; if (!file) return;
      const status = form.querySelector('.status');
      try {
        const image = document.createElement('img');
        image.src = await resizeProposalImage(file); image.alt = 'Imagen de la propuesta';
        const selection = getSelection(), valid = savedRange && editor.contains(savedRange.commonAncestorContainer);
        const range = valid ? savedRange.cloneRange() : document.createRange();
        if (!valid) { range.selectNodeContents(editor); range.collapse(false); }
        range.deleteContents(); range.insertNode(image);
        const spacer = document.createElement('p'); spacer.append(document.createElement('br')); image.after(spacer);
        range.setStart(spacer, 0); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
        editor.focus(); saveRange();
      } catch { status.textContent = 'No se pudo insertar la imagen.'; }
      finally { fileInput.value = ''; }
    });
    return editor;
  }

  const titleOptions = () => MEMBER_TITLES.map(t => `<option value="${t}">${t}</option>`).join('');
  const memberFormMarkup = (facultyField = '') =>
    '<label class="field">Nombre completo<input name="nombre" required autocomplete="name"></label>' +
    '<label class="field">Correo<input name="correo" type="email" required autocomplete="email"></label>' + facultyField +
    `<label class="field">Cargo normal<select name="cargo" required>${titleOptions()}</select></label>` +
    '<label class="field" data-other-title hidden>Especifica el cargo<input name="cargoOtro" maxlength="60"></label>' +
    '<label class="field">Años en UNITEC<input name="aniosEnU" type="number" min="0" max="30" step="1" required></label>' +
    '<label class="field">Foto de perfil (opcional)<input name="foto" type="file" accept="image/*"></label>' +
    '<img class="photo-preview" alt="Vista previa de la foto" hidden><button class="submit" type="submit">Guardar miembro</button>';

  function wireMemberForm(form, status) {
    const preview = form.querySelector('.photo-preview'), other = form.querySelector('[data-other-title]');
    let data = '', task = Promise.resolve('');
    form.elements.cargo.addEventListener('change', () => { other.hidden = form.elements.cargo.value !== 'Otro cargo'; form.elements.cargoOtro.required = !other.hidden; });
    form.elements.foto.addEventListener('change', () => {
      const file = form.elements.foto.files[0]; data = ''; preview.hidden = true;
      task = file ? resizePhoto(file).then(d => { data = d; preview.src = d; preview.hidden = false; return d; })
        .catch(() => { status.textContent = 'No se pudo leer la foto; puedes continuar sin ella.'; return ''; }) : Promise.resolve('');
    });
    return {
      read() {
        const v = new FormData(form), picked = String(v.get('cargo') || '');
        return {
          nombre: String(v.get('nombre') || '').trim(), correo: String(v.get('correo') || '').trim(),
          cargo: picked === 'Otro cargo' ? String(v.get('cargoOtro') || '').trim() : picked,
          aniosEnU: Number(v.get('aniosEnU')), faculty: String(v.get('faculty') || '')
        };
      },
      async photo() { await task; return data; },
      reset() { form.reset(); data = ''; task = Promise.resolve(''); preview.hidden = true; other.hidden = true; }
    };
  }

  const proposalFormMarkup = (submitLabel, facultyField = '', cancel = false) =>
    facultyField + '<label class="field">Título<input name="title" required maxlength="100"></label>' +
    '<div class="proposal-toolbar"><button class="submit" type="button" data-insert-image>Insertar imagen</button><input class="image-input" type="file" accept="image/*" aria-label="Seleccionar imagen para la propuesta"></div>' +
    '<div class="proposal-editor" contenteditable="true" role="textbox" aria-label="Contenido de la propuesta" aria-multiline="true" data-placeholder="Escribe el contenido de la propuesta..."></div>' +
    `<p class="status" role="status"></p><button class="submit" type="submit">${submitLabel}</button>` +
    (cancel ? '<button class="remove" type="button" data-cancel-edit>Cancelar</button>' : '');

  window.ToolsCommon = { MEMBER_TITLES, create, errText, sanitizeProposalHTML, setupProposalEditor, memberFormMarkup, wireMemberForm, proposalFormMarkup };
})();
