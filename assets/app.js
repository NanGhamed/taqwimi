/* ============================================================
   تقويمي — مؤتمر ومعرض الحج النسخة السادسة
   تطبيق ويب تقدمي (PWA) يعمل دون اتصال
   ============================================================ */
(function () {
  'use strict';

  const DATA = window.TAQWIMI_DATA;
  const APP = { name: 'تقويمي', version: 1 };
  const STORE_KEY = 'taqwimi.v1.user';
  const UI_KEY = 'taqwimi.v1.ui';
  const INSTALL_KEY = 'taqwimi.v1.install';
  const NOTIFIED_KEY = 'taqwimi.v1.notified';

  /* ---------------- helpers ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const icon = (name, cls) =>
    `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { toast('تعذّر حفظ البيانات محليًا. قد تكون مساحة التخزين ممتلئة.', 'err'); return false; }
  }

  const pad = (n) => String(n).padStart(2, '0');

  function evCount(n) {
    if (n === 1) return 'فعالية واحدة';
    if (n === 2) return 'فعاليتان';
    if (n >= 3 && n <= 10) return `${n} فعاليات`;
    return `${n} فعالية`;
  }

  function to12(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h < 12 ? 'ص' : 'م';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${pad(h12)}:${pad(m)} ${suffix}`;
  }

  function compactTime(t) {
    return String(t || '').replace(/(^|[\s(])0(\d:)/g, '$1$2');
  }

  /* Renders the time as two clear lines (start / end) whenever the PDF
     provided numeric start and end times; otherwise falls back to the
     exact wording of the source PDF. */
  function timeCell(o) {
    let start = o.start;
    let end = o.end;
    if (!start && o.eventId && typeof EVENT_BY_ID !== 'undefined') {
      const ev = EVENT_BY_ID.get(o.eventId);
      if (ev) { start = ev.start; end = ev.end; }
    }
    if (start && end) {
      return `<div class="c-time"><span class="t-start">${esc(to12(start))}</span><span class="t-end">إلى ${esc(to12(end))}</span></div>`;
    }
    if (start) {
      return `<div class="c-time"><span class="t-start">${esc(to12(start))}</span></div>`;
    }
    return `<div class="c-time c-time-text">${esc(compactTime(o.timeText) || 'بدون توقيت')}</div>`;
  }

  function durCell(o) {
    if (!o.durationText) return '';
    return `<div class="c-dur">${esc(o.durationText)}</div>`;
  }

  function isoToDate(iso, hhmm) {
    const [y, m, d] = iso.split('-').map(Number);
    const [h, mi] = (hhmm || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, mi, 0, 0);
  }

  function dayInfo(dayId) {
    return DATA.days.find((d) => d.id === dayId);
  }

  const EVENT_BY_ID = new Map(DATA.events.map((e) => [e.id, e]));
  const OCC_BY_ID = new Map(DATA.occurrences.map((o) => [o.id, o]));
  const OCC_BY_EVENT = new Map();
  DATA.occurrences.forEach((o) => {
    if (!OCC_BY_EVENT.has(o.eventId)) OCC_BY_EVENT.set(o.eventId, []);
    OCC_BY_EVENT.get(o.eventId).push(o);
  });

  /* ---------------- state ---------------- */
  const defaultState = () => ({
    version: APP.version,
    name: '',
    events: {},
    settings: {
      view: 'table',
      notificationsEnabled: false,
      defaultReminder: 10,
      lastRoute: 'program',
      lastDay: DATA.days[0].id,
    },
  });

  let state = Object.assign(defaultState(), readJSON(STORE_KEY, {}));
  state.events = state.events || {};
  state.settings = Object.assign(defaultState().settings, state.settings || {});

  let ui = Object.assign({ section: 'all', filter: 'all', q: '' }, readJSON(UI_KEY, {}));

  let saveTimer = null;
  function save(immediate) {
    const run = () => { writeJSON(STORE_KEY, state); };
    if (immediate) { clearTimeout(saveTimer); run(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(run, 350);
  }

  function rec(id) {
    if (!state.events[id]) {
      state.events[id] = { priority: null, attendance: null, notes: '', reminder: null };
    }
    return state.events[id];
  }
  function recSafe(id) {
    return state.events[id] || { priority: null, attendance: null, notes: '', reminder: null };
  }
  function isSelected(id) { return !!recSafe(id).priority; }
  function selectedEvents() {
    return DATA.events.filter((e) => isSelected(e.id));
  }
  function sortEvents(list) {
    return list.slice().sort((a, b) => {
      if (a.dayId !== b.dayId) return a.dayId < b.dayId ? -1 : 1;
      const as = a.start || '99:99', bs = b.start || '99:99';
      if (as !== bs) return as < bs ? -1 : 1;
      return a.title.localeCompare(b.title, 'ar');
    });
  }

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    const host = $('#toast-host');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  /* ---------------- modal ---------------- */
  let modalStack = [];
  function openModal(opts) {
    const host = $('#modal-host');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <h2 id="modal-title">${esc(opts.title || '')}</h2>
          <button class="modal-close" type="button" aria-label="إغلاق">${icon('x')}</button>
        </div>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
      </div>`;
    host.appendChild(backdrop);
    const close = () => {
      backdrop.remove();
      modalStack = modalStack.filter((m) => m !== backdrop);
      if (opts.onClose) opts.onClose();
      if (opts.returnFocus && opts.returnFocus.focus) opts.returnFocus.focus();
    };
    modalStack.push(backdrop);
    $('.modal-close', backdrop).addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' && modalStack.includes(backdrop)) {
        document.removeEventListener('keydown', onKey);
        close();
      }
    });
    if (opts.onMount) opts.onMount(backdrop, close);
    const focusable = backdrop.querySelector('button, input, select, textarea, [href]');
    if (focusable) setTimeout(() => focusable.focus(), 40);
    return close;
  }

  /* ---------------- routing ---------------- */
  const nav = { stack: [], index: -1 };
  let restoring = false;

  function currentRoute() {
    const h = location.hash || '#/program';
    const m = h.match(/^#\/(program|my|settings)(?:\/([0-9-]+))?(?:\?(.*))?$/);
    if (!m) return { name: 'program', day: state.settings.lastDay, params: {} };
    const params = {};
    (m[3] || '').split('&').filter(Boolean).forEach((kv) => {
      const [k, v] = kv.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { name: m[1], day: m[2] || null, params };
  }

  function href(route, day, params) {
    let h = '#/' + route;
    if (day) h += '/' + day;
    const qs = Object.entries(params || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    if (qs) h += '?' + qs;
    return h;
  }

  function go(h, opts) {
    opts = opts || {};
    if (opts.replace) {
      history.replaceState(null, '', h);
      handleHash(true);
      return;
    }
    if (location.hash === h) { render(); return; }
    location.hash = h;
  }

  function saveScroll() {
    const e = nav.stack[nav.index];
    if (e && !restoring) e.scroll = window.scrollY;
  }

  function handleHash(fromReplace) {
    const h = location.hash || '#/program';
    let entry;
    if (fromReplace) {
      entry = nav.stack[nav.index] || { hash: h, scroll: 0 };
      entry.hash = h;
      if (nav.index < 0) { nav.stack = [entry]; nav.index = 0; }
    } else if (nav.index > 0 && nav.stack[nav.index - 1].hash === h) {
      nav.index -= 1;
      entry = nav.stack[nav.index];
    } else if (nav.index >= 0 && nav.index + 1 < nav.stack.length && nav.stack[nav.index + 1].hash === h) {
      nav.index += 1;
      entry = nav.stack[nav.index];
    } else {
      nav.stack = nav.stack.slice(0, nav.index + 1);
      entry = { hash: h, scroll: 0 };
      nav.stack.push(entry);
      nav.index = nav.stack.length - 1;
    }
    render();
    restoring = true;
    requestAnimationFrame(() => {
      window.scrollTo(0, entry.scroll || 0);
      setTimeout(() => { restoring = false; }, 60);
    });
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    const back = $('#btn-back');
    const fwd = $('#btn-forward');
    if (!back || !fwd) return;
    back.disabled = nav.index <= 0;
    fwd.disabled = nav.index < 0 || nav.index >= nav.stack.length - 1;
  }

  /* ---------------- program view ---------------- */
  function dayOccurrences(dayId) {
    return DATA.occurrences.filter((o) => o.dayId === dayId);
  }

  function occMatches(o, q, filter) {
    const ev = EVENT_BY_ID.get(o.eventId);
    if (!ev) return false;
    if (filter === 'first' && recSafe(ev.id).priority !== 'first') return false;
    if (filter === 'alt' && recSafe(ev.id).priority !== 'alt') return false;
    if (filter === 'selected' && !isSelected(ev.id)) return false;
    if (!q) return true;
    const hay = [ev.title, ev.place, ev.track, ev.category, ev.speaker, ev.type, o.place, o.speaker]
      .join(' ').toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w.toLowerCase()));
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return esc(text);
    const re = new RegExp('(' + words.join('|') + ')', 'gi');
    return esc(text).replace(re, '<mark>$1</mark>');
  }

  function priorityButtons(eventId, compact, withClear) {
    const r = recSafe(eventId);
    if (withClear === undefined) withClear = true;
    return `<div class="prio-group" data-prio="${eventId}">
      <button class="prio-btn first" type="button" data-set-prio="first" aria-pressed="${r.priority === 'first'}" title="أولوية أولى">
        ${icon('star')}<span>${compact ? '' : 'أولوية أولى'}</span>
      </button>
      <button class="prio-btn alt" type="button" data-set-prio="alt" aria-pressed="${r.priority === 'alt'}" title="خيار بديل">
        ${icon('flag')}<span>${compact ? '' : 'خيار بديل'}</span>
      </button>
      ${(withClear && r.priority) ? `<button class="prio-btn clear" type="button" data-set-prio="" title="إزالة التحديد" aria-label="إزالة التحديد">${icon('x')}</button>` : ''}
    </div>`;
  }

  function renderOccurrenceRow(o, q) {
    const ev = EVENT_BY_ID.get(o.eventId);
    const r = recSafe(ev.id);
    const others = OCC_BY_EVENT.get(ev.id) || [];
    const dup = others.length > 1
      ? `<button class="dup-note" type="button" data-goto-occ="${esc(others.find((x) => x.id !== o.id).id)}" title="هذه الفعالية تظهر في أكثر من قسم، وتُحفظ مرة واحدة في تقويمك">
           ${icon('link')} تظهر أيضًا في قسم آخر
         </button>`
      : '';
    const tags = [];
    if (o.type) tags.push(`<span class="tag gold">${esc(o.type)}</span>`);
    if (o.track) tags.push(`<span class="tag">${esc(o.track)}</span>`);
    if (o.category) tags.push(`<span class="tag green">${esc(o.category)}</span>`);
    if (o.speaker) tags.push(`<span class="tag">${esc(o.speaker)}</span>`);
    const bell = r.reminder != null
      ? `<span class="tag green" title="تنبيه مفعّل">${icon('bell')} ${r.reminder === 0 ? 'عند البدء' : 'قبل ' + r.reminder + ' د'}</span>`
      : '';

    return `<tr data-occ="${esc(o.id)}" data-event="${esc(ev.id)}" class="${isSelected(ev.id) ? 'is-selected' : ''}">
      <td class="c-time-cell">
        ${timeCell(o)}
        ${durCell(o)}
      </td>
      <td class="c-title-cell">
        <div class="c-title">${highlight(ev.title, q)}</div>
        <div class="c-sub">${tags.join('')}${dup}${bell}</div>
      </td>
      <td class="c-place-cell">
        <div class="c-place">${o.place ? icon('pin') + ' ' + highlight(o.place, q) : '<span class="muted">—</span>'}</div>
      </td>
      <td class="c-actions">
        ${priorityButtons(ev.id, false, false)}
        <div class="act-sub" data-prio="${esc(ev.id)}">
          ${r.priority ? `<button class="prio-btn clear" type="button" data-set-prio="" title="إزالة التحديد" aria-label="إزالة التحديد">${icon('x')}</button>` : ''}
          <button class="btn btn-sm btn-ghost" type="button" data-details="${esc(ev.id)}" title="تفاصيل الفعالية">${icon('info')} تفاصيل</button>
          <button class="btn btn-sm btn-ghost" type="button" data-reminder="${esc(ev.id)}" title="تنبيه">${icon('bell')}</button>
        </div>
      </td>
    </tr>`;
  }

  function renderTable(occs, q) {
    if (!occs.length) return '';
    return `<div class="table-wrap">
      <table class="prog">
        <thead><tr>
          <th scope="col">التوقيت</th>
          <th scope="col">العنوان</th>
          <th scope="col">المكان</th>
          <th scope="col">اختياري</th>
        </tr></thead>
        <tbody>${occs.map((o) => renderOccurrenceRow(o, q)).join('')}</tbody>
      </table>
    </div>`;
  }

  function renderEmpty(text) {
    return `<div class="empty">${icon('empty')}<div><strong>${esc(text || 'لا توجد فعاليات')}</strong><div class="small">لم تُدرج فعاليات في هذا القسم ضمن البرنامج الرسمي.</div></div></div>`;
  }

  function sectionOccurrences(dayId, sectionId, subId) {
    return DATA.occurrences.filter((o) => o.dayId === dayId && o.sectionId === sectionId &&
      (subId == null ? true : o.subsectionId === subId));
  }

  function renderProgram() {
    const route = currentRoute();
    const dayId = (route.day && dayInfo(route.day)) ? route.day : state.settings.lastDay;
    if (state.settings.lastDay !== dayId) { state.settings.lastDay = dayId; save(); }
    const day = dayInfo(dayId);
    const q = ui.q.trim();

    const dayTabs = DATA.days.map((d) => {
      const sel = d.id === dayId;
      return `<button class="daytab" type="button" role="tab" aria-selected="${sel}" data-day="${d.id}">
        <span class="dt-day">${esc(d.weekday)}</span>
        <span class="dt-date">${esc(d.dateLabel.replace(d.weekday + ' ', ''))}</span>
      </button>`;
    }).join('');

    const sectionNames = { conference: 'المؤتمر', majlis: 'مجلس الحج', forum: 'الملتقى', workshops: 'ورش العمل' };
    const sectionChips = ['all', 'conference', 'majlis', 'forum', 'workshops'].map((s) =>
      `<button class="chip" type="button" data-section="${s}" aria-pressed="${ui.section === s}">${s === 'all' ? 'كل الأقسام' : sectionNames[s]}</button>`
    ).join('');
    const filterChips = [
      ['all', 'الكل'],
      ['selected', 'المحدد فقط'],
      ['first', 'أولوية أولى'],
      ['alt', 'خيار بديل'],
    ].map(([k, label]) =>
      `<button class="chip" type="button" data-filter="${k}" aria-pressed="${ui.filter === k}">${label}</button>`
    ).join('');

    let sectionsHtml = '';
    let visibleTotal = 0;
    const searching = !!q || ui.filter !== 'all';

    day.sections.forEach((sec, si) => {
      if (ui.section !== 'all' && ui.section !== sec.id) return;

      let inner = '';
      if (sec.id === 'forum') {
        (sec.subsections || []).forEach((sub) => {
          const all = sectionOccurrences(dayId, 'forum', sub.id);
          const shown = all.filter((o) => occMatches(o, q, ui.filter));
          visibleTotal += shown.length;
          if (!shown.length && (searching || sub.empty)) {
            if (sub.empty && !searching) {
              inner += `<div class="subsection">
                <div class="subsection-head"><span class="dot"></span><h3>${esc(sub.title)}</h3></div>
                ${renderEmpty(sub.emptyText)}
              </div>`;
            }
            return;
          }
          inner += `<div class="subsection">
            <div class="subsection-head"><span class="dot"></span><h3>${esc(sub.title)}</h3>
              <span class="section-badge">${shown.length}</span></div>
            ${renderTable(shown, q)}
          </div>`;
        });
        if (!inner) return;
      } else {
        const all = sectionOccurrences(dayId, sec.id, null);
        const shown = all.filter((o) => occMatches(o, q, ui.filter));
        visibleTotal += shown.length;
        if (!shown.length) {
          if (searching || !sec.empty) return;
          inner = renderEmpty(sec.emptyText);
        } else {
          inner = renderTable(shown, q);
        }
      }

      sectionsHtml += `<section class="section" aria-labelledby="sec-${sec.id}">
        <div class="section-head">
          <span class="section-num">${si + 1}</span>
          <h2 id="sec-${sec.id}">${esc(sec.title)}</h2>
          <span class="section-badge">${sec.id === 'forum'
            ? (sec.subsections || []).reduce((n, s) => n + sectionOccurrences(dayId, 'forum', s.id).length, 0)
            : sectionOccurrences(dayId, sec.id, null).length}</span>
        </div>
        ${inner}
      </section>`;
    });

    if (!sectionsHtml) {
      sectionsHtml = `<div class="card"><div class="empty">${icon('search')}
        <div><strong>لا توجد نتائج مطابقة</strong>
        <div class="small">جرّب كلمة بحث أخرى أو أزل عوامل التصفية.</div></div></div></div>`;
    }

    return `<div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">البرنامج</h1>
          <p class="page-sub">مؤتمر ومعرض الحج النسخة السادسة — ${esc(day.weekday)} ${esc(day.dateLabel.replace(day.weekday + ' ', ''))} <span class="ps-count">· ${evCount(visibleTotal)} في البرنامج</span></p>
        </div>
        <div class="chips" style="align-items:center">
          <span class="small muted">${evCount(isSelectedCount())} في تقويمك</span>
          <button class="btn btn-sm" type="button" data-go="my">${icon('bookmark')} تقويمي</button>
        </div>
      </div>

      <div class="daytabs" role="tablist" aria-label="أيام المؤتمر">${dayTabs}</div>

      <div class="toolbar">
        <div class="searchbox">
          ${icon('search')}
          <input type="search" id="q" placeholder="ابحث عن فعالية، متحدث، مسار، أو مكان…" value="${esc(ui.q)}" aria-label="بحث في البرنامج">
        </div>
        <div class="filter-groups">
          <div class="fgroup" role="group" aria-label="تصفية حسب القسم">
            <span class="fgroup-label">${icon('calendar')} الأقسام</span>
            <div class="chips">${sectionChips}</div>
          </div>
          <div class="fgroup" role="group" aria-label="تصفية حسب حالة الاختيار">
            <span class="fgroup-label">${icon('star')} حالة الاختيار</span>
            <div class="chips">${filterChips}</div>
          </div>
        </div>
      </div>

      ${sectionsHtml}
      ${renderFooter()}
    </div>`;
  }

  function renderFooter() {
    return `<footer class="site-footer">
      <img class="footer-logo" src="icons/committee-logo-320.png" alt="شعار لجنة التحول الرقمي والذكاء الاصطناعي" width="96" height="96" loading="lazy">
      <div class="footer-text">
        <strong>إهداء من لجنة التحول الرقمي والذكاء الاصطناعي — نون متحد</strong>
      </div>
    </footer>`;
  }

  function isSelectedCount() { return selectedEvents().length; }

  /* ---------------- my calendar ---------------- */
  function overlaps(list) {
    const pairs = [];
    const byDay = {};
    list.forEach((e) => {
      (byDay[e.dayId] = byDay[e.dayId] || []).push(e);
    });
    Object.values(byDay).forEach((arr) => {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          const ar = a.ranges && a.ranges.length ? a.ranges : (a.start && a.end ? [{ start: a.start, end: a.end }] : []);
          const br = b.ranges && b.ranges.length ? b.ranges : (b.start && b.end ? [{ start: b.start, end: b.end }] : []);
          let hit = false;
          ar.forEach((x) => br.forEach((y) => {
            if (x.start < y.end && y.start < x.end) hit = true;
          }));
          if (hit) pairs.push([a, b]);
        }
      }
    });
    return pairs;
  }

  function nextEvent() {
    const now = new Date();
    const list = sortEvents(selectedEvents()).filter((e) => e.start);
    if (!list.length) return null;
    for (const e of list) {
      const end = isoToDate(e.dayId, e.end || e.start);
      if (end >= now) return e;
    }
    return null;
  }

  function renderNextCard() {
    const e = nextEvent();
    if (!e) {
      if (!isSelectedCount()) {
        return `<div class="nextcard is-empty">
          <div></div>
          <div>
            <div class="nc-label">ابدأ من هنا</div>
            <div class="nc-title">لم تختر أي فعالية بعد</div>
            <div class="nc-meta">تصفّح البرنامج وحدّد الفعاليات التي تهمّك بأولوية أولى أو كخيار بديل.</div>
          </div>
          <div><button class="btn btn-primary" type="button" data-go="program">${icon('calendar')} تصفّح البرنامج</button></div>
        </div>`;
      }
      return `<div class="nextcard is-empty">
        <div></div>
        <div>
          <div class="nc-label">انتهى البرنامج</div>
          <div class="nc-title">لا توجد فعاليات قادمة ضمن اختياراتك</div>
          <div class="nc-meta">يمكنك مراجعة سجل الحضور والملاحظات أدناه.</div>
        </div>
        <div></div>
      </div>`;
    }
    const day = dayInfo(e.dayId);
    const isNow = isoToDate(e.dayId, e.start) <= new Date() && isoToDate(e.dayId, e.end || e.start) >= new Date();
    return `<div class="nextcard">
      <div>
        <div class="nc-label">${isNow ? 'جارٍ الآن' : 'الفعالية القادمة'}</div>
        <div class="nc-time">${esc(to12(e.start))}<small>${e.end ? 'حتى ' + esc(to12(e.end)) : esc(e.timeText || '')}</small></div>
      </div>
      <div>
        <div class="nc-title">${esc(e.title)}</div>
        <div class="nc-meta">
          <span>${icon('calendar')} ${esc(day.weekday)} ${esc(day.dateLabel.replace(day.weekday + ' ', ''))}</span>
          ${e.place ? `<span>${icon('pin')} ${esc(e.place)}</span>` : ''}
          <span>${recSafe(e.id).priority === 'first' ? 'أولوية أولى' : 'خيار بديل'}</span>
        </div>
      </div>
      <div><button class="btn btn-sm" type="button" data-details="${esc(e.id)}">${icon('info')} التفاصيل</button></div>
    </div>`;
  }

  function reminderLabel(v) {
    if (v == null) return 'بدون تنبيه';
    if (v === 0) return 'عند البدء';
    return 'قبل ' + v + ' دقيقة';
  }

  function renderMyTable(list) {
    const rows = list.map((e) => {
      const day = dayInfo(e.dayId);
      const r = recSafe(e.id);
      const att = r.attendance;
      return `<tr data-event="${esc(e.id)}">
        <td class="mc-day" data-label="اليوم">${esc(day.weekday)}</td>
        <td class="mc-date" data-label="التاريخ">${esc(day.dateLabel.replace(day.weekday + ' ', ''))}</td>
        <td class="mc-title" data-label="العنوان">
          <div>${esc(e.title)}</div>
          <div class="c-sub" style="margin-top:4px">
            ${r.priority === 'first' ? '<span class="pill first">أولوية أولى</span>' : '<span class="pill alt">خيار بديل</span>'}
            ${e.track ? `<span class="tag">${esc(e.track)}</span>` : ''}
            ${(OCC_BY_EVENT.get(e.id) || []).length > 1 ? `<span class="tag gold">${icon('link')} يظهر في أكثر من قسم</span>` : ''}
          </div>
        </td>
        <td class="mc-time" data-label="التوقيت">${timeCell(e)}</td>
        <td class="mc-place" data-label="المكان"><div class="c-place">${esc(e.place || '—')}</div></td>
        <td class="mc-prio" data-label="الأولوية">
          ${priorityButtons(e.id, true)}
        </td>
        <td class="mc-att" data-label="الحضور">
          <button class="att-btn" type="button" data-att="${esc(e.id)}" data-state="${att || ''}">
            ${att === 'attended' ? icon('check') + ' حضرت' : att === 'missed' ? icon('x') + ' لم أحضر' : 'تسجيل الحضور'}
          </button>
          <button class="btn btn-sm btn-ghost" type="button" data-reminder="${esc(e.id)}" title="تنبيه">
            ${icon('bell')} ${esc(reminderLabel(r.reminder))}
          </button>
        </td>
        <td class="mc-note" data-label="ملاحظات">
          <textarea rows="1" data-note="${esc(e.id)}" placeholder="اكتب ملاحظتك…" aria-label="ملاحظات ${esc(e.title)}">${esc(r.notes)}</textarea>
        </td>
      </tr>`;
    }).join('');

    return `<div class="scroll-hint no-print">${icon('link')} اسحب الجدول أفقيًا لعرض بقية الأعمدة</div>
      <div class="card">
      <div class="mycal-wrap">
        <table class="mycal">
          <thead><tr>
            <th scope="col">اليوم</th>
            <th scope="col">التاريخ</th>
            <th scope="col">العنوان</th>
            <th scope="col">التوقيت</th>
            <th scope="col">المكان</th>
            <th scope="col">الأولوية</th>
            <th scope="col">حالة الحضور</th>
            <th scope="col">الملاحظات</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  function renderTimeline(list) {
    const byDay = {};
    list.forEach((e) => { (byDay[e.dayId] = byDay[e.dayId] || []).push(e); });
    return `<div class="timeline">` + DATA.days.filter((d) => byDay[d.id]).map((d) => {
      const arr = byDay[d.id].sort((a, b) => (a.start || '99:99') < (b.start || '99:99') ? -1 : 1);
      return `<div class="tl-day">
        <div class="tl-day-head">
          <h3>${esc(d.weekday)} · ${esc(d.dateLabel.replace(d.weekday + ' ', ''))}</h3>
          <span class="line"></span>
          <span class="cnt">${evCount(arr.length)}</span>
        </div>
        <div class="tl-items">
          ${arr.map((e) => {
            const r = recSafe(e.id);
            return `<div class="tl-item ${r.priority === 'alt' ? 'alt' : ''}" data-event="${esc(e.id)}">
              <div class="tl-card">
                <div class="tl-time">${esc(to12(e.start) || '—')}<small>${e.end ? 'حتى ' + esc(to12(e.end)) : esc(e.timeText || 'بدون توقيت')}</small></div>
                <div class="tl-body">
                  <div class="t">${esc(e.title)}</div>
                  <div class="m">
                    ${e.place ? `<span>${icon('pin')} ${esc(e.place)}</span>` : ''}
                    ${e.track ? `<span class="tag">${esc(e.track)}</span>` : ''}
                    ${r.notes ? `<span class="tag">${icon('info')} ملاحظة</span>` : ''}
                  </div>
                </div>
                <div class="tl-side">
                  ${r.priority === 'first' ? '<span class="pill first">أولوية أولى</span>' : '<span class="pill alt">خيار بديل</span>'}
                  <button class="att-btn" type="button" data-att="${esc(e.id)}" data-state="${r.attendance || ''}">
                    ${r.attendance === 'attended' ? 'حضرت' : r.attendance === 'missed' ? 'لم أحضر' : 'تسجيل الحضور'}
                  </button>
                  <button class="btn btn-sm btn-ghost" type="button" data-details="${esc(e.id)}">${icon('info')}</button>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  function renderMy() {
    const list = sortEvents(selectedEvents());
    const first = list.filter((e) => recSafe(e.id).priority === 'first').length;
    const alt = list.length - first;
    const attended = list.filter((e) => recSafe(e.id).attendance === 'attended').length;
    const pairs = overlaps(list);

    let body;
    if (!list.length) {
      body = `<div class="card"><div class="empty" style="flex-direction:column;text-align:center;padding:44px 20px">
        ${icon('bookmark')}
        <div>
          <strong style="font-size:16px">تقويمك الشخصي فارغ</strong>
          <div class="small" style="margin-top:6px;max-width:420px">اختر الفعاليات من صفحة البرنامج بضغط «أولوية أولى» أو «خيار بديل»، وستظهر هنا مع ملاحظاتك وحالة حضورك.</div>
          <button class="btn btn-primary" type="button" data-go="program" style="margin-top:16px">${icon('calendar')} تصفّح البرنامج</button>
        </div>
      </div></div>`;
    } else {
      body = (state.settings.view === 'timeline' ? renderTimeline(list) : renderMyTable(list));
    }

    return `<div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">تقويمي</h1>
          <p class="page-sub">${state.name ? esc(state.name) + ' — ' : ''}فعالياتك المختارة وملاحظاتك، محفوظة على جهازك.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap" class="no-print">
          <div class="viewswitch" role="group" aria-label="طريقة العرض">
            <button type="button" data-view="table" aria-pressed="${state.settings.view === 'table'}">${icon('table')} جدول</button>
            <button type="button" data-view="timeline" aria-pressed="${state.settings.view === 'timeline'}">${icon('timeline')} خط زمني</button>
          </div>
          <button class="btn btn-sm" type="button" data-action="print">${icon('print')} طباعة</button>
          <button class="btn btn-sm" type="button" data-action="ics">${icon('download')} تصدير ICS</button>
        </div>
      </div>

      <div class="print-only" style="margin-bottom:14px">
        <h2 style="font-size:18px">تقويمي — مؤتمر ومعرض الحج النسخة السادسة</h2>
        <div class="small">${state.name ? esc(state.name) + ' · ' : ''}${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>

      ${renderNextCard()}

      ${list.length ? `<div class="stats">
        <div class="stat"><div class="s-num">${list.length}</div><div class="s-label">فعالية مختارة</div></div>
        <div class="stat"><div class="s-num">${first}</div><div class="s-label">أولوية أولى</div></div>
        <div class="stat"><div class="s-num">${alt}</div><div class="s-label">خيار بديل</div></div>
        <div class="stat"><div class="s-num">${attended}</div><div class="s-label">تم حضورها</div></div>
      </div>` : ''}

      ${pairs.length ? `<div class="warn" role="status">
        ${icon('warn')}
        <div>
          <strong>تنبيه: تعارض في التوقيت</strong> — لديك ${pairs.length} تداخل بين فعاليات مختارة. لم نحذف أو نغيّر أي اختيار؛ القرار لك.
          <ul>${pairs.slice(0, 6).map(([a, b]) => `<li>${esc(a.title)} <span class="muted">(${esc(a.timeText)})</span> يتقاطع مع ${esc(b.title)} <span class="muted">(${esc(b.timeText)})</span></li>`).join('')}</ul>
          ${pairs.length > 6 ? `<div class="small">و${pairs.length - 6} تداخلًا آخر…</div>` : ''}
        </div>
      </div>` : ''}

      ${body}
    </div>`;
  }

  /* ---------------- settings ---------------- */
  function notifStatus() {
    if (!('Notification' in window)) return { key: 'unsupported', label: 'غير مدعومة في هذا المتصفح', cls: 'status-na' };
    const p = Notification.permission;
    if (p === 'granted') return { key: 'granted', label: 'مفعّلة', cls: 'status-on' };
    if (p === 'denied') return { key: 'denied', label: 'مرفوضة من إعدادات المتصفح', cls: 'status-off' };
    return { key: 'default', label: 'لم تُطلب بعد', cls: 'status-off' };
  }

  function renderSettings() {
    const st = notifStatus();
    const enabled = state.settings.notificationsEnabled && st.key === 'granted';
    const total = DATA.meta.eventsCount;
    return `<div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">الإعدادات</h1>
          <p class="page-sub">بياناتك محفوظة على هذا الجهاز فقط، دون حساب أو تسجيل دخول.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${icon('star')} الاسم</h2><p>اختياري — يظهر في رأس صفحة الطباعة فقط.</p></div>
        <div class="card-body">
          <div class="field">
            <label for="name">الاسم</label>
            <input class="input" id="name" type="text" maxlength="60" placeholder="مثال: عبدالله" value="${esc(state.name)}">
            <div class="hint">لا يُرسل إلى أي جهة، ويبقى في متصفحك.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${icon('bell')} التنبيهات</h2><p>تنبيه محلي قبل بدء الفعالية، اختياري لكل فعالية.</p></div>
        <div class="card-body">
          <div class="row">
            <div>
              <div class="r-title"><span class="status-dot ${st.cls}"></span>حالة التنبيهات: ${esc(st.label)}</div>
              <div class="r-desc">لا نطلب إذن الإشعارات إلا عند تفعيلك لها. تعمل التنبيهات أثناء فتح التطبيق فقط؛ عند إغلاقه لا يمكن إرسال تنبيهات دون خدمة إشعارات خارجية (خادم Push) وهي غير مفعّلة في هذا الإصدار.</div>
            </div>
            <button class="switch" type="button" role="switch" aria-checked="${enabled}" aria-label="تفعيل التنبيهات" data-toggle-notif ${st.key === 'unsupported' ? 'disabled' : ''}></button>
          </div>
          <div class="row">
            <div>
              <div class="r-title">التنبيه الافتراضي</div>
              <div class="r-desc">القيمة المبدئية عند تفعيل تنبيه لفعالية جديدة.</div>
            </div>
            <select class="select" id="default-reminder" style="max-width:180px">
              <option value="0" ${state.settings.defaultReminder === 0 ? 'selected' : ''}>عند البدء</option>
              <option value="5" ${state.settings.defaultReminder === 5 ? 'selected' : ''}>قبل 5 دقائق</option>
              <option value="10" ${state.settings.defaultReminder === 10 ? 'selected' : ''}>قبل 10 دقائق</option>
              <option value="15" ${state.settings.defaultReminder === 15 ? 'selected' : ''}>قبل 15 دقيقة</option>
              <option value="30" ${state.settings.defaultReminder === 30 ? 'selected' : ''}>قبل 30 دقيقة</option>
              <option value="60" ${state.settings.defaultReminder === 60 ? 'selected' : ''}>قبل 60 دقيقة</option>
            </select>
          </div>
          ${st.key === 'denied' ? `<div class="warn" style="margin-top:12px">${icon('warn')}<div>الإشعارات مرفوضة لهذا الموقع. يمكنك إعادة السماح من إعدادات المتصفح ← إعدادات الموقع ← الإشعارات، ثم إعادة المحاولة.</div></div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${icon('download')} النسخ الاحتياطي والاستعادة</h2><p>صدّر اختياراتك وملاحظاتك كملف، أو استعدها على جهاز آخر.</p></div>
        <div class="card-body">
          <div class="row">
            <div><div class="r-title">تصدير نسخة احتياطية</div><div class="r-desc">ملف JSON يحتوي اختياراتك، أولوياتك، ملاحظاتك، وحالة الحضور.</div></div>
            <button class="btn" type="button" data-action="export-backup">${icon('download')} تصدير</button>
          </div>
          <div class="row">
            <div><div class="r-title">استيراد نسخة</div><div class="r-desc">اختر ملفًا، ثم حدّد هل تريد الدمج مع بياناتك الحالية أم الاستبدال الكامل.</div></div>
            <button class="btn" type="button" data-action="import-backup">${icon('upload')} استيراد</button>
            <input type="file" id="import-file" accept="application/json,.json" class="hidden">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${icon('info')} عن التطبيق</h2></div>
        <div class="card-body">
          <div class="row"><div><div class="r-title">مصدر البيانات</div><div class="r-desc">ملف البرنامج الرسمي «تقويمي2.pdf» — ${total} فعالية فريدة، ${DATA.meta.occurrencesCount} ظهورًا في الأقسام.</div></div><span class="pill first">PDF</span></div>
          <div class="row"><div><div class="r-title">العمل دون اتصال</div><div class="r-desc">البرنامج وتقويمك وملاحظاتك تعمل دون إنترنت بعد أول زيارة. الوظائف التي تحتاج اتصالًا: لا شيء أساسي — التثبيت والتنبيهات تعتمد على المتصفح لا على الشبكة.</div></div><span class="pill attended">${icon('check')} مدعوم</span></div>
          <div class="row"><div><div class="r-title">الإصدار</div><div class="r-desc">${APP.name} ${APP.version}.0 — نسخة مراجعة داخلية.</div></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${icon('trash')} البيانات</h2><p>حذف دائم لبياناتك من هذا المتصفح.</p></div>
        <div class="card-body">
          <div class="row">
            <div><div class="r-title">مسح كل اختياراتي وملاحظاتي</div><div class="r-desc">لا يمكن التراجع. صدّر نسخة احتياطية أولًا إن أردت الاحتفاظ بها.</div></div>
            <button class="btn btn-danger" type="button" data-action="reset">${icon('trash')} مسح</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${icon('install')} تثبيت التطبيق</h2><p>أضف تقويمي إلى شاشتك الرئيسية ليعمل كتطبيق مستقل.</p></div>
        <div class="card-body">
          <div class="row">
            <div><div class="r-title">حالة التثبيت</div><div class="r-desc">${isStandalone() ? 'التطبيق مثبّت ويعمل الآن كتطبيق مستقل.' : 'التطبيق يعمل في المتصفح. يمكنك تثبيته للوصول السريع والعمل دون اتصال.'}</div></div>
            ${isStandalone() ? `<span class="pill attended">${icon('check')} مثبّت</span>` : `<button class="btn" type="button" data-action="install">${icon('phone')} تثبيت</button>`}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- details modal ---------------- */
  function openDetails(eventId) {
    const e = EVENT_BY_ID.get(eventId);
    if (!e) return;
    const r = recSafe(e.id);
    const day = dayInfo(e.dayId);
    const others = OCC_BY_EVENT.get(e.id) || [];
    const secNames = { conference: 'المؤتمر', majlis: 'مجلس الحج', forum: 'ملتقى التوعية والتدريب', workshops: 'ورش العمل' };
    const subNames = { main: 'جلسات المسرح الرئيسي', majlis_forum: 'جلسات مجلس الحج', experts: 'استشارات مجلس الخبراء', accompanying: 'الفعاليات المصاحبة', special: 'فعاليات خاصة' };
    const where = others.map((o) => secNames[o.sectionId] + (o.subsectionId ? ' › ' + subNames[o.subsectionId] : '')).join('، ');

    const body = `
      <dl class="detail-grid">
        <dt>اليوم</dt><dd>${esc(day.weekday)} ${esc(day.dateLabel.replace(day.weekday + ' ', ''))}</dd>
        <dt>التوقيت</dt><dd>${esc(e.timeText || 'بدون توقيت')}${e.durationText ? ' · ' + esc(e.durationText) : ''}</dd>
        <dt>المكان</dt><dd>${esc(e.place || '—')}</dd>
        ${e.type ? `<dt>نوع الجلسة</dt><dd>${esc(e.type)}</dd>` : ''}
        ${e.track ? `<dt>المسار</dt><dd>${esc(e.track)}</dd>` : ''}
        ${e.category ? `<dt>التصنيف</dt><dd>${esc(e.category)}</dd>` : ''}
        ${e.speaker ? `<dt>المختص</dt><dd>${esc(e.speaker)}</dd>` : ''}
        <dt>يظهر في</dt><dd>${esc(where)}</dd>
      </dl>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <div class="field">
        <label>الأولوية</label>
        ${priorityButtons(e.id)}
      </div>
      <div class="field">
        <label>التنبيه</label>
        <select class="select" id="detail-reminder">
          <option value="">بدون تنبيه</option>
          <option value="0" ${r.reminder === 0 ? 'selected' : ''}>عند البدء</option>
          <option value="5" ${r.reminder === 5 ? 'selected' : ''}>قبل 5 دقائق</option>
          <option value="10" ${r.reminder === 10 ? 'selected' : ''}>قبل 10 دقائق</option>
          <option value="15" ${r.reminder === 15 ? 'selected' : ''}>قبل 15 دقيقة</option>
          <option value="30" ${r.reminder === 30 ? 'selected' : ''}>قبل 30 دقيقة</option>
          <option value="60" ${r.reminder === 60 ? 'selected' : ''}>قبل 60 دقيقة</option>
        </select>
        <div class="hint">${notifStatus().key === 'granted' ? 'سيصلك تنبيه محلي أثناء فتح التطبيق.' : 'لن يعمل التنبيه حتى تفعّل الإشعارات من الإعدادات.'}</div>
      </div>
      <div class="field">
        <label for="detail-note">ملاحظات</label>
        <textarea class="input" id="detail-note" rows="4" style="max-width:none" placeholder="اكتب ملاحظتك…">${esc(r.notes)}</textarea>
      </div>`;

    openModal({
      title: e.title,
      body,
      footer: `<button class="btn btn-ghost" type="button" data-modal-close>إغلاق</button>
               <button class="btn btn-primary" type="button" data-modal-close data-jump="${esc(e.id)}">${icon('calendar')} اذهب إلى الفعالية في البرنامج</button>`,
      onMount(root, close) {
        root.querySelector('[data-modal-close]').addEventListener('click', close);
        root.querySelectorAll('[data-set-prio]').forEach((b) => {
          b.addEventListener('click', () => { setPriority(e.id, b.dataset.setPrio); close(); openDetails(e.id); });
        });
        const rem = root.querySelector('#detail-reminder');
        rem.addEventListener('change', () => {
          setReminder(e.id, rem.value === '' ? null : Number(rem.value));
        });
        const note = root.querySelector('#detail-note');
        note.addEventListener('input', () => { rec(e.id).notes = note.value; save(); });
        root.querySelector('[data-jump]').addEventListener('click', () => {
          go(href('program', e.dayId, { focus: others[0] ? others[0].id : '' }));
        });
      },
    });
  }

  /* ---------------- mutations ---------------- */
  function setPriority(eventId, p) {
    const r = rec(eventId);
    r.priority = (r.priority === p || !p) ? null : p;
    if (r.priority && r.reminder == null) r.reminder = null;
    save(true);
    render();
    toast(r.priority === 'first' ? 'أُضيفت إلى أولوياتك الأولى' : r.priority === 'alt' ? 'أُضيفت كخيار بديل' : 'أُزيل التحديد', 'ok');
  }

  function cycleAttendance(eventId) {
    const r = rec(eventId);
    r.attendance = r.attendance === 'attended' ? 'missed' : r.attendance === 'missed' ? null : 'attended';
    save(true);
    render();
  }

  function setReminder(eventId, minutes) {
    const r = rec(eventId);
    r.reminder = minutes;
    if (minutes != null && !r.priority) r.priority = 'first';
    save(true);
    if (minutes != null) ensureNotificationPermission().then((ok) => {
      if (!ok) toast('تم حفظ التنبيه، لكنه لن يظهر حتى تفعّل الإشعارات.', 'warn');
      else toast('تم ضبط التنبيه: ' + reminderLabel(minutes), 'ok');
    });
    render();
  }

  /* ---------------- notifications ---------------- */
  function ensureNotificationPermission() {
    if (!('Notification' in window)) {
      toast('هذا المتصفح لا يدعم الإشعارات.', 'warn');
      return Promise.resolve(false);
    }
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    return Notification.requestPermission().then((p) => {
      const ok = p === 'granted';
      state.settings.notificationsEnabled = ok;
      save(true);
      return ok;
    });
  }

  function reminderTime(e) {
    const r = recSafe(e.id);
    if (r.reminder == null) return null;
    const t = isoToDate(e.dayId, e.start);
    return new Date(t.getTime() - r.reminder * 60000);
  }

  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now();
    const notified = readJSON(NOTIFIED_KEY, {});
    let changed = false;
    selectedEvents().forEach((e) => {
      if (!e.start) return;
      const rt = reminderTime(e);
      if (!rt) return;
      const key = e.id + '@' + rt.toISOString();
      if (notified[key]) return;
      const diff = now - rt.getTime();
      if (diff >= 0 && diff < 3 * 60000) {
        notified[key] = 1;
        changed = true;
        try {
          const n = new Notification('تقويمي — ' + (recSafe(e.id).reminder === 0 ? 'تبدأ الآن' : 'بعد ' + recSafe(e.id).reminder + ' دقيقة'), {
            body: e.title + '\n' + (e.timeText || '') + (e.place ? ' · ' + e.place : ''),
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            tag: e.id,
            dir: 'rtl',
            lang: 'ar',
          });
          n.onclick = () => { window.focus(); go(href('my')); };
        } catch (err) { /* ignore */ }
      }
    });
    if (changed) writeJSON(NOTIFIED_KEY, notified);
  }

  /* ---------------- ICS ---------------- */
  function icsFold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 73) return line;
    let out = '';
    let cur = '';
    let curBytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (curBytes + b > 72) {
        out += cur + '\r\n ';
        cur = '';
        curBytes = 0;
      }
      cur += ch;
      curBytes += b;
    }
    out += cur;
    return out;
  }

  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  function icsDateTime(dayId, hhmm) {
    return dayId.replace(/-/g, '') + 'T' + (hhmm || '00:00').replace(':', '') + '00';
  }

  function buildICS() {
    const list = sortEvents(selectedEvents());
    if (!list.length) { toast('لا توجد فعاليات مختارة للتصدير.', 'warn'); return null; }
    const now = new Date();
    const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Taqwimi//Hajj Conference and Exhibition//AR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:تقويمي — مؤتمر ومعرض الحج النسخة السادسة',
      'X-WR-TIMEZONE:Asia/Riyadh',
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Riyadh',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0300',
      'TZNAME:AST',
      'END:STANDARD',
      'END:VTIMEZONE',
    ];

    list.forEach((e) => {
      const r = recSafe(e.id);
      const pr = r.priority === 'first' ? 'أولوية أولى' : 'خيار بديل';
      const ranges = (e.ranges && e.ranges.length) ? e.ranges : (e.start && e.end ? [{ start: e.start, end: e.end }] : []);
      const day = dayInfo(e.dayId);
      const desc = [
        pr,
        e.place ? 'المكان: ' + e.place : '',
        e.type ? 'نوع الجلسة: ' + e.type : '',
        e.track ? 'المسار: ' + e.track : '',
        e.category ? 'التصنيف: ' + e.category : '',
        e.speaker ? 'المختص: ' + e.speaker : '',
        r.notes ? 'ملاحظات: ' + r.notes : '',
        'المصدر: تقويمي2.pdf',
      ].filter(Boolean).join('\n');

      if (!ranges.length) {
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + e.id + '@taqwimi');
        lines.push('DTSTAMP:' + stamp);
        lines.push('DTSTART;VALUE=DATE:' + e.dayId.replace(/-/g, ''));
        lines.push('SUMMARY:' + icsEscape(e.title + ' (' + pr + ')'));
        lines.push('DESCRIPTION:' + icsEscape(desc + '\nالتوقيت في البرنامج: ' + (e.timeText || 'غير محدد')));
        if (e.place) lines.push('LOCATION:' + icsEscape(e.place));
        lines.push('END:VEVENT');
        return;
      }

      ranges.forEach((rg, idx) => {
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + e.id + (idx ? '-' + (idx + 1) : '') + '@taqwimi');
        lines.push('DTSTAMP:' + stamp);
        lines.push('DTSTART;TZID=Asia/Riyadh:' + icsDateTime(e.dayId, rg.start));
        lines.push('DTEND;TZID=Asia/Riyadh:' + icsDateTime(e.dayId, rg.end));
        lines.push('SUMMARY:' + icsEscape(e.title + ' — ' + pr));
        lines.push('DESCRIPTION:' + icsEscape(desc));
        if (e.place) lines.push('LOCATION:' + icsEscape(e.place));
        lines.push('STATUS:CONFIRMED');
        lines.push('TRANSP:OPAQUE');
        if (r.reminder != null) {
          lines.push('BEGIN:VALARM');
          lines.push('ACTION:DISPLAY');
          lines.push('DESCRIPTION:' + icsEscape(e.title));
          lines.push('TRIGGER:' + (r.reminder === 0 ? 'PT0M' : '-PT' + r.reminder + 'M'));
          lines.push('END:VALARM');
        }
        lines.push('END:VEVENT');
      });
    });

    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------------- backup ---------------- */
  function exportBackup() {
    const payload = {
      app: 'taqwimi',
      appVersion: APP.version,
      exportedAt: new Date().toISOString(),
      source: DATA.meta.source,
      name: state.name,
      events: state.events,
      settings: {
        view: state.settings.view,
        defaultReminder: state.settings.defaultReminder,
        notificationsEnabled: state.settings.notificationsEnabled,
      },
    };
    download('taqwimi-backup-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    toast('تم تصدير النسخة الاحتياطية', 'ok');
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try { payload = JSON.parse(reader.result); }
      catch (e) { toast('الملف غير صالح — تعذّر قراءة JSON.', 'err'); return; }
      if (!payload || payload.app !== 'taqwimi' || !payload.events) {
        toast('هذا الملف لا يبدو نسخة احتياطية من تقويمي.', 'err'); return;
      }
      const count = Object.keys(payload.events).length;
      openModal({
        title: 'استيراد نسخة احتياطية',
        body: `<p>الملف يحتوي <strong>${count}</strong> سجلًا، صُدّر في ${esc((payload.exportedAt || '').slice(0, 10))}.</p>
          <label class="choice"><input type="radio" name="import-mode" value="merge" checked>
            <div><div class="ch-title">دمج مع بياناتي الحالية</div>
            <div class="ch-desc">نضيف الفعاليات غير الموجودة فقط. ما لديك الآن يبقى كما هو عند التعارض.</div></div></label>
          <label class="choice"><input type="radio" name="import-mode" value="replace">
            <div><div class="ch-title">استبدال كل بياناتي</div>
            <div class="ch-desc">تُحذف اختياراتك الحالية بالكامل وتُستبدل بمحتوى الملف. لا يمكن التراجع.</div></div></label>`,
        footer: `<button class="btn btn-ghost" type="button" data-modal-close>إلغاء</button>
                 <button class="btn btn-primary" type="button" id="do-import">استيراد</button>`,
        onMount(root, close) {
          root.querySelector('[data-modal-close]').addEventListener('click', close);
          root.querySelector('#do-import').addEventListener('click', () => {
            const mode = root.querySelector('input[name="import-mode"]:checked').value;
            if (mode === 'replace') {
              state.events = {};
              state.name = payload.name || '';
              Object.assign(state.settings, payload.settings || {});
            }
            let added = 0, updated = 0;
            Object.keys(payload.events).forEach((id) => {
              if (!EVENT_BY_ID.has(id)) return;
              const src = payload.events[id];
              if (!state.events[id]) {
                state.events[id] = Object.assign({ priority: null, attendance: null, notes: '', reminder: null }, src);
                added++;
              } else if (mode === 'replace') {
                state.events[id] = Object.assign({ priority: null, attendance: null, notes: '', reminder: null }, src);
                updated++;
              }
            });
            save(true);
            close();
            render();
            toast(`تم الاستيراد — أُضيف ${added}${updated ? ' وحُدّث ' + updated : ''}`, 'ok');
          });
        },
      });
    };
    reader.onerror = () => toast('تعذّر قراءة الملف.', 'err');
    reader.readAsText(file, 'utf-8');
  }

  /* ---------------- install ---------------- */
  let deferredPrompt = null;
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }
  function installFlags() { return readJSON(INSTALL_KEY, { cardDismissed: false }); }

  function setupInstall() {
    const fab = $('#btn-install');
    if (isStandalone()) { fab.classList.add('hidden'); return; }
    fab.classList.remove('hidden');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      fab.classList.add('hidden');
      $('#install-host').innerHTML = '';
      toast('تم تثبيت تقويمي بنجاح', 'ok');
    });

    const flags = installFlags();
    if (!flags.cardDismissed) {
      setTimeout(showInstallCard, 1400);
    }
  }

  function showInstallCard() {
    if (isStandalone() || $('#install-host').children.length) return;
    const host = $('#install-host');
    host.innerHTML = `<div class="install-card" role="dialog" aria-label="تثبيت التطبيق">
      <button class="install-close" type="button" aria-label="إغلاق">${icon('x', 'ic-x')}</button>
      <h3>${icon('phone')} ثبّت تقويمي على جهازك</h3>
      <p>وصول أسرع، وعمل دون اتصال، وتجربة بملء الشاشة — دون متجر تطبيقات.</p>
      <div class="install-actions">
        <button class="btn btn-primary btn-sm" type="button" data-install-now>${icon('phone')} تثبيت الآن</button>
        <button class="btn btn-sm btn-ghost" type="button" data-install-later>لاحقًا</button>
      </div>
    </div>`;
    $('.install-close', host).addEventListener('click', dismissInstallCard);
    $('[data-install-later]', host).addEventListener('click', dismissInstallCard);
    $('[data-install-now]', host).addEventListener('click', () => { host.innerHTML = ''; promptInstall(); });
  }

  function dismissInstallCard() {
    $('#install-host').innerHTML = '';
    const f = installFlags(); f.cardDismissed = true;
    writeJSON(INSTALL_KEY, f);
  }

  function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') toast('جارٍ التثبيت…', 'ok');
        else toast('يمكنك التثبيت لاحقًا من زر التثبيت.', '');
        deferredPrompt = null;
      });
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    let steps;
    if (isIOS) {
      steps = `<ol>
        <li>افتح التطبيق في متصفح <strong>Safari</strong>.</li>
        <li>اضغط زر <strong>مشاركة</strong> (المربع مع السهم أعلى/أسفل الشاشة).</li>
        <li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong> ثم <strong>إضافة</strong>.</li>
      </ol>`;
    } else if (isAndroid) {
      steps = `<ol>
        <li>افتح قائمة المتصفح (النقاط الثلاث).</li>
        <li>اختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</li>
        <li>أكّد التثبيت.</li>
      </ol>`;
    } else {
      steps = `<ol>
        <li>ابحث عن أيقونة <strong>التثبيت</strong> في شريط عنوان المتصفح (حاسوب).</li>
        <li>أو افتح قائمة المتصفح ← <strong>تثبيت تقويمي</strong>.</li>
        <li>أكّد التثبيت.</li>
      </ol>`;
    }
    openModal({
      title: 'تثبيت التطبيق',
      body: `<p>لم يعرض المتصفح نافذة تثبيت تلقائية. يمكنك التثبيت يدويًا:</p>${steps}
        <p class="small muted">ملاحظة: التثبيت يعمل عند فتح الموقع عبر خادم ويب (http/https)، وليس عند فتح الملف مباشرة من القرص.</p>`,
      footer: `<button class="btn btn-primary" type="button" data-modal-close>فهمت</button>`,
      onMount(root, close) { root.querySelector('[data-modal-close]').addEventListener('click', close); },
    });
  }

  /* ---------------- render ---------------- */
  function render() {
    const route = currentRoute();
    if (route.name === 'program' && !route.day) {
      const h = href('program', state.settings.lastDay);
      history.replaceState(null, '', h);
      if (nav.stack[nav.index]) nav.stack[nav.index].hash = h;
    }
    const main = $('#main');
    let html = '';
    if (route.name === 'my') html = renderMy();
    else if (route.name === 'settings') html = renderSettings();
    else html = renderProgram();
    main.innerHTML = html;

    $$('.navtab').forEach((b) => {
      const active = b.dataset.route === route.name;
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    if (route.name !== 'settings') {
      state.settings.lastRoute = route.name;
      save();
    }

    if (route.params && route.params.focus) {
      const el = document.querySelector(`[data-occ="${route.params.focus}"]`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.transition = 'background .4s';
          el.style.background = '#fbf3d8';
          setTimeout(() => { el.style.background = ''; }, 1800);
        }, 120);
      }
    }
    updateHistoryButtons();
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-route],[data-day],[data-section],[data-filter],[data-set-prio],[data-att],[data-details],[data-goto-occ],[data-reminder],[data-view],[data-action],[data-toggle-notif]');
    if (!t) return;

    if (t.dataset.route) {
      const r = t.dataset.route;
      go(href(r, r === 'program' ? state.settings.lastDay : null));
      return;
    }
    if (t.dataset.go) {
      const r = t.dataset.go;
      go(href(r, r === 'program' ? state.settings.lastDay : null));
      return;
    }
    if (t.dataset.day) {
      ui.section = ui.section; // keep
      go(href('program', t.dataset.day));
      return;
    }
    if (t.dataset.section) { ui.section = t.dataset.section; writeJSON(UI_KEY, ui); render(); return; }
    if (t.dataset.filter) { ui.filter = t.dataset.filter; writeJSON(UI_KEY, ui); render(); return; }
    if (t.dataset.setPrio !== undefined && t.hasAttribute('data-set-prio')) {
      const wrap = t.closest('[data-prio]');
      if (wrap) setPriority(wrap.dataset.prio, t.dataset.setPrio);
      return;
    }
    if (t.dataset.att) { cycleAttendance(t.dataset.att); return; }
    if (t.dataset.details) { openDetails(t.dataset.details); return; }
    if (t.dataset.gotoOcc) {
      const o = OCC_BY_ID.get(t.dataset.gotoOcc);
      if (o) go(href('program', o.dayId, { focus: o.id }));
      return;
    }
    if (t.dataset.reminder) {
      const id = t.dataset.reminder;
      openReminderMenu(id, t);
      return;
    }
    if (t.dataset.view) {
      state.settings.view = t.dataset.view;
      save(true); render(); return;
    }
    if (t.dataset.toggleNotif !== undefined && t.hasAttribute('data-toggle-notif')) {
      toggleNotifications();
      return;
    }
    if (t.dataset.action) {
      const a = t.dataset.action;
      if (a === 'print') window.print();
      else if (a === 'ics') {
        const ics = buildICS();
        if (ics) { download('taqwimi-selected.ics', ics, 'text/calendar;charset=utf-8'); toast('تم تصدير ملف ICS', 'ok'); }
      } else if (a === 'export-backup') exportBackup();
      else if (a === 'import-backup') $('#import-file').click();
      else if (a === 'reset') confirmReset();
      else if (a === 'install') promptInstall();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      ui.q = e.target.value;
      writeJSON(UI_KEY, ui);
      const pos = e.target.selectionStart;
      render();
      const q = $('#q');
      if (q) { q.focus(); q.setSelectionRange(pos, pos); }
    }
    if (e.target.id === 'name') {
      state.name = e.target.value;
      save();
    }
    if (e.target.dataset && e.target.dataset.note) {
      rec(e.target.dataset.note).notes = e.target.value;
      save();
    }
    if (e.target.id === 'default-reminder') {
      state.settings.defaultReminder = Number(e.target.value);
      save(true);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file') {
      const f = e.target.files && e.target.files[0];
      if (f) importBackup(f);
      e.target.value = '';
    }
  });

  function openReminderMenu(eventId, anchor) {
    const e = EVENT_BY_ID.get(eventId);
    if (!e) return;
    const r = recSafe(eventId);
    const opts = [[null, 'بدون تنبيه'], [0, 'عند البدء'], [5, 'قبل 5 دقائق'], [10, 'قبل 10 دقائق'], [15, 'قبل 15 دقيقة'], [30, 'قبل 30 دقيقة'], [60, 'قبل 60 دقيقة']];
    openModal({
      title: 'تنبيه الفعالية',
      body: `<p class="small muted" style="margin-bottom:14px">${esc(e.title)} · ${esc(e.timeText || '')}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
        ${opts.map(([v, label]) => `<label class="choice" style="margin:0">
          <input type="radio" name="rem" value="${v == null ? '' : v}" ${r.reminder === v ? 'checked' : ''}>
          <div><div class="ch-title">${label}</div></div></label>`).join('')}
        </div>
        <div class="hint" style="margin-top:12px">التنبيهات تعمل أثناء فتح التطبيق فقط. لن يعمل التنبيه إن كان التطبيق مغلقًا.</div>`,
      footer: `<button class="btn btn-ghost" type="button" data-modal-close>إلغاء</button>
               <button class="btn btn-primary" type="button" id="save-rem">حفظ</button>`,
      onMount(root, close) {
        root.querySelector('[data-modal-close]').addEventListener('click', close);
        root.querySelector('#save-rem').addEventListener('click', () => {
          const v = root.querySelector('input[name="rem"]:checked');
          const val = v && v.value !== '' ? Number(v.value) : null;
          close();
          setReminder(eventId, val);
        });
      },
    });
  }

  function toggleNotifications() {
    const st = notifStatus();
    if (st.key === 'unsupported') { toast('المتصفح لا يدعم الإشعارات.', 'warn'); return; }
    if (st.key === 'granted' && state.settings.notificationsEnabled) {
      state.settings.notificationsEnabled = false;
      save(true); render();
      toast('تم إيقاف التنبيهات (الإذن يبقى محفوظًا في المتصفح).', '');
      return;
    }
    ensureNotificationPermission().then((ok) => {
      state.settings.notificationsEnabled = ok;
      save(true); render();
      if (ok) toast('تم تفعيل التنبيهات', 'ok');
      else toast('لم يتم منح إذن الإشعارات. يمكنك السماح من إعدادات المتصفح.', 'warn');
    });
  }

  function confirmReset() {
    openModal({
      title: 'مسح كل البيانات',
      body: `<p>سيتم حذف جميع الفعاليات المختارة، الأولويات، الملاحظات، وحالات الحضور من هذا المتصفح.</p>
        <p class="small muted">لا يمكن التراجع. إن كنت تريد الاحتفاظ بها، أغلق هذه النافذة وصدّر نسخة احتياطية أولًا.</p>`,
      footer: `<button class="btn btn-ghost" type="button" data-modal-close>إلغاء</button>
               <button class="btn btn-danger" type="button" id="do-reset">نعم، امسح الكل</button>`,
      onMount(root, close) {
        root.querySelector('[data-modal-close]').addEventListener('click', close);
        root.querySelector('#do-reset').addEventListener('click', () => {
          state = defaultState();
          save(true);
          localStorage.removeItem(NOTIFIED_KEY);
          close(); render();
          toast('تم مسح كل البيانات', 'ok');
        });
      },
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    $('#btn-back').addEventListener('click', () => history.back());
    $('#btn-forward').addEventListener('click', () => history.forward());
    $('#btn-install').addEventListener('click', promptInstall);

    const topBtn = $('#btn-top');
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          topBtn.classList.toggle('is-visible', y > 420);
          saveScroll();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener('hashchange', () => handleHash(false));

    if (!location.hash) {
      history.replaceState(null, '', href(state.settings.lastRoute || 'program',
        (state.settings.lastRoute === 'program' || !state.settings.lastRoute) ? state.settings.lastDay : null));
    }
    handleHash(true);

    setupInstall();
    setInterval(checkReminders, 30000);
    setTimeout(checkReminders, 2500);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
