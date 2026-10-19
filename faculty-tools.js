// Panel de gestión de una facultad (presidente / vicepresidente). Configurar con window.TOOLS_CONFIG.
(() => {
  const { faculty: FACULTY, roleSlug } = window.TOOLS_CONFIG;
  const FB = window.UNITECFirebase, C = window.ToolsCommon, create = C.create;
  const PRES = `presidente-${roleSlug}`, VICE = `vicepresidente-${roleSlug}`;
  const main = document.querySelector('.main'), panel = document.getElementById('panel'), roleLabel = document.getElementById('roleLabel');
  let role = null, token = 0;
  main.hidden = true;

  document.querySelector('.home').addEventListener('click', async e => {
    e.preventDefault();
    try { await FB.signOut(); } catch {}
    location.href = 'index.html';
  });

  (async () => {
    try { await FB.authReady; role = await FB.getUserRole(); } catch { role = null; }
    const ok = role && (role.role === 'admin' || (role.faculty === FACULTY && ['presidente', 'vicepresidente'].includes(role.role)));
    if (!ok) { location.replace('P-Acceso-Presi-Admim.html'); return; }
    roleLabel.textContent = role.role === 'admin' ? 'Administrador · acceso global' : 'Acceso de ' + (role.role === 'presidente' ? 'presidente' : 'vicepresidente');
    main.hidden = false;
  })();

  const statusNode = () => { const s = create('p', 'status'); s.setAttribute('role', 'status'); panel.append(s); return s; };
  const addForm = markup => { const f = create('form', 'form'); f.innerHTML = markup; panel.append(f); return f; };
  const wrapSubmit = (form, status, busyText, work) => form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button.submit[type=submit]'); btn.disabled = true; status.textContent = busyText;
    try { await work(); } catch (err) { status.textContent = C.errText(err); } finally { btn.disabled = false; }
  });

  function openPanel(action) {
    token++; panel.replaceChildren(); panel.hidden = false;
    document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.action === action));
    const titles = { register: 'Registrar miembro', 'delete-member': 'Eliminar miembro', 'create-proposal': 'Crear propuesta', 'edit-proposals': 'Editar propuestas', 'delete-proposal': 'Eliminar propuesta', 'remove-title': 'Eliminar cargo normal' };
    panel.append(create('h2', '', titles[action]));
    ({ register: renderRegister, 'delete-member': renderDeleteMembers, 'create-proposal': renderProposalForm, 'edit-proposals': renderEditProposals, 'delete-proposal': renderDeleteProposals, 'remove-title': renderRemoveTitle })[action]();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Carga una lista y la pinta solo si el usuario sigue en el mismo panel.
  async function withList(loader, render) {
    const mine = token, holder = create('p', 'empty', 'Cargando…'); panel.append(holder);
    try {
      const data = await loader();
      if (mine !== token) return;
      holder.remove(); render(data);
    } catch (err) { if (mine === token) holder.textContent = C.errText(err); }
  }

  function renderRegister() {
    panel.append(create('p', '', `Agrega un miembro a la Facultad de ${FACULTY}.`));
    const form = addForm(C.memberFormMarkup()), status = statusNode(), wired = C.wireMemberForm(form, status);
    wrapSubmit(form, status, 'Guardando…', async () => {
      const v = wired.read();
      const existing = await FB.listMembers(FACULTY);
      if (existing.some(m => (m.correo || '').toLowerCase() === v.correo.toLowerCase())) { status.textContent = 'Ese correo ya está registrado.'; return; }
      await FB.createMember({ nombre: v.nombre, cargo: v.cargo, aniosEnU: v.aniosEnU, facultad: FACULTY, foto: await wired.photo() }, v.correo);
      wired.reset(); status.textContent = 'Miembro registrado.';
    });
  }

  function renderDeleteMembers() {
    panel.append(create('p', '', 'El vicepresidente solo puede eliminar miembros sin cargos privilegiados. El presidente puede retirar al vicepresidente confirmando su contraseña.'));
    withList(() => FB.listMembers(FACULTY), members => {
      if (!members.length) { panel.append(create('p', 'empty', `No hay miembros registrados en ${FACULTY}.`)); return; }
      const list = create('ul', 'items');
      members.forEach(member => {
        const priv = member.cargoPrivilegiado || '', row = create('li'), copy = create('div', 'item-copy');
        const detail = create('small', '', `${member.correo || ''} · ${member.cargo || 'Miembro'} · ${member.aniosEnU ?? '—'} años en UNITEC${priv ? ' · ' + priv : ''}`);
        const confirmForm = create('form', 'confirm-form'); confirmForm.hidden = true;
        confirmForm.innerHTML = '<label class="field">Confirma con tu contraseña<input name="password" type="password" required autocomplete="current-password"></label><button class="submit" type="submit">Confirmar eliminación</button><p class="status" role="status"></p>';
        copy.append(create('strong', '', member.nombre || 'Sin nombre'), detail, confirmForm); row.append(copy);
        const canRemove = !priv || role.role === 'admin' || (role.roleKey === PRES && priv === VICE);
        const doRemove = async (password, statusEl) => {
          try { await FB.removeMember(member.id, password); openPanel('delete-member'); }
          catch (err) { (statusEl || statusNode()).textContent = C.errText(err); }
        };
        if (canRemove) {
          const remove = create('button', 'remove', 'Eliminar'); remove.type = 'button';
          remove.addEventListener('click', () => {
            if (priv && role.role !== 'admin') { confirmForm.hidden = !confirmForm.hidden; return; }
            if (confirm('¿Eliminar a ' + (member.nombre || 'este miembro') + '?')) doRemove();
          });
          confirmForm.addEventListener('submit', e => { e.preventDefault(); doRemove(confirmForm.elements.password.value, confirmForm.querySelector('.status')); });
          row.append(remove);
        } else row.append(create('small', '', role.roleKey === VICE ? 'Solo puedes eliminar miembros sin cargos privilegiados.' : 'Tu propio cargo no puede eliminarse desde aquí.'));
        list.append(row);
      });
      panel.append(list);
    });
  }

  function renderRemoveTitle() {
    panel.append(create('p', '', `Quita títulos normales de ${FACULTY}. Los cargos privilegiados no aparecen en esta lista.`));
    withList(() => FB.listMembers(FACULTY), members => {
      const eligible = members.filter(m => (m.cargo || 'Miembro') !== 'Miembro' && !m.cargoPrivilegiado);
      if (!eligible.length) { panel.append(create('p', 'empty', 'No hay cargos normales para eliminar.')); return; }
      const form = addForm('<label class="field">Miembro y cargo<select name="member" required></select></label><button class="submit" type="submit">Quitar cargo</button>'), status = statusNode();
      eligible.forEach(m => { const o = create('option', '', `${m.nombre || 'Sin nombre'} · ${m.cargo} · ${m.aniosEnU ?? '—'} años`); o.value = m.id; form.elements.member.append(o); });
      wrapSubmit(form, status, 'Guardando…', async () => { await FB.updateMember(form.elements.member.value, { cargo: 'Miembro', cargoOtro: null }); openPanel('remove-title'); });
    });
  }

  function renderProposalForm() {
    panel.append(create('p', '', `Publica una propuesta para la Facultad de ${FACULTY}.`));
    const form = addForm(C.proposalFormMarkup('Publicar propuesta')), editor = C.setupProposalEditor(form), status = form.querySelector('.status');
    wrapSubmit(form, status, 'Publicando (subiendo imágenes si hay)…', async () => {
      const content = C.sanitizeProposalHTML(editor.innerHTML), text = editor.innerText.trim();
      if (!text && !editor.querySelector('img')) { status.textContent = 'Escribe el contenido o inserta una imagen.'; return; }
      await FB.saveProposal({ facultad: FACULTY, title: form.elements.title.value.trim(), content, description: text, author: role.roleKey || role.role });
      form.reset(); editor.replaceChildren(); status.textContent = 'Propuesta publicada.';
    });
  }

  const proposalRows = (proposals, label, onClick, empty) => {
    if (!proposals.length) { panel.append(create('p', 'empty', empty)); return; }
    const list = create('ul', 'items');
    proposals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(p => {
      const row = create('li'), copy = create('div', 'item-copy'), btn = create('button', 'remove', label); btn.type = 'button';
      btn.addEventListener('click', () => onClick(p));
      copy.append(create('strong', '', p.title || 'Sin título'), create('small', '', p.description || '')); row.append(copy, btn); list.append(row);
    });
    panel.append(list);
  };

  function renderEditProposals() {
    panel.append(create('p', '', 'Selecciona una propuesta para editar el texto o sus imágenes.'));
    withList(() => FB.listProposals(FACULTY), proposals => proposalRows(proposals, 'Editar', renderProposalEditor, 'No hay propuestas para editar.'));
  }

  function renderProposalEditor(proposal) {
    panel.replaceChildren(create('h2', '', 'Editar propuesta'));
    const form = addForm(C.proposalFormMarkup('Guardar cambios', '', true)), editor = C.setupProposalEditor(form, proposal.content || '', proposal.description || ''), status = form.querySelector('.status');
    form.elements.title.value = proposal.title || '';
    form.querySelector('[data-cancel-edit]').addEventListener('click', () => openPanel('edit-proposals'));
    wrapSubmit(form, status, 'Guardando…', async () => {
      const content = C.sanitizeProposalHTML(editor.innerHTML), text = editor.innerText.trim();
      if (!text && !editor.querySelector('img')) { status.textContent = 'La propuesta necesita texto o una imagen.'; return; }
      await FB.saveProposal({ facultad: FACULTY, title: form.elements.title.value.trim(), content, description: text }, proposal.id);
      status.textContent = 'Propuesta actualizada.';
    });
  }

  function renderDeleteProposals() {
    panel.append(create('p', '', `Solo se muestran propuestas de ${FACULTY}.`));
    withList(() => FB.listProposals(FACULTY), proposals => proposalRows(proposals, 'Eliminar', async p => {
      if (!confirm('¿Eliminar esta propuesta?')) return;
      try { await FB.removeProposal(p.id); openPanel('delete-proposal'); } catch (err) { statusNode().textContent = C.errText(err); }
    }, 'No hay propuestas para eliminar.'));
  }

  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => role && openPanel(b.dataset.action)));
})();
