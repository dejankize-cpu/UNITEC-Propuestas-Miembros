// Página pública de una facultad: propuestas y miembros en tiempo real desde Firebase.
(() => {
  const { faculty: FACULTY, roleSlug } = window.PAGE_CONFIG;
  const roleNames = { [`presidente-${roleSlug}`]: 'Presidente', [`vicepresidente-${roleSlug}`]: 'Vicepresidente' };
  const rolePriority = { [`presidente-${roleSlug}`]: 0, [`vicepresidente-${roleSlug}`]: 1 };
  const SAFE_IMG = /^(data:image\/jpeg;base64,|https:\/\/res\.cloudinary\.com\/)/i;
  const SAFE_PHOTO = /^(data:image\/(jpeg|png|webp);base64,|https:\/\/res\.cloudinary\.com\/)/i;
  const $ = id => document.getElementById(id);
  let proposals = [], members = [];

  function safeProposalContent(content) {
    if (!content) return '';
    const template = document.createElement('template'); template.innerHTML = String(content);
    template.content.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach(el => el.remove());
    const allowed = new Set(['P', 'DIV', 'BR', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'BLOCKQUOTE', 'IMG']);
    template.content.querySelectorAll('*').forEach(el => {
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (!SAFE_IMG.test(src)) { el.remove(); return; }
        const alt = el.getAttribute('alt') || 'Imagen de la propuesta';
        for (const a of [...el.attributes]) el.removeAttribute(a.name);
        el.setAttribute('src', src); el.setAttribute('alt', alt); el.setAttribute('loading', 'lazy');
      } else for (const a of [...el.attributes]) el.removeAttribute(a.name);
    });
    return template.innerHTML;
  }
  const initials = name => String(name || 'M').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'M';

  function renderProposals() {
    const list = $('proposalList'), items = proposals.filter(p => p.facultad === FACULTY).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    list.replaceChildren();
    $('proposalCount').textContent = `${items.length} ${items.length === 1 ? 'propuesta' : 'propuestas'}`;
    $('proposalEmpty').textContent = 'Aún no hay propuestas publicadas.'; $('proposalEmpty').hidden = items.length > 0;
    items.forEach(p => {
      const article = document.createElement('article'); article.className = 'proposal';
      const header = document.createElement('header'); header.className = 'proposal-head';
      const title = document.createElement('h3'); title.textContent = p.title || 'Propuesta';
      const date = document.createElement('time'); date.className = 'meta';
      const parsed = p.createdAt ? new Date(p.createdAt) : null;
      if (parsed && !Number.isNaN(parsed.valueOf())) { date.dateTime = parsed.toISOString(); date.textContent = new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(parsed); }
      header.append(title, date);
      const content = document.createElement('div'); content.className = 'proposal-content';
      if (p.content) content.innerHTML = safeProposalContent(p.content);
      else { const para = document.createElement('p'); para.textContent = p.description || ''; content.append(para); }
      article.append(header, content); list.append(article);
    });
  }

  function renderMembers() {
    const items = members.filter(m => m.facultad === FACULTY).sort((a, b) => {
      const priority = m => rolePriority[m.cargoPrivilegiado] ?? (m.cargo && m.cargo !== 'Miembro' ? 2 : 3);
      return priority(a) - priority(b) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
    const list = $('memberList'); list.replaceChildren();
    $('memberCount').textContent = `${items.length} ${items.length === 1 ? 'miembro' : 'miembros'}`;
    $('memberEmpty').textContent = 'Aún no hay miembros registrados.'; $('memberEmpty').hidden = items.length > 0;
    items.forEach(m => {
      const article = document.createElement('article'); article.className = 'member';
      const name = String(m.nombre || 'Miembro'), photo = String(m.foto || ''); let avatar;
      if (SAFE_PHOTO.test(photo)) { avatar = document.createElement('img'); avatar.className = 'avatar'; avatar.src = photo; avatar.alt = `Foto de ${name}`; avatar.loading = 'lazy'; }
      else { avatar = document.createElement('div'); avatar.className = 'avatar avatar-fallback'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = initials(name); }
      const info = document.createElement('div'); info.className = 'member-info';
      const heading = document.createElement('h3'); heading.textContent = name;
      const normal = m.cargo && m.cargo !== 'Miembro' ? m.cargo : 'Miembro', privileged = roleNames[m.cargoPrivilegiado] || '';
      const years = Number.isFinite(Number(m.aniosEnU)) && m.aniosEnU !== undefined ? `${m.aniosEnU} años en UNITEC` : '';
      const details = document.createElement('p'); details.textContent = [privileged, normal, years].filter(Boolean).join(' · ');
      info.append(heading, details); article.append(avatar, info); list.append(article);
    });
  }

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function activateTab(tab) { tabs.forEach(i => { const on = i === tab; i.setAttribute('aria-selected', on); i.tabIndex = on ? 0 : -1; $(i.getAttribute('aria-controls')).hidden = !on; }); tab.focus(); }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); activateTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]); } });
  });

  const showError = id => { const el = $(id); el.textContent = 'No se pudo cargar la información. Revisa tu conexión e intenta de nuevo.'; el.hidden = false; };
  ['proposalEmpty', 'memberEmpty'].forEach(id => { $(id).textContent = 'Cargando…'; $(id).hidden = false; });
  const FB = window.UNITECFirebase;
  if (!FB) { showError('proposalEmpty'); showError('memberEmpty'); return; }
  FB.subscribeProposals(list => { proposals = list; renderProposals(); }, () => showError('proposalEmpty'));
  FB.subscribeMembers(list => { members = list; renderMembers(); }, () => showError('memberEmpty'));
})();
