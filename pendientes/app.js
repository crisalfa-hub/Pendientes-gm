/* app.js — interfaz. Toda la lógica de datos vive en core.js */
(function () {
  'use strict';
  const C = window.Core;
  const KEY = 'pendientes.v1';
  const $ = (s) => document.querySelector(s);

  // ---------- estado y persistencia ----------
  let state = load();
  const ui = { tab: 'todo', adding: null, sheetId: null, day: C.todayStr() };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { items: C.sanitize(d.items || []), collapsed: d.collapsed || {}, hideDone: !!d.hideDone };
      }
    } catch (e) { console.warn('No se pudo leer el almacenamiento', e); }
    return { items: [], collapsed: {}, hideDone: false };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('No se pudo guardar: almacenamiento lleno o bloqueado'); }
  }

  // ---------- utilidades de DOM ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const REPEAT_LABEL = { daily: 'cada día', weekly: 'cada semana', monthly: 'cada mes' };
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- render ----------
  const listEl = $('#list');

  function render() {
    const today = C.todayStr();
    ui.day = today;
    $('#today-label').textContent = capital(
      new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    );

    const due = C.dueList(state.items, today);
    const n = due.overdue.length + due.today.length;
    $('#tab-today-count').textContent = n ? String(n) : '';
    for (const b of document.querySelectorAll('.tabs [data-tab]')) {
      b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab));
    }

    const ov = C.overall(state.items);
    $('#overall').hidden = ov.total === 0;
    $('#overall-text').textContent = `${ov.done} de ${ov.total} hechas`;
    $('#overall-bar').style.width = ov.total ? Math.round((ov.done / ov.total) * 100) + '%' : '0%';

    listEl.replaceChildren();
    if (ui.tab === 'today') renderToday(due, today);
    else renderAll(today);
  }

  function renderAll(today) {
    const roots = state.items.filter((i) => !i.parent);
    if (!roots.length) {
      listEl.append(h('p', { class: 'empty', text: 'Aún no hay nada. Escribe abajo tu primera meta o tarea.' }));
      return;
    }
    roots.forEach((it) => renderNode(it, 0, today));
    if (!listEl.children.length) {
      listEl.append(h('p', { class: 'empty', text: 'Todo está completado.' }));
    }
  }

  function renderNode(it, depth, today) {
    const items = state.items;
    const kids = C.childrenOf(items, it.id);
    if (state.hideDone && C.isDone(items, it)) return;
    listEl.append(rowEl(it, depth, today, false));
    if (ui.adding === it.id) listEl.append(inlineAdd(it.id, depth + 1));
    if (kids.length && !state.collapsed[it.id]) kids.forEach((k) => renderNode(k, depth + 1, today));
  }

  function renderToday(due, today) {
    const sections = [['Atrasadas', due.overdue], ['Hoy', due.today]];
    let any = false;
    for (const [title, arr] of sections) {
      if (!arr.length) continue;
      any = true;
      listEl.append(h('div', { class: 'section-title', text: title }));
      arr.forEach((it) => listEl.append(rowEl(it, 0, today, true)));
    }
    if (!any) listEl.append(h('p', { class: 'empty', text: 'Nada pendiente para hoy.' }));
  }

  function rowEl(it, depth, today, flat) {
    const items = state.items;
    const kids = C.childrenOf(items, it.id);
    const done = C.isDone(items, it);
    const st = C.stats(items, it.id);
    const lab = C.dueLabel(it, today);
    const path = flat ? C.pathOf(items, it) : [];
    const hasProgress = kids.length > 0 && st.total > 0;

    const meta = [];
    if (flat && path.length) meta.push(h('span', { text: path.join(' › ') }));
    if (lab.text) meta.push(h('span', { class: lab.overdue ? 'overdue' : '', text: lab.text }));
    if (it.repeat && !kids.length) meta.push(h('span', { text: '↻ ' + REPEAT_LABEL[it.repeat] }));
    if (hasProgress) meta.push(h('span', { text: `${st.done}/${st.total}` }));

    return h('div', { class: 'row' + (done ? ' done' : ''), 'data-id': it.id, style: `--d:${depth}` },
      h('button', {
        type: 'button', class: 'check' + (kids.length ? ' multi' : ''), 'data-act': 'check',
        'aria-label': done ? 'Marcar como pendiente' : 'Marcar como hecha', 'aria-pressed': String(done),
      }, h('span', { class: 'box' })),
      h('button', { type: 'button', class: 'body', 'data-act': 'open' },
        h('span', { class: 'title', text: it.title }),
        meta.length ? h('span', { class: 'meta' }, meta) : null,
        hasProgress ? h('span', { class: 'bar' }, h('i', { style: `width:${Math.round((st.done / st.total) * 100)}%` })) : null
      ),
      flat ? null : h('button', { type: 'button', class: 'icon', 'data-act': 'add', 'aria-label': 'Agregar subtarea' }, '+'),
      !flat && kids.length ? h('button', {
        type: 'button', class: 'icon fold', 'data-act': 'fold',
        'aria-label': state.collapsed[it.id] ? 'Expandir' : 'Contraer',
        'aria-expanded': String(!state.collapsed[it.id]),
      }, '›') : null
    );
  }

  function inlineAdd(parentId, depth) {
    return h('form', { class: 'inline-add', 'data-parent': parentId, style: `--d:${depth - 1}`, autocomplete: 'off' },
      h('input', { type: 'text', maxlength: '200', placeholder: 'Nueva subtarea…', 'aria-label': 'Nueva subtarea', enterkeyhint: 'done' }),
      h('button', { type: 'button', 'data-act': 'closeadd' }, 'Cerrar')
    );
  }

  function focusInlineAdd() {
    const inp = listEl.querySelector('form.inline-add input');
    if (inp) inp.focus();
  }

  // ---------- acciones ----------
  function doToggle(id) {
    const r = C.toggle(state.items, id);
    if (!r) { toast('Esta meta solo tiene tareas repetitivas'); return; }
    save();
    if (r.advanced) toast('Hecho ✓ · próxima: ' + C.dueLabel({ due: r.advanced }, C.todayStr()).text.toLowerCase());
    render();
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'closeadd') { ui.adding = null; render(); return; }
    const row = btn.closest('[data-id]');
    const id = row && row.dataset.id;
    if (!id) return;
    if (act === 'check') doToggle(id);
    else if (act === 'open') openSheet(id);
    else if (act === 'add') {
      ui.adding = ui.adding === id ? null : id;
      state.collapsed[id] = false;
      save(); render(); focusInlineAdd();
    } else if (act === 'fold') {
      state.collapsed[id] = !state.collapsed[id];
      save(); render();
    }
  });

  listEl.addEventListener('submit', (e) => {
    const form = e.target.closest('form.inline-add');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    const it = C.makeItem({ title, parent: form.dataset.parent });
    state.items.push(it);
    save(); render(); focusInlineAdd();
  });

  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.closest('form.inline-add')) { ui.adding = null; render(); }
  });

  $('#addbar').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#addinput');
    const title = input.value.trim();
    if (!title) return;
    const it = C.makeItem({ title, due: ui.tab === 'today' ? C.todayStr() : '' });
    state.items.push(it);
    input.value = '';
    save(); render();
    const row = listEl.querySelector(`[data-id="${CSS.escape(it.id)}"]`);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  });

  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    b.addEventListener('click', () => { ui.tab = b.dataset.tab; ui.adding = null; render(); });
  }

  // ---------- hoja de edición ----------
  const sheet = $('#sheet');
  const sf = $('#sheet-form');
  const fe = sf.elements;

  function openSheet(id) {
    const it = C.get(state.items, id);
    if (!it) return;
    ui.sheetId = id;
    const hasKids = C.childrenOf(state.items, id).length > 0;
    fe.title.value = it.title;
    fe.due.value = it.due;
    fe.time.value = it.time;
    fe.time.disabled = !it.due;
    fe.repeat.value = it.repeat;
    fe.repeat.disabled = hasKids;
    $('#sheet-hint').hidden = !hasKids;
    sheet.showModal();
  }

  fe.due.addEventListener('change', () => {
    if (!fe.due.value) { fe.time.value = ''; fe.repeat.value = ''; }
    fe.time.disabled = !fe.due.value;
  });
  fe.repeat.addEventListener('change', () => {
    if (fe.repeat.value && !fe.due.value) { fe.due.value = C.todayStr(); fe.time.disabled = false; }
  });

  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    const it = C.get(state.items, ui.sheetId);
    if (it) {
      it.title = fe.title.value.trim().slice(0, 200) || it.title;
      it.due = fe.due.value;
      it.time = it.due ? fe.time.value : '';
      it.repeat = it.due && !fe.repeat.disabled ? fe.repeat.value : '';
      save();
    }
    sheet.close();
    render();
  });

  $('#sheet-delete').addEventListener('click', () => {
    const it = C.get(state.items, ui.sheetId);
    if (!it) return;
    const n = C.removeItem(state.items, it.id).length;
    const gone = state.items.length - n - 1;
    if (gone > 0 && !confirm(`¿Eliminar «${it.title}» y sus ${gone} subtareas?`)) return;
    state.items = C.removeItem(state.items, it.id);
    if (ui.adding === it.id) ui.adding = null;
    save(); sheet.close(); render();
    toast('Eliminada');
  });

  $('#sheet-sub').addEventListener('click', () => {
    const id = ui.sheetId;
    sheet.close();
    ui.tab = 'todo';
    ui.adding = id;
    state.collapsed[id] = false;
    save(); render(); focusInlineAdd();
  });

  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  // ---------- menú ----------
  const menu = $('#menu');
  $('#menu-btn').addEventListener('click', () => { refreshNotifStatus(); $('#hide-done').checked = state.hideDone; menu.showModal(); });
  $('#menu-close').addEventListener('click', () => menu.close());
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });

  $('#hide-done').addEventListener('change', (e) => { state.hideDone = e.target.checked; save(); render(); });

  $('#export-btn').addEventListener('click', () => {
    const data = { app: 'pendientes', version: 1, exported: new Date().toISOString(), items: state.items };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `pendientes-${C.todayStr()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Copia exportada');
  });

  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const items = C.sanitize(JSON.parse(await file.text()));
      if (!confirm(`Se reemplazarán tus datos actuales por ${items.length} elementos del archivo. ¿Continuar?`)) return;
      state.items = items;
      state.collapsed = {};
      ui.adding = null;
      save(); menu.close(); render();
      toast('Copia importada');
    } catch (err) {
      toast('Archivo no válido');
    }
  });

  // ---------- recordatorios ----------
  function refreshNotifStatus() {
    const st = $('#notif-status');
    const btn = $('#notif-btn');
    if (!('Notification' in window)) {
      st.textContent = 'No disponible en este navegador.';
      btn.hidden = true;
      return;
    }
    btn.hidden = Notification.permission !== 'default';
    st.textContent = {
      granted: 'Activados. Avisan a la hora de cada tarea mientras la app esté abierta o en segundo plano.',
      denied: 'Bloqueados en el navegador. Actívalos desde los ajustes del sitio.',
      default: 'Desactivados. Se programan con fecha y hora en cada tarea.',
    }[Notification.permission];
  }

  $('#notif-btn').addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch (e) { /* el navegador no lo permite */ }
    refreshNotifStatus();
    tick();
  });

  async function notify(it) {
    const body = (it.repeat ? '↻ ' : '') + 'Pendiente' + (it.time ? ' · ' + it.time : '');
    const opts = { body, tag: it.id, icon: 'icons/icon-192.png' };
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) { await reg.showNotification(it.title, opts); return; }
    } catch (e) { /* se intenta el método directo */ }
    try { new Notification(it.title, opts); } catch (e) { /* sin permiso o no soportado */ }
  }

  function tick() {
    if (C.todayStr() !== ui.day) render(); // cambió el día
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const r = C.reminderCheck(state.items, Date.now());
    if (!r.fire.length && !r.silent.length) return;
    r.fire.forEach(({ item, key }) => { item.notified = key; notify(item); });
    r.silent.forEach(({ item, key }) => { item.notified = key; });
    save();
  }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); render(); } });

  // ---------- arranque ----------
  render();
  tick();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
