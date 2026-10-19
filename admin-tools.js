// Panel de administración central.
(() => {
  const FB = window.UNITECFirebase, C = window.ToolsCommon, create = C.create;
  const FACULTIES = ['Ingeniería Civil', 'Derecho', 'Medicina', 'Electromecánicas'];
  const ROLE_INFO = {
    'presidente-civil': { title: 'Presidente', faculty: 'Ingeniería Civil' }, 'presidente-derecho': { title: 'Presidente', faculty: 'Derecho' },
    'presidente-medicina': { title: 'Presidente', faculty: 'Medicina' }, 'presidente-mecatronica': { title: 'Presidente', faculty: 'Electromecánicas' },
    'vicepresidente-civil': { title: 'Vicepresidente', faculty: 'Ingeniería Civil' }, 'vicepresidente-derecho': { title: 'Vicepresidente', faculty: 'Derecho' },
    'vicepresidente-medicina': { title: 'Vicepresidente', faculty: 'Medicina' }, 'vicepresidente-mecatronica': { title: 'Vicepresidente', faculty: 'Electromecánicas' }
  };
  const roleName = key => ROLE_INFO[key] ? `${ROLE_INFO[key].title} · ${ROLE_INFO[key].faculty}` : key;
  const facultyField = '<label class="field">Facultad<select name="faculty" required>' + FACULTIES.map(f => `<option value="${f}">${f}</option>`).join('') + '</select></label>';
  const main = document.querySelector('.main'), panel = document.getElementById('panel');
  let role = null, token = 0;
  main.hidden = true;

  document.querySelector('.logout').addEventListener('click', async e => {
    e.preventDefault();
    try { await FB.signOut(); } catch {}
    location.href = 'index.html';
  });
  (async () => {
    try { await FB.authReady; role = await FB.getUserRole(); } catch { role = null; }
    if (role?.role !== 'admin') { location.replace('P-Acceso-Presi-Admim.html'); return; }
    document.getElementById('roleLabel').textContent = 'Administrador · acceso global';
    main.hidden = false;
  })();

  const statusNode = () => { const s = create('p', 'status'); s.setAttribute('role', 'status'); panel.append(s); return s; };
  const addForm = markup => { const f = create('form', 'form'); f.innerHTML = markup; panel.append(f); return f; };
  const wrapSubmit = (form, status, busyText, work) => form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button.submit[type=submit]'); btn.disabled = true; status.textContent = busyText;
    try { await work(); } catch (err) { status.textContent = C.errText(err); } finally { btn.disabled = false; }
  });
  async function withList(loader, render) {
    const mine = token, holder = create('p', 'empty', 'Cargando…'); panel.append(holder);
    try { const data = await loader(); if (mine !== token) return; holder.remove(); render(data); }
    catch (err) { if (mine === token) holder.textContent = C.errText(err); }
  }

  function show(action) {
    token++; panel.replaceChildren(); panel.hidden = false;
    document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.action === action));
    const names = { register: 'Registrar miembro', 'delete-member': 'Eliminar miembro', 'create-proposal': 'Crear propuesta', 'edit-proposals': 'Editar propuestas', 'delete-proposal': 'Eliminar propuesta', 'assign-role': 'Asignar cargo privilegiado', 'remove-role': 'Eliminar cargo privilegiado', 'remove-title': 'Eliminar cargo normal', 'reset-password': 'Restablecer contraseña' };
    panel.append(create('h2', '', names[action]));
    ({ register: renderRegister, 'delete-member': renderDeleteMembers, 'create-proposal': renderCreateProposal, 'edit-proposals': renderEditProposals, 'delete-proposal': renderDeleteProposals, 'assign-role': renderAssignRole, 'remove-role': renderRemoveRole, 'remove-title': renderRemoveTitle, 'reset-password': renderResetPassword })[action]();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRegister() {
    panel.append(create('p', '', 'Registra miembros en cualquiera de las facultades.'));
    const form = addForm(C.memberFormMarkup(facultyField)), status = statusNode(), wired = C.wireMemberForm(form, status);
    wrapSubmit(form, status, 'Guardando…', async () => {
      const v = wired.read(), existing = await FB.listMembers();
      if (existing.some(m => (m.correo || '').toLowerCase() === v.correo.toLowerCase())) { status.textContent = 'Ese correo ya está registrado.'; return; }
      await FB.createMember({ nombre: v.nombre, cargo: v.cargo, aniosEnU: v.aniosEnU, facultad: v.faculty, foto: await wired.photo() }, v.correo);
      wired.reset(); status.textContent = 'Miembro registrado.';
    });
  }

  function renderDeleteMembers() {
    panel.append(create('p', '', 'La eliminación también retira la cuenta privilegiada asignada a ese miembro (si la tiene).'));
    withList(() => FB.listMembers(), members => {
      if (!members.length) { panel.append(create('p', 'empty', 'No hay miembros registrados.')); return; }
      const list = create('ul', 'items');
      members.forEach(m => {
        const row = create('li'), copy = create('div', 'item-copy'), remove = create('button', 'remove', 'Eliminar'); remove.type = 'button';
        copy.append(create('strong', '', m.nombre || 'Sin nombre'), create('small', '', `${m.correo || ''} · ${m.facultad || 'Sin facultad'} · ${m.cargo || 'Miembro'} · ${m.aniosEnU ?? '—'} años en UNITEC${m.cargoPrivilegiado ? ' · ' + roleName(m.cargoPrivilegiado) : ''}`));
        remove.addEventListener('click', async () => {
          if (!confirm(`¿Eliminar a ${m.nombre || 'este miembro'}?`)) return;
          try { await FB.removeMember(m.id); show('delete-member'); } catch (err) { statusNode().textContent = C.errText(err); }
        });
        row.append(copy, remove); list.append(row);
      });
      panel.append(list);
    });
  }

  function renderCreateProposal() {
    panel.append(create('p', '', 'Publica una propuesta en la facultad seleccionada.'));
    const form = addForm(C.proposalFormMarkup('Publicar propuesta', facultyField)), editor = C.setupProposalEditor(form), status = form.querySelector('.status');
    wrapSubmit(form, status, 'Publicando (subiendo imágenes si hay)…', async () => {
      const content = C.sanitizeProposalHTML(editor.innerHTML), text = editor.innerText.trim();
      if (!text && !editor.querySelector('img')) { status.textContent = 'Escribe el contenido o inserta una imagen.'; return; }
      await FB.saveProposal({ facultad: form.elements.faculty.value, title: form.elements.title.value.trim(), content, description: text, author: 'admin' });
      form.reset(); editor.replaceChildren(); status.textContent = 'Propuesta publicada.';
    });
  }

  const proposalRows = (proposals, label, onClick, empty) => {
    if (!proposals.length) { panel.append(create('p', 'empty', empty)); return; }
    const list = create('ul', 'items');
    proposals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(p => {
      const row = create('li'), copy = create('div', 'item-copy'), btn = create('button', 'remove', label); btn.type = 'button';
      btn.addEventListener('click', () => onClick(p));
      copy.append(create('strong', '', p.title || 'Sin título'), create('small', '', `${p.facultad || 'Sin facultad'} · ${p.description || ''}`)); row.append(copy, btn); list.append(row);
    });
    panel.append(list);
  };

  function renderEditProposals() {
    panel.append(create('p', '', 'Selecciona una propuesta para editar su título, texto o imágenes.'));
    withList(() => FB.listProposals(), ps => proposalRows(ps, 'Editar', renderProposalEditor, 'No hay propuestas para editar.'));
  }
  function renderProposalEditor(proposal) {
    panel.replaceChildren(create('h2', '', 'Editar propuesta'));
    const form = addForm(C.proposalFormMarkup('Guardar cambios', facultyField, true)), editor = C.setupProposalEditor(form, proposal.content || '', proposal.description || ''), status = form.querySelector('.status');
    form.elements.faculty.value = proposal.facultad || FACULTIES[0]; form.elements.title.value = proposal.title || '';
    form.querySelector('[data-cancel-edit]').addEventListener('click', () => show('edit-proposals'));
    wrapSubmit(form, status, 'Guardando…', async () => {
      const content = C.sanitizeProposalHTML(editor.innerHTML), text = editor.innerText.trim();
      if (!text && !editor.querySelector('img')) { status.textContent = 'La propuesta necesita texto o una imagen.'; return; }
      await FB.saveProposal({ facultad: form.elements.faculty.value, title: form.elements.title.value.trim(), content, description: text }, proposal.id);
      status.textContent = 'Propuesta actualizada.';
    });
  }
  function renderDeleteProposals() {
    panel.append(create('p', '', 'Se muestran propuestas de todas las facultades.'));
    withList(() => FB.listProposals(), ps => proposalRows(ps, 'Eliminar', async p => {
      if (!confirm(`¿Eliminar la propuesta ${p.title || ''}?`)) return;
      try { await FB.removeProposal(p.id); show('delete-proposal'); } catch (err) { statusNode().textContent = C.errText(err); }
    }, 'No hay propuestas registradas.'));
  }

  function renderAssignRole() {
    panel.append(create('p', '', 'Elige un miembro registrado (con correo) y define su contraseña inicial. Se crea su cuenta de acceso en Firebase.'));
    withList(() => FB.listMembers(), members => {
      const form = addForm(`<label class="field">Cargo<select name="role" required>${Object.entries(ROLE_INFO).map(([k, i]) => `<option value="${k}">${i.title} · ${i.faculty}</option>`).join('')}</select></label><label class="field">Miembro<select name="member" required></select></label><label class="field">Contraseña inicial (mínimo 6 caracteres)<input name="password" type="password" required minlength="6" autocomplete="new-password"></label><button class="submit" type="submit">Asignar cargo</button>`), status = statusNode(), select = form.elements.member;
      const eligible = () => members.filter(m => m.facultad === ROLE_INFO[form.elements.role.value].faculty && (m.cargo || 'Miembro') === 'Miembro' && !m.cargoPrivilegiado && m.correo);
      const refill = () => {
        select.replaceChildren(); const list = eligible();
        list.forEach(m => { const o = create('option', '', `${m.nombre || 'Sin nombre'} · ${m.correo}`); o.value = m.id; select.append(o); });
        if (!list.length) { const o = create('option', '', 'No hay miembros elegibles en esta facultad'); o.value = ''; o.disabled = true; o.selected = true; select.append(o); }
      };
      form.elements.role.addEventListener('change', refill); refill();
      wrapSubmit(form, status, 'Creando cuenta…', async () => {
        const member = members.find(m => m.id === select.value);
        if (!member) { status.textContent = 'Selecciona un miembro elegible.'; return; }
        await FB.assignPrivilegedRole(form.elements.role.value, member, form.elements.password.value);
        status.textContent = `Cargo asignado a ${member.nombre}.`; show('assign-role');
        statusNode().textContent = `Cargo asignado a ${member.nombre}.`;
      });
    });
  }

  const assignedRoles = async () => Object.entries(await FB.listRoleAssignments()).filter(([, r]) => ROLE_INFO[r.roleKey]).map(([uid, r]) => ({ uid, ...r }));

  function renderRemoveRole() {
    panel.append(create('p', '', 'Al quitar el cargo, el miembro conserva su registro pero pierde el acceso privilegiado.'));
    withList(assignedRoles, assigned => {
      if (!assigned.length) { panel.append(create('p', 'empty', 'No hay cargos privilegiados asignados.')); return; }
      const form = addForm('<label class="field">Cargo asignado<select name="role" required></select></label><button class="submit" type="submit">Eliminar cargo</button>'), status = statusNode();
      assigned.forEach(a => { const o = create('option', '', `${roleName(a.roleKey)} · ${a.email || ''}`); o.value = a.roleKey; form.elements.role.append(o); });
      wrapSubmit(form, status, 'Eliminando…', async () => {
        const key = form.elements.role.value; if (!confirm(`¿Eliminar el cargo ${roleName(key)}?`)) { status.textContent = ''; return; }
        await FB.revokeRole(key); show('remove-role');
      });
    });
  }

  function renderRemoveTitle() {
    panel.append(create('p', '', 'Quita un título normal sin eliminar al miembro ni sus datos.'));
    withList(() => FB.listMembers(), members => {
      const eligible = members.filter(m => (m.cargo || 'Miembro') !== 'Miembro' && !m.cargoPrivilegiado);
      if (!eligible.length) { panel.append(create('p', 'empty', 'No hay cargos normales para eliminar.')); return; }
      const form = addForm('<label class="field">Miembro y cargo<select name="member" required></select></label><button class="submit" type="submit">Quitar cargo</button>'), status = statusNode();
      eligible.forEach(m => { const o = create('option', '', `${m.nombre || 'Sin nombre'} · ${m.cargo} · ${m.facultad || 'Sin facultad'}`); o.value = m.id; form.elements.member.append(o); });
      wrapSubmit(form, status, 'Guardando…', async () => { await FB.updateMember(form.elements.member.value, { cargo: 'Miembro', cargoOtro: null }); show('remove-title'); });
    });
  }

  function renderResetPassword() {
    panel.append(create('p', '', 'Firebase envía un correo al titular del cargo para que él mismo elija una contraseña nueva.'));
    withList(assignedRoles, assigned => {
      if (!assigned.length) { panel.append(create('p', 'empty', 'No hay cuentas privilegiadas asignadas.')); return; }
      const form = addForm('<label class="field">Cargo asignado<select name="role" required></select></label><button class="submit" type="submit">Enviar correo de restablecimiento</button>'), status = statusNode();
      assigned.forEach(a => { const o = create('option', '', `${roleName(a.roleKey)} · ${a.email || ''}`); o.value = a.roleKey; form.elements.role.append(o); });
      wrapSubmit(form, status, 'Enviando…', async () => { const email = await FB.resetPrivilegedPassword(form.elements.role.value); status.textContent = `Correo enviado a ${email}.`; });
    });
  }

  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => role && show(b.dataset.action)));
})();
