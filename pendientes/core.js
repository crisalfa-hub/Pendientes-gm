/* core.js — lógica pura (sin DOM): fechas, progreso, repetición, recordatorios.
   Se carga en el navegador como window.Core y también se puede probar en Node. */
(function (root) {
  'use strict';

  const REPEATS = ['daily', 'weekly', 'monthly'];
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // ---------- fechas (siempre en hora local, formato YYYY-MM-DD) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const todayStr = (now) => ymd(now || new Date());

  function addInterval(s, rep) {
    const d = parseYmd(s);
    if (rep === 'daily') d.setDate(d.getDate() + 1);
    else if (rep === 'weekly') d.setDate(d.getDate() + 7);
    else if (rep === 'monthly') {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
    }
    return ymd(d);
  }

  // Siguiente fecha de una tarea repetitiva: siempre posterior a hoy.
  function nextDue(due, rep, now) {
    now = now || todayStr();
    let n = addInterval(due || now, rep);
    while (n <= now) n = addInterval(n, rep);
    return n;
  }

  // ---------- elementos ----------
  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function makeItem(o) {
    return {
      id: uid(),
      parent: o.parent || null,
      title: String(o.title || '').trim().slice(0, 200),
      done: false,
      due: o.due || '',
      time: '',
      repeat: '',
      notified: '',
      created: Date.now(),
      count: 0,
    };
  }

  const get = (items, id) => items.find((i) => i.id === id);
  const childrenOf = (items, id) => items.filter((i) => i.parent === id);

  // Hojas "terminables": sin hijos y que no se repiten.
  function finishableLeaves(items, id) {
    const out = [];
    (function walk(i) {
      const kids = childrenOf(items, i);
      if (!kids.length) {
        const it = get(items, i);
        if (it && !it.repeat) out.push(it);
      } else kids.forEach((k) => walk(k.id));
    })(id);
    return out;
  }

  function stats(items, id) {
    const l = finishableLeaves(items, id);
    return { done: l.filter((x) => x.done).length, total: l.length };
  }

  function isDone(items, it) {
    const s = stats(items, it.id);
    return s.total > 0 && s.done === s.total;
  }

  function overall(items) {
    const leaves = items.filter((i) => !items.some((k) => k.parent === i.id) && !i.repeat);
    return { done: leaves.filter((l) => l.done).length, total: leaves.length };
  }

  // Marca / desmarca. Metas con subtareas: marca todas sus hojas. Repetitivas: avanza la fecha.
  function toggle(items, id, now) {
    const it = get(items, id);
    if (!it) return null;
    if (childrenOf(items, id).length) {
      const leaves = finishableLeaves(items, id);
      if (!leaves.length) return null;
      const all = leaves.every((l) => l.done);
      leaves.forEach((l) => { l.done = !all; });
      return { bulk: true, done: !all };
    }
    if (it.repeat) {
      const n = nextDue(it.due, it.repeat, now || todayStr());
      it.due = n;
      it.notified = '';
      it.count = (it.count || 0) + 1;
      return { advanced: n };
    }
    it.done = !it.done;
    return { done: it.done };
  }

  function removeItem(items, id) {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of items) {
        if (i.parent && ids.has(i.parent) && !ids.has(i.id)) { ids.add(i.id); grew = true; }
      }
    }
    return items.filter((i) => !ids.has(i.id));
  }

  function pathOf(items, it) {
    const names = [];
    let p = it.parent;
    const seen = new Set();
    while (p && !seen.has(p)) {
      seen.add(p);
      const par = get(items, p);
      if (!par) break;
      names.unshift(par.title);
      p = par.parent;
    }
    return names;
  }

  // ---------- importación segura ----------
  function sanitize(data) {
    const arr = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(arr)) throw new Error('Formato no válido');
    const seen = new Set();
    const out = [];
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const id = String(r.id || '');
      const title = String(r.title || '').trim().slice(0, 200);
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        parent: r.parent ? String(r.parent) : null,
        title,
        done: !!r.done,
        due: /^\d{4}-\d{2}-\d{2}$/.test(r.due || '') ? r.due : '',
        time: /^\d{2}:\d{2}$/.test(r.time || '') ? r.time : '',
        repeat: REPEATS.includes(r.repeat) ? r.repeat : '',
        notified: String(r.notified || ''),
        created: Number(r.created) || Date.now(),
        count: Number(r.count) || 0,
      });
    }
    const ids = new Set(out.map((i) => i.id));
    out.forEach((i) => { if (i.parent && (!ids.has(i.parent) || i.parent === i.id)) i.parent = null; });
    const byId = new Map(out.map((i) => [i.id, i]));
    out.forEach((i) => {
      let p = i.parent;
      const path = new Set([i.id]);
      while (p) {
        if (path.has(p)) { i.parent = null; break; }
        path.add(p);
        p = byId.get(p).parent;
      }
    });
    return out;
  }

  // ---------- vencimientos y recordatorios ----------
  function dueDT(it) {
    if (!it.due || !it.time) return null;
    const d = parseYmd(it.due);
    const [h, m] = it.time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  function reminderCheck(items, nowMs, graceMs) {
    graceMs = graceMs == null ? 6 * 3600e3 : graceMs;
    const fire = [];
    const silent = [];
    for (const it of items) {
      const dt = dueDT(it);
      if (!dt || isDone(items, it)) continue;
      const key = it.due + ' ' + it.time;
      if (it.notified === key) continue;
      const late = nowMs - dt.getTime();
      if (late >= 0) (late <= graceMs ? fire : silent).push({ item: it, key });
    }
    return { fire, silent };
  }

  function dueLabel(it, today) {
    if (!it.due) return { text: '', overdue: false };
    const diff = Math.round((parseYmd(it.due) - parseYmd(today)) / 864e5);
    const d = parseYmd(it.due);
    let txt;
    if (diff === 0) txt = 'Hoy';
    else if (diff === 1) txt = 'Mañana';
    else if (diff === -1) txt = 'Ayer';
    else txt = `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
    if (it.time) txt += ' · ' + it.time;
    return { text: txt, overdue: diff < 0 };
  }

  function dueList(items, today) {
    const arr = items.filter((i) => i.due && i.due <= today && !isDone(items, i));
    arr.sort((a, b) => (a.due + (a.time || '99:99')).localeCompare(b.due + (b.time || '99:99')));
    return { overdue: arr.filter((i) => i.due < today), today: arr.filter((i) => i.due === today) };
  }

  const api = {
    REPEATS, ymd, parseYmd, todayStr, addInterval, nextDue, makeItem, get, childrenOf,
    finishableLeaves, stats, isDone, overall, toggle, removeItem, pathOf, sanitize,
    dueDT, reminderCheck, dueLabel, dueList,
  };
  root.Core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
