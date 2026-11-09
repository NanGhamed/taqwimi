/* ============================================================
   تقويمي — مؤتمر ومعرض الحج النسخة السادسة
   تطبيق ويب تقدمي (PWA) يعمل دون اتصال
   ============================================================ */
(function () {
  'use strict';

  const DATA = window.TAQWIMI_DATA;
  const APP = { name: 'تقويمي', version: 2 };
  const STORE_KEY = 'taqwimi.v1.user';
  const UI_KEY = 'taqwimi.v1.ui';
  const NOTIFIED_KEY = 'taqwimi.v1.notified';
  const DAY_NOTES_KEY = 'taqwimi.v1.daynotes';
  const FIRST_PLAN_ADD_KEY = 'taqwimi.v1.analytics.firstplanadd';
  const STATS_SUMMARY_URL = 'data/stats-summary.json';
  const STATS_METRICS = [
    { key: 'visitors', label: 'إجمالي الزوار', hint: 'زوار الموقع الفعليون' },
    { key: 'planners', label: 'أضافوا أول فعالية', hint: 'زائر أضاف فعالية إلى خطته' },
    { key: 'appOpens', label: 'فتح من أيقونة التطبيق', hint: 'مرات الفتح كتطبيق مثبّت' },
    { key: 'printUses', label: 'استخدام الطباعة', hint: 'مرات استخدام زر الطباعة' },
  ];

  /* أوقات صلاة الظهر والعصر والمغرب والعشاء في جدة — تقويم أم القرى */
  const PRAYER_TIMES = {
    '2026-11-08': { dhuhr: '12:07', asr: '15:21', maghrib: '17:44', isha: '19:14' },
    '2026-11-09': { dhuhr: '12:07', asr: '15:20', maghrib: '17:43', isha: '19:13' },
    '2026-11-10': { dhuhr: '12:07', asr: '15:20', maghrib: '17:43', isha: '19:13' },
    '2026-11-11': { dhuhr: '12:07', asr: '15:20', maghrib: '17:43', isha: '19:13' },
  };
  const PRAYER_ORDER = [
    { key: 'dhuhr', name: 'الظهر' },
    { key: 'asr', name: 'العصر' },
    { key: 'maghrib', name: 'المغرب' },
    { key: 'isha', name: 'العشاء' },
  ];
  const RIYADH_TZ = 'Asia/Riyadh';
  const DAY_START = 9 * 60;
  const DAY_END = 21 * 60;

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

  /* أحداث القياس فقط — لا تُرسل الأسماء أو الملاحظات أو محتوى الخطة. */
  function trackEvent(name) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name);
    } catch (e) { /* لا تعطّل التطبيق إن تعذّر القياس */ }
  }

  let firstPlanAddTracked = false;
  function trackFirstPlanAdd() {
    if (firstPlanAddTracked) return;
    try {
      if (localStorage.getItem(FIRST_PLAN_ADD_KEY) === '1') {
        firstPlanAddTracked = true;
        return;
      }
      localStorage.setItem(FIRST_PLAN_ADD_KEY, '1');
    } catch (e) { /* متابعة بمرة واحدة لكل تحميل إذا مُنع التخزين */ }
    firstPlanAddTracked = true;
    trackEvent('first_plan_add');
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

  function toMinutes(hhmm) {
    if (!hhmm) return null;
    const parts = String(hhmm).split(':').map(Number);
    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  }

  function minutesToTime(mins) {
    const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }

  function rangeTimeText(start, end) {
    const s = to12(minutesToTime(start));
    const e = to12(minutesToTime(end));
    if (s.slice(-1) === e.slice(-1)) return `${s.slice(0, -2)}–${e}`;
    return `${s}–${e}`;
  }

  function minutesText(m) {
    if (m === 1) return 'دقيقة';
    if (m === 2) return 'دقيقتان';
    if (m >= 3 && m <= 10) return `${m} دقائق`;
    return `${m} دقيقة`;
  }

  function durationLabel(mins) {
    const total = Math.max(0, Math.round(mins));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return minutesText(m) || '0 دقيقة';
    const hText = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
    return m ? `${hText} و${minutesText(m)}` : hText;
  }

  function riyadhNow() {
    const now = new Date();
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: RIYADH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: RIYADH_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const getDate = (type) => (dateParts.find((p) => p.type === type) || {}).value;
    const getTime = (type) => (timeParts.find((p) => p.type === type) || {}).value;
    return {
      date: `${getDate('year')}-${getDate('month')}-${getDate('day')}`,
      minutes: Number(getTime('hour')) * 60 + Number(getTime('minute')),
    };
  }

  function nextPrayerKey(dayId) {
    const times = PRAYER_TIMES[dayId];
    const now = riyadhNow();
    if (!times || now.date !== dayId) return null;
    for (const prayer of PRAYER_ORDER) {
      if (now.minutes < toMinutes(times[prayer.key])) return prayer.key;
    }
    return null;
  }

  function prayerBarHtml(dayId) {
    const times = PRAYER_TIMES[dayId];
    if (!times) return '';
    const next = nextPrayerKey(dayId);
    return `<div class="prayer-bar" data-prayer-day="${esc(dayId)}" role="group" aria-label="مواقيت الصلاة في جدة">
      <div class="prayer-head">${icon('clock')}<span>مواقيت الصلاة في جدة</span><small>تقويم أم القرى</small></div>
      <div class="prayer-list">
        ${PRAYER_ORDER.map((prayer) => `<div class="prayer-item${next === prayer.key ? ' is-next' : ''}" data-prayer="${prayer.key}"${next === prayer.key ? ' aria-current="true"' : ''}>
          <span class="prayer-name">${prayer.name}</span>
          <span class="prayer-time">${esc(to12(times[prayer.key]))}</span>
          <span class="prayer-next">الصلاة القادمة</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function refreshPrayerBars() {
    $$('.prayer-bar[data-prayer-day]').forEach((bar) => {
      const next = nextPrayerKey(bar.dataset.prayerDay);
      $$('.prayer-item', bar).forEach((item) => {
        const on = item.dataset.prayer === next;
        item.classList.toggle('is-next', on);
        if (on) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
    });
  }

  function eventRanges(e) {
    if (e.ranges && e.ranges.length) return e.ranges;
    if (e.start && e.end) return [{ start: e.start, end: e.end }];
    return [];
  }

  function eventStartMin(e) {
    const starts = eventRanges(e).map((r) => toMinutes(r.start)).filter((v) => v != null);
    return starts.length ? Math.min(...starts) : 24 * 60;
  }

  function eventEndMinute(e) {
    const ends = eventRanges(e).map((r) => toMinutes(r.end)).filter((v) => v != null);
    return ends.length ? Math.max(...ends) : null;
  }

  function isEventFinished(e, now) {
    const n = now || riyadhNow();
    if (e.dayId < n.date) return true;
    if (e.dayId > n.date) return false;
    const end = eventEndMinute(e);
    if (end == null) return false;
    return n.minutes >= end;
  }

  function isEventNow(e, now) {
    const n = now || riyadhNow();
    if (e.dayId !== n.date) return false;
    return eventRanges(e).some((r) => {
      const start = toMinutes(r.start);
      const end = toMinutes(r.end);
      if (start == null || end == null) return false;
      return n.minutes >= start && n.minutes < end;
    });
  }

  function dayCollapseMinute(dayEvents) {
    let minute = DAY_END;
    dayEvents.forEach((e) => {
      const end = eventEndMinute(e);
      if (end != null && end > minute) minute = end;
    });
    return minute;
  }

  function isDayCollapsed(dayId, dayEvents, now) {
    const n = now || riyadhNow();
    if (n.date > dayId) return true;
    if (n.date < dayId) return false;
    return n.minutes >= dayCollapseMinute(dayEvents);
  }

  function mergeMinuteRanges(ranges) {
    const sorted = ranges.filter((r) => r.end > r.start).slice().sort((a, b) => a.start - b.start);
    const merged = [];
    sorted.forEach((r) => {
      const last = merged[merged.length - 1];
      if (!last || r.start > last.end) merged.push({ start: r.start, end: r.end });
      else last.end = Math.max(last.end, r.end);
    });
    return merged;
  }

  function availableSlots(dayEvents) {
    const ranges = [];
    dayEvents.forEach((e) => eventRanges(e).forEach((r) => {
      const start = toMinutes(r.start);
      const end = toMinutes(r.end);
      if (start == null || end == null) return;
      const clippedStart = Math.max(DAY_START, Math.min(DAY_END, start));
      const clippedEnd = Math.max(DAY_START, Math.min(DAY_END, end));
      if (clippedEnd > clippedStart) ranges.push({ start: clippedStart, end: clippedEnd });
    }));
    const merged = mergeMinuteRanges(ranges);
    const slots = [];
    let cursor = DAY_START;
    merged.forEach((r) => {
      if (r.start > cursor) slots.push({ start: cursor, end: r.start });
      cursor = Math.max(cursor, r.end);
    });
    if (cursor < DAY_END) slots.push({ start: cursor, end: DAY_END });
    return slots;
  }

  function freeSlotHtml(slot, empty) {
    return `<div class="free-slot">${icon('clock')}<span class="free-label">وقت متاح · ${esc(rangeTimeText(slot.start, slot.end))} · ${esc(durationLabel(slot.end - slot.start))}</span>${empty ? '<span class="free-note">لم تُضف فعاليات لهذا اليوم</span>' : ''}</div>`;
  }

  /* Renders the time as two clear lines (start / end) whenever the PDF
     provided numeric start and end times; otherwise falls back to the
     exact wording of the source PDF. */
  function timeCell(o) {
    let start = o.start;
    let end = o.end;
    const ev = (o.eventId && typeof EVENT_BY_ID !== 'undefined') ? EVENT_BY_ID.get(o.eventId) : null;
    const ranges = (o.ranges && o.ranges.length) ? o.ranges : (ev && ev.ranges && ev.ranges.length ? ev.ranges : []);
    if (ranges.length > 1) {
      const text = o.timeText || (ev && ev.timeText) ||
        ranges.map((r) => `${to12(r.start)} - ${to12(r.end)}`).join(' / ');
      return `<div class="c-time c-time-text">${esc(compactTime(text))}</div>`;
    }
    if (!start && ev) { start = ev.start; end = ev.end; }
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
  const REMOVED_BY_ID = new Map((DATA.removed || []).map((r) => [r.id, r]));

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

  let dayNotes = readJSON(DAY_NOTES_KEY, {});
  if (!dayNotes || typeof dayNotes !== 'object' || Array.isArray(dayNotes)) dayNotes = {};
  let dayNoteTimer = null;
  let statsSummary = null;
  let statsSummaryState = 'idle';
  let statsSummaryPromise = null;
  const openDayPanels = {};
  let lastMyTimeSignature = '';

  let saveTimer = null;
  function save(immediate) {
    const run = () => writeJSON(STORE_KEY, state);
    if (immediate) { clearTimeout(saveTimer); return run(); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(run, 350);
    return true;
  }

  /* ---------------- day extras ---------------- */
  function dayNote(dayId) {
    return dayNotes[dayId] || '';
  }

  function dayNoteHasText(dayId) {
    return !!String(dayNotes[dayId] || '').trim();
  }

  function saveDayNotesSoon() {
    clearTimeout(dayNoteTimer);
    dayNoteTimer = setTimeout(() => writeJSON(DAY_NOTES_KEY, dayNotes), 300);
  }

  function isPanelOpen(dayId, panel) {
    return !!openDayPanels[dayId + ':' + panel];
  }

  function dayActionsHtml(day, finishedCount) {
    return `<div class="day-actions no-print">
      <button class="btn btn-sm day-action${dayNoteHasText(day.id) ? ' has-note' : ''}" type="button" data-day-panel="notes" data-panel-day="${esc(day.id)}" aria-expanded="${isPanelOpen(day.id, 'notes')}">
        ${icon('plus')} إضافات اليوم
      </button>
      <button class="btn btn-sm day-action" type="button" data-day-panel="finished" data-panel-day="${esc(day.id)}" aria-expanded="${isPanelOpen(day.id, 'finished')}">
        ${icon('check')} المنتهية${finishedCount ? `<span class="day-count">${finishedCount}</span>` : ''}
      </button>
    </div>`;
  }

  function dayNotesPanelHtml(day) {
    return `<div class="day-panel day-note-panel">
      <label class="day-note-label" for="day-note-${esc(day.id)}">${icon('plus')} أضف موعدًا شخصيًا آخر يهمك أو ملاحظة لهذا اليوم</label>
      <textarea class="input day-note-input" id="day-note-${esc(day.id)}" rows="3" data-day-note="${esc(day.id)}" placeholder="اكتب موعدًا أو ملاحظة خاصة بهذا اليوم…">${esc(dayNote(day.id))}</textarea>
      <div class="day-panel-foot">
        <span>${icon('check')} يُحفظ تلقائيًا على هذا الجهاز</span>
        <button class="btn btn-sm btn-ghost" type="button" data-clear-day-note="${esc(day.id)}">${icon('trash')} مسح</button>
      </div>
    </div>`;
  }

  function toggleDayPanel(dayId, panel) {
    const key = dayId + ':' + panel;
    const open = !openDayPanels[key];
    if (open) openDayPanels[key] = true;
    else delete openDayPanels[key];
    $$(`[data-day-panel-row="${panel}"][data-panel-day="${dayId}"]`).forEach((row) => { row.hidden = !open; });
    $$(`[data-day-panel="${panel}"][data-panel-day="${dayId}"]`).forEach((btn) => btn.setAttribute('aria-expanded', open ? 'true' : 'false'));
    if (open) {
      const row = $(`[data-day-panel-row="${panel}"][data-panel-day="${dayId}"]`);
      if (row) setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
    }
  }

  function clearDayNote(dayId) {
    delete dayNotes[dayId];
    writeJSON(DAY_NOTES_KEY, dayNotes);
    $$(`[data-day-note="${dayId}"]`).forEach((area) => { area.value = ''; });
    $$(`[data-day-panel="notes"][data-panel-day="${dayId}"]`).forEach((btn) => btn.classList.remove('has-note'));
    toast('تم مسح إضافات اليوم', 'ok');
  }

  function finishedCardHtml(e) {
    const r = recSafe(e.id);
    const att = r.attendance;
    return `<article class="finished-card" data-event="${esc(e.id)}">
      <div class="finished-head">
        <div class="finished-time">${esc(to12(e.start) || '—')}<small>${e.end ? 'حتى ' + esc(to12(e.end)) : esc(e.timeText || 'بدون توقيت')}</small></div>
        <div class="finished-main">
          <div class="finished-title">${esc(e.title)}</div>
          <div class="finished-meta">
            ${r.priority === 'first' ? '<span class="pill first">أولوية أولى</span>' : '<span class="pill alt">خيار بديل</span>'}
            ${e.place ? `<span>${icon('pin')} ${esc(e.place)}</span>` : ''}
            ${e.track ? `<span class="tag">${esc(e.track)}</span>` : ''}
          </div>
        </div>
        <div class="finished-actions">
          <button class="att-btn" type="button" data-att="${esc(e.id)}" data-state="${att || ''}">
            ${att === 'attended' ? icon('check') + ' حضرت' : att === 'missed' ? icon('x') + ' لم أحضر' : 'تسجيل الحضور'}
          </button>
          <button class="btn btn-sm btn-ghost" type="button" data-details="${esc(e.id)}" title="التفاصيل">${icon('info')}</button>
        </div>
      </div>
      <textarea class="input finished-note" rows="2" data-note="${esc(e.id)}" placeholder="ملاحظتك…" aria-label="ملاحظات ${esc(e.title)}">${esc(r.notes)}</textarea>
    </article>`;
  }

  function finishedPanelHtml(day, finished) {
    return `<div class="day-panel finished-panel">
      <div class="day-panel-head">
        <strong>${icon('check')} المنتهية</strong>
        <span>${finished.length ? evCount(finished.length) : 'لا توجد فعاليات منتهية بعد'}</span>
      </div>
      ${finished.length
        ? `<div class="finished-list">${finished.map(finishedCardHtml).join('')}</div>`
        : `<div class="empty-small">ستظهر هنا الفعاليات المختارة بعد انتهاء وقتها بتوقيت السعودية.</div>`}
    </div>`;
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
    const m = h.match(/^#\/(program|my|settings|links)(?:\/([0-9-]+))?(?:\?(.*))?$/);
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
      <p class="page-intro">${icon('info')} <span>اختر الفعاليات التي تهمك وأضفها إلى تقويمك، وحدّد أولوياتك وبدائلك، ودوّن ملاحظاتك وتابع حضورك بسهولة.</span></p>

      <div class="page-head">
        <div>
          <h1 class="page-title day-title">تستعرض الآن برنامج يوم ${esc(day.weekday)}، ${esc(day.dateLabel.replace(day.weekday + ' ', ''))}.</h1>
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
      <div class="footer-brand-block">
        <img class="footer-logo" src="icons/committee-logo-320.png" alt="شعار لجنة التحول الرقمي والذكاء الاصطناعي" width="96" height="96" loading="lazy">
        <div class="footer-text">
          <strong>إهداء من لجنة التحول الرقمي والذكاء الاصطناعي</strong>
          <span class="footer-brand">نون متحد</span>
        </div>
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
    const list = sortEvents(selectedEvents()).filter((e) => e.start);
    if (!list.length) return null;
    for (const e of list) {
      if (!isEventFinished(e)) return e;
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
    const isNow = isEventNow(e);
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

  function renderMyEventRow(e, conflictIds) {
    const day = dayInfo(e.dayId);
    const r = recSafe(e.id);
    const att = r.attendance;
    return `<tr data-event="${esc(e.id)}" class="${conflictIds.has(e.id) ? 'is-conflict' : ''}">
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
  }

  function renderMyTable(list, conflictIds) {
    const rows = [];
    const now = riyadhNow();
    DATA.days.forEach((day) => {
      const allDayEvents = list.filter((e) => e.dayId === day.id);
      const activeDayEvents = allDayEvents.filter((e) => !isEventFinished(e, now));
      const finishedDayEvents = allDayEvents.filter((e) => isEventFinished(e, now));
      const collapsed = isDayCollapsed(day.id, allDayEvents, now);
      const empty = allDayEvents.length === 0;
      const slots = availableSlots(allDayEvents);
      const items = [];
      slots.forEach((slot) => items.push({ type: 'free', start: slot.start, slot }));
      activeDayEvents.forEach((e) => items.push({ type: 'event', start: eventStartMin(e), e }));
      items.sort((a, b) => a.start - b.start || (a.type === 'free' ? -1 : 1));
      const countLabel = collapsed
        ? ''
        : (activeDayEvents.length ? evCount(activeDayEvents.length) : (finishedDayEvents.length ? 'لا فعاليات نشطة' : ''));

      rows.push(`<tr class="my-day-row"><td colspan="8">
        <div class="my-day-head">
          <div class="my-day-title">
            <h3>${esc(day.weekday)} · ${esc(day.dateLabel.replace(day.weekday + ' ', ''))}</h3>
            <span class="cnt">${countLabel}</span>
          </div>
          ${dayActionsHtml(day, finishedDayEvents.length)}
        </div>
        ${collapsed ? '' : prayerBarHtml(day.id)}
      </td></tr>`);

      if (!collapsed) {
        items.forEach((item) => {
          if (item.type === 'free') {
            rows.push(`<tr class="free-row"><td colspan="8">${freeSlotHtml(item.slot, empty)}</td></tr>`);
          } else {
            rows.push(renderMyEventRow(item.e, conflictIds));
          }
        });
      }

      rows.push(`<tr class="day-panel-row" data-day-panel-row="notes" data-panel-day="${esc(day.id)}" ${isPanelOpen(day.id, 'notes') ? '' : 'hidden'}>
        <td colspan="8">${dayNotesPanelHtml(day)}</td>
      </tr>`);
      rows.push(`<tr class="day-panel-row" data-day-panel-row="finished" data-panel-day="${esc(day.id)}" ${isPanelOpen(day.id, 'finished') ? '' : 'hidden'}>
        <td colspan="8">${finishedPanelHtml(day, finishedDayEvents)}</td>
      </tr>`);
    });

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
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  function renderTimeline(list, conflictIds) {
    const now = riyadhNow();
    return `<div class="timeline">` + DATA.days.map((day) => {
      const allDayEvents = list.filter((e) => e.dayId === day.id);
      const activeDayEvents = allDayEvents.filter((e) => !isEventFinished(e, now));
      const finishedDayEvents = allDayEvents.filter((e) => isEventFinished(e, now));
      const collapsed = isDayCollapsed(day.id, allDayEvents, now);
      const empty = allDayEvents.length === 0;
      const slots = availableSlots(allDayEvents);
      const items = [];
      slots.forEach((slot) => items.push({ type: 'free', start: slot.start, slot }));
      activeDayEvents.forEach((e) => items.push({ type: 'event', start: eventStartMin(e), e }));
      items.sort((a, b) => a.start - b.start || (a.type === 'free' ? -1 : 1));
      const countLabel = collapsed
        ? ''
        : (activeDayEvents.length ? evCount(activeDayEvents.length) : (finishedDayEvents.length ? 'لا فعاليات نشطة' : ''));

      return `<div class="tl-day">
        <div class="tl-day-head">
          <div class="tl-day-title">
            <h3>${esc(day.weekday)} · ${esc(day.dateLabel.replace(day.weekday + ' ', ''))}</h3>
            <span class="cnt">${countLabel}</span>
          </div>
          <span class="line"></span>
          ${dayActionsHtml(day, finishedDayEvents.length)}
        </div>
        ${collapsed ? '' : `${prayerBarHtml(day.id)}
        <div class="tl-items">
          ${items.map((item) => {
            if (item.type === 'free') {
              return `<div class="tl-free">${freeSlotHtml(item.slot, empty)}</div>`;
            }
            const e = item.e;
            const r = recSafe(e.id);
            return `<div class="tl-item ${r.priority === 'alt' ? 'alt' : ''}${conflictIds.has(e.id) ? ' is-conflict' : ''}" data-event="${esc(e.id)}">
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
        </div>`}
        <div class="tl-day-panel" data-day-panel-row="notes" data-panel-day="${esc(day.id)}" ${isPanelOpen(day.id, 'notes') ? '' : 'hidden'}>${dayNotesPanelHtml(day)}</div>
        <div class="tl-day-panel" data-day-panel-row="finished" data-panel-day="${esc(day.id)}" ${isPanelOpen(day.id, 'finished') ? '' : 'hidden'}>${finishedPanelHtml(day, finishedDayEvents)}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  function orphanRecords() {
    return Object.keys(state.events).filter((id) => !EVENT_BY_ID.has(id)).map((id) => {
      const r = state.events[id] || {};
      return { id, r, meta: REMOVED_BY_ID.get(id) || null };
    }).filter(({ r }) => r && (r.notes || r.priority || r.attendance || r.reminder != null));
  }

  function renderOrphanNotes() {
    const orphans = orphanRecords();
    if (!orphans.length) return '';
    const rows = orphans.map(({ id, r, meta }) => {
      const day = meta ? dayInfo(meta.dayId) : null;
      const dayLabel = day
        ? `${day.weekday} ${day.dateLabel.replace(day.weekday + ' ', '')}`
        : (meta ? meta.dayId : '');
      const time = meta
        ? (meta.start && meta.end ? `${to12(meta.start)} إلى ${to12(meta.end)}` : (meta.timeText || 'بدون توقيت'))
        : '';
      const tags = [];
      if (r.priority) tags.push(`<span class="pill ${r.priority === 'first' ? 'first' : 'alt'}">${r.priority === 'first' ? 'أولوية أولى' : 'خيار بديل'}</span>`);
      if (r.attendance === 'attended') tags.push('<span class="pill attended">حضرت</span>');
      if (r.attendance === 'missed') tags.push('<span class="pill missed">لم أحضر</span>');
      if (r.reminder != null) tags.push(`<span class="tag green">${icon('bell')} ${r.reminder === 0 ? 'عند البدء' : 'قبل ' + r.reminder + ' د'}</span>`);
      return `<div class="orphan-item">
        <div class="orphan-head">
          <div>
            <div class="r-title">${esc(meta ? meta.title : 'فعالية سابقة')}</div>
            <div class="r-desc">${esc(dayLabel)}${time ? ' · ' + esc(time) : ''}${meta && meta.place ? ' · ' + esc(meta.place) : ''}</div>
          </div>
          <span class="pill none">لم تعد ضمن البرنامج</span>
        </div>
        ${tags.length ? `<div class="c-sub" style="margin-bottom:8px">${tags.join('')}</div>` : ''}
        <textarea class="input" rows="2" data-note="${esc(id)}" placeholder="ملاحظتك محفوظة…" aria-label="ملاحظات ${esc(meta ? meta.title : 'فعالية سابقة')}">${esc(r.notes || '')}</textarea>
      </div>`;
    }).join('');
    return `<div class="card" style="margin-top:16px">
      <div class="card-head">
        <h2>${icon('info')} فعاليات لم تعد ضمن البرنامج</h2>
        <p>حفظنا ملاحظاتك وبياناتك السابقة. هذه الفعاليات لم تعد ضمن البرنامج الحالي، ولم نحذف أي شيء.</p>
      </div>
      <div class="card-body"><div class="orphan-list">${rows}</div></div>
    </div>`;
  }

  function renderMy() {
    const list = sortEvents(selectedEvents());
    const activeList = list.filter((e) => !isEventFinished(e));
    const first = list.filter((e) => recSafe(e.id).priority === 'first').length;
    const alt = list.length - first;
    const attended = list.filter((e) => recSafe(e.id).attendance === 'attended').length;
    const pairs = overlaps(activeList);
    const conflictIds = new Set();
    pairs.forEach(([a, b]) => { conflictIds.add(a.id); conflictIds.add(b.id); });

    const body = state.settings.view === 'timeline'
      ? renderTimeline(list, conflictIds)
      : renderMyTable(list, conflictIds);

    const visitor = (state.name || '').trim();
    const myTitle = visitor ? `مخطّط زيارة ${esc(visitor)}` : 'تقويمي';
    const mySub = visitor
      ? 'اختياراتك… لزيارة تستحق وقتك'
      : 'فعالياتك المختارة وملاحظاتك، محفوظة على جهازك.';

    return `<div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title my-title">${myTitle}</h1>
          <p class="page-sub my-sub">${mySub}</p>
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

      <div class="name-card no-print">
        <label class="name-card-label" for="visitor-name">${icon('star')} خطّتك تبدأ باسمك</label>
        <input class="input name-card-input" id="visitor-name" type="text" maxlength="40" autocomplete="name" placeholder="اكتب اسمك هنا" value="${esc(state.name || '')}">
      </div>

      <div class="print-only" style="margin-bottom:14px">
        <h2 style="font-size:18px">تقويمي</h2>
        <div class="small"><span class="print-name">${state.name ? esc(state.name) + ' · ' : ''}</span>${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
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

      ${renderOrphanNotes()}

      ${renderFooter()}
    </div>`;
  }

  function updateMyNameUI() {
    const v = (state.name || '').trim();
    const h = $('.my-title');
    const s = $('.my-sub');
    const p = $('.print-name');
    if (h) h.textContent = v ? `مخطّط زيارة ${v}` : 'تقويمي';
    if (s) s.textContent = v ? 'اختياراتك… لزيارة تستحق وقتك' : 'فعالياتك المختارة وملاحظاتك، محفوظة على جهازك.';
    if (p) p.textContent = v ? v + ' · ' : '';
  }

  /* ---------------- settings ---------------- */
  function notifStatus() {
    if (!('Notification' in window)) return { key: 'unsupported', label: 'غير مدعومة في هذا المتصفح', cls: 'status-na' };
    const p = Notification.permission;
    if (p === 'granted') return { key: 'granted', label: 'مفعّلة', cls: 'status-on' };
    if (p === 'denied') return { key: 'denied', label: 'مرفوضة من إعدادات المتصفح', cls: 'status-off' };
    return { key: 'default', label: 'لم تُطلب بعد', cls: 'status-off' };
  }

  /* ---------------- public stats summary ---------------- */
  function statsNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function normalizeStatsSummary(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const rawMetrics = src.metrics && typeof src.metrics === 'object' ? src.metrics : {};
    const metrics = {};
    STATS_METRICS.forEach(({ key }) => {
      const n = statsNumber(rawMetrics[key]);
      if (n !== null) metrics[key] = n;
    });
    return {
      startedAt: typeof src.startedAt === 'string' && src.startedAt ? src.startedAt : null,
      updatedAt: typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : null,
      metrics,
    };
  }

  function formatStatsDate(value, emptyLabel) {
    if (!value) return emptyLabel;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return emptyLabel;
    try {
      return date.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return emptyLabel; }
  }

  function formatStatsNumber(value) {
    try {
      return new Intl.NumberFormat('ar-SA-u-nu-latn').format(Number(value) || 0);
    } catch (e) { return String(Number(value) || 0); }
  }

  function statsCardHtml() {
    const summary = statsSummary;
    const metrics = summary
      ? STATS_METRICS.filter(({ key }) => Object.prototype.hasOwnProperty.call(summary.metrics, key))
      : [];
    const hasData = metrics.length > 0;
    const startedAt = formatStatsDate(summary && summary.startedAt, 'لم يبدأ');
    const updatedAt = formatStatsDate(summary && summary.updatedAt, '—');

    let body = '';
    if (statsSummaryState === 'loading' && !summary) {
      body = `<div class="stats-empty">${icon('clock')}<div>جارٍ تحميل ملخص الأرقام…</div></div>`;
    } else if (statsSummaryState === 'error' && !summary) {
      body = `<div class="stats-empty">${icon('info')}<div>تعذّر تحميل ملخص الأرقام الآن. ستظهر الأرقام عند توفر الملخص العام.</div></div>`;
    } else if (!hasData) {
      body = `<div class="stats-empty">${icon('info')}<div>لا توجد مؤشرات فعلية بعد. ستظهر هنا الأرقام المجمّعة بعد ربط Google Analytics 4 وبدء جمع البيانات، دون أي سجلات أفراد أو مفاتيح وصول.</div></div>`;
    } else {
      body = `<div class="stats">${metrics.map(({ key, label, hint }) => `<div class="stat">
        <div class="s-num">${esc(formatStatsNumber(summary.metrics[key]))}</div>
        <div class="s-label">${esc(label)}</div>
        <div class="s-hint">${esc(hint)}</div>
      </div>`).join('')}</div>`;
    }

    return `<div class="card stats-card" data-stats-card>
      <div class="card-head"><h2>${icon('chart')} إحصاءات تقويمي</h2><p>ملخص عام للأرقام المجمّعة فقط. لا تُنشر سجلات الأفراد أو مفاتيح لوحة التحليلات.</p></div>
      <div class="card-body">
        <div class="stats-meta">
          <span>بدء القياس: <strong>${esc(startedAt)}</strong></span>
          <span>آخر تحديث: <strong>${esc(updatedAt)}</strong></span>
        </div>
        ${body}
        ${hasData ? '<p class="stats-foot">تُحدَّث الأرقام دوريًا من ملخص عام منفصل عن لوحة التحليلات.</p>' : ''}
      </div>
    </div>`;
  }

  function refreshStatsCard() {
    const host = $('[data-stats-card]');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = statsCardHtml();
    if (wrap.firstElementChild) host.replaceWith(wrap.firstElementChild);
  }

  function loadStatsSummary() {
    if (statsSummaryPromise) return statsSummaryPromise;
    statsSummaryState = 'loading';
    refreshStatsCard();
    statsSummaryPromise = fetch(STATS_SUMMARY_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('stats summary');
        return res.json();
      })
      .then((data) => {
        statsSummary = normalizeStatsSummary(data);
        statsSummaryState = 'ready';
        refreshStatsCard();
        return statsSummary;
      })
      .catch(() => {
        statsSummaryState = 'error';
        refreshStatsCard();
        return null;
      });
    return statsSummaryPromise;
  }

  function renderSettings() {
    if (statsSummaryState === 'idle') loadStatsSummary();
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
        <div class="card-head"><h2>${icon('star')} خطّتك تبدأ باسمك</h2><p>اختياري — يظهر في عنوان صفحة تقويمي ورأس الطباعة.</p></div>
        <div class="card-body">
          <div class="field">
            <label for="name">الاسم</label>
            <input class="input" id="name" type="text" maxlength="40" placeholder="اكتب اسمك هنا" value="${esc(state.name)}">
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
          <div class="row"><div><div class="r-title">مصدر البيانات</div><div class="r-desc">ملف البرنامج الرسمي «${esc(DATA.meta.source || 'تقويمي3 معدل.pdf')}» — ${total} فعالية فريدة، ${DATA.meta.occurrencesCount} ظهورًا في الأقسام.</div></div><span class="pill first">PDF</span></div>
          <div class="row"><div><div class="r-title">العمل دون اتصال</div><div class="r-desc">البرنامج وتقويمك وملاحظاتك تعمل دون إنترنت بعد أول زيارة. الوظائف التي تحتاج اتصالًا: لا شيء أساسي — التثبيت والتنبيهات تعتمد على المتصفح لا على الشبكة.</div></div><span class="pill attended">${icon('check')} مدعوم</span></div>
          <div class="row"><div><div class="r-title">الإصدار</div><div class="r-desc">${APP.name} ${APP.version}.0 — نسخة مراجعة داخلية.</div></div></div>
        </div>
      </div>

      ${statsCardHtml()}

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

      ${renderFooter()}
    </div>`;
  }

  /* ---------------- important links ---------------- */
  function renderLinks() {
    const links = [
      {
        title: 'الموقع الرسمي لمؤتمر ومعرض الحج',
        desc: 'للتسجيل والاطلاع على أجندة مؤتمر ومعرض الحج',
        href: 'https://hajjconfex.com/',
        image: 'assets/important-links/official-site.png',
        mobileImage: 'assets/important-links/official-site-mobile.png',
        alt: 'اسم مؤتمر ومعرض الحج وعبارة النسخة السادسة',
        cta: 'زيارة الموقع الرسمي',
        icon: 'link',
        feature: true,
        width: 660,
        height: 198,
      },
      {
        title: 'التطبيق الرسمي لمؤتمر ومعرض الحج',
        desc: 'استكشف العارضين، وتابع الجلسات وورش العمل، وخطّط لزيارتك',
        href: 'https://hajjconfex.com/mobile',
        image: 'assets/important-links/official-app.jpg',
        alt: 'واجهة التطبيق الرسمي مع الهاتف والأيقونات المحيطة به',
        cta: 'صفحة تحميل التطبيق',
        icon: 'phone',
        contain: true,
        width: 580,
        height: 635,
      },
      {
        title: 'الكتيب التعريفي لمؤتمر ومعرض الحج',
        desc: 'لقاءات واعدة وتجارب متنوعة، اكتشف تفاصيلها عبر دليل النسخة السادسة من مؤتمر ومعرض الحج',
        href: 'https://tiny.cc/HajjConfexguideAR',
        image: 'assets/important-links/guide-cover.png',
        alt: 'غلاف الدليل التعريفي لمؤتمر ومعرض الحج',
        cta: 'فتح الدليل',
        icon: 'download',
        contain: true,
        width: 722,
        height: 884,
      },
      {
        title: 'جدول برامج مؤتمر ومعرض الحج',
        desc: 'اطّلع على الملف الكامل لأجندة المؤتمر',
        href: 'https://drive.google.com/file/d/1uLrM2LI4T6nRnbZSYYi04vJW3prIZKug/view',
        image: 'assets/important-links/program-cover.png',
        alt: 'غلاف برنامج مؤتمر ومعرض الحج',
        cta: 'فتح ملف الأجندة',
        icon: 'table',
        contain: true,
        width: 682,
        height: 885,
      },
      {
        title: 'موقع انعقاد مؤتمر ومعرض الحج',
        desc: 'جدة سوبردوم، طريق المدينة المنورة، مطار الملك عبدالعزيز الدولي',
        href: 'https://maps.app.goo.gl/YMaHHXatAtruTfQH8',
        image: 'assets/important-links/venue.jpg',
        alt: 'القبة والمدخل الرئيسي لمركز جدة سوبردوم',
        cta: 'فتح في الخرائط',
        icon: 'pin',
        position: 'center 58%',
        width: 1010,
        height: 630,
      },
    ];

    const card = (l) => `<article class="link-card${l.feature ? ' link-card--feature' : ''}${l.contain ? ' link-card--contain' : ''}">
      <div class="link-card__media">
        <picture>
          ${l.mobileImage ? `<source media="(max-width: 720px)" srcset="${esc(l.mobileImage)}">` : ''}
          <img src="${esc(l.image)}" alt="${esc(l.alt)}" width="${l.width}" height="${l.height}" loading="eager" decoding="async"${l.position ? ` style="object-position:${l.position}"` : ''}>
        </picture>
      </div>
      <div class="link-card__body">
        <h2 class="link-card__title">${esc(l.title)}</h2>
        <p class="link-card__desc">${esc(l.desc)}</p>
        <div class="link-card__actions">
          <a class="btn btn-primary" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(l.cta)} (يفتح في نافذة جديدة)">${icon(l.icon)} ${esc(l.cta)}</a>
        </div>
      </div>
    </article>`;

    return `<div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">روابط مهمة</h1>
          <p class="page-sub">روابط المؤتمر في مكان واحد لتسهيل التخطيط لزيارتك</p>
        </div>
      </div>

      <p class="page-intro">${icon('info')} <span>الصور والروابط متاحة داخل التطبيق المثبّت دون اتصال، أما فتح الوجهات الخارجية فيحتاج إلى الإنترنت.</span></p>

      <div class="links-grid">${links.map(card).join('')}</div>

      ${renderFooter()}
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
    const wasSelected = !!r.priority;
    r.priority = (r.priority === p || !p) ? null : p;
    if (r.priority && r.reminder == null) r.reminder = null;
    const saved = save(true);
    if (!wasSelected && r.priority && saved) trackFirstPlanAdd();
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
    const wasSelected = !!r.priority;
    r.reminder = minutes;
    if (minutes != null && !r.priority) r.priority = 'first';
    const saved = save(true);
    if (!wasSelected && r.priority && saved) trackFirstPlanAdd();
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
        'المصدر: ' + (DATA.meta.source || 'تقويمي3 معدل.pdf'),
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

    /* The card is shown on every open/refresh; dismissing it only hides it
       for the current view, and the install button brings it back. */
    setTimeout(showInstallCard, 1400);
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
        <li>أو افتح قائمة المتصفح ← <strong>تثبيت تقويمي</strong>، أو اختر <strong>إضافة إلى الشاشة الرئيسية</strong> إن ظهرت.</li>
        <li>أكّد التثبيت.</li>
      </ol>`;
    }
    openModal({
      title: 'تثبيت التطبيق',
      body: steps,
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
    else if (route.name === 'links') html = renderLinks();
    else html = renderProgram();
    main.innerHTML = html;
    lastMyTimeSignature = route.name === 'my' ? myTimeSignature() : '';

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
    const t = e.target.closest('[data-go],[data-route],[data-day],[data-section],[data-filter],[data-set-prio],[data-att],[data-details],[data-goto-occ],[data-reminder],[data-view],[data-action],[data-toggle-notif],[data-day-panel],[data-clear-day-note]');
    if (!t) return;

    if (t.dataset.dayPanel) {
      toggleDayPanel(t.dataset.panelDay, t.dataset.dayPanel);
      return;
    }
    if (t.dataset.clearDayNote) {
      clearDayNote(t.dataset.clearDayNote);
      return;
    }

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
      if (a === 'print') { trackEvent('print_calendar'); window.print(); }
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
    if (e.target.id === 'name' || e.target.id === 'visitor-name') {
      state.name = e.target.value;
      save();
      if (e.target.id === 'visitor-name') updateMyNameUI();
    }
    if (e.target.dataset && e.target.dataset.dayNote) {
      const dayId = e.target.dataset.dayNote;
      const value = e.target.value;
      if (value.trim()) dayNotes[dayId] = value;
      else delete dayNotes[dayId];
      saveDayNotesSoon();
      $$(`[data-day-panel="notes"][data-panel-day="${dayId}"]`).forEach((btn) => btn.classList.toggle('has-note', !!value.trim()));
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

  /* ---------------- welcome modal ---------------- */
  const WELCOME_SEEN_KEY = 'taqwimi.welcome.seen';
  const WELCOME_TARGET = new Date('2026-11-08T09:00:00+03:00').getTime();
  let welcomeTimer = null;
  let welcomeShown = false;

  function welcomeWasSeen() { return sessionStorage.getItem(WELCOME_SEEN_KEY) === '1'; }
  function welcomeMarkSeen() { sessionStorage.setItem(WELCOME_SEEN_KEY, '1'); }

  function cdParts() {
    const sec = Math.floor((WELCOME_TARGET - Date.now()) / 1000);
    if (sec <= 0) return null;
    return { d: Math.floor(sec / 86400), h: Math.floor(sec / 3600) % 24, m: Math.floor(sec / 60) % 60, s: sec % 60 };
  }

  function showWelcome() {
    if (welcomeShown || welcomeWasSeen()) return;
    welcomeShown = true;
    const p = cdParts();
    const ended = !p;
    const cdHtml = ended ? ''
      : `<div class="welcome-cd" role="timer" aria-live="off">
           <div class="welcome-cd-row">
             <span class="welcome-cd-unit"><span id="cd-d">${pad(p.d)}</span><span class="welcome-cd-cap">يوم</span></span>
             <span class="welcome-cd-unit"><span id="cd-h">${pad(p.h)}</span><span class="welcome-cd-cap">ساعة</span></span>
             <span class="welcome-cd-unit"><span id="cd-m">${pad(p.m)}</span><span class="welcome-cd-cap">دقيقة</span></span>
             <span class="welcome-cd-unit"><span id="cd-s">${pad(p.s)}</span><span class="welcome-cd-cap">ثانية</span></span>
           </div>
         </div>`;
    const nameVal = esc(state.name || '');
    const body = `
      <div class="welcome-card">
        <div class="welcome-logo-wrap">
          <img class="welcome-logo" src="icons/conference-logo.png" alt="شعار مؤتمر ومعرض الحج" width="531" height="439">
        </div>
        <a class="welcome-link" href="https://hajjconfex.com/" target="_blank" rel="noopener noreferrer">
          <svg class="ic ext" aria-hidden="true"><use href="#i-link"></use></svg>
          الموقع الإلكتروني الرسمي لمؤتمر ومعرض الحج
        </a>
        ${ended ? '<h2 class="welcome-ended">انطلق المؤتمر، أهلاً بزيارتك</h2>' : `<h2 class="welcome-title">بقي على انطلاق المؤتمر</h2>${cdHtml}`}
        <div class="welcome-name field">
          <label for="welcome-name">خطّتك تبدأ باسمك</label>
          <input class="input welcome-name-input" id="welcome-name" type="text" maxlength="40" autocomplete="name" placeholder="اكتب اسمك هنا" value="${nameVal}">
          <div class="hint">اختياري — يظهر في عنوان “تقويمي” ورأس الطباعة.</div>
        </div>
      </div>`;
    const footer = `<div class="welcome-actions">
        <button class="btn btn-ghost welcome-skip" type="button">تخطي</button>
        <button class="btn btn-primary welcome-go" type="button">ابدأ زيارتي</button>
      </div>`;
    openModal({
      title: 'تقويمي',
      body,
      footer,
      onMount(root, close) {
        const input = root.querySelector('#welcome-name');
        const goBtn = root.querySelector('.welcome-go');
        const skip = root.querySelector('.welcome-skip');
        const foot = root.querySelector('.modal-foot');
        if (foot) foot.classList.add('welcome-foot');
        const card = root.querySelector('.modal');
        if (card) card.classList.add('welcome-modal');
        if (input) input.focus();
        goBtn.addEventListener('click', () => {
          state.name = input.value.trim();
          save(true);
          updateMyNameUI();
          close();
          go(href('program', state.settings.lastDay));
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            goBtn.click();
          }
        });
        skip.addEventListener('click', () => close());
        skip.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            skip.click();
          }
        });
        if (!ended) startWelcomeCd(root);
        root.addEventListener('keydown', (e) => {
          if (e.key !== 'Tab') return;
          const f = Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter((el) => !el.disabled && el.offsetParent !== null);
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });
      },
      onClose() {
        welcomeMarkSeen();
        clearInterval(welcomeTimer);
        welcomeTimer = null;
        welcomeShown = false;
      },
      returnFocus: null
    });
  }

  function startWelcomeCd(root) {
    const render = () => {
      const p = cdParts();
      if (!p) {
        const title = root.querySelector('.welcome-title');
        const cd = root.querySelector('.welcome-cd');
        if (title) { title.textContent = 'انطلق المؤتمر، أهلاً بزيارتك'; title.className = 'welcome-ended'; }
        if (cd) cd.remove();
        clearInterval(welcomeTimer);
        welcomeTimer = null;
        return;
      }
      [['d','cd-d'],['h','cd-h'],['m','cd-m'],['s','cd-s']].forEach(([id, elId]) => {
        const el = root.querySelector('#' + elId);
        if (!el) return;
        const v = pad(p[id]);
        if (el.textContent !== v) el.textContent = v;
      });
    };
    render();
    welcomeTimer = setInterval(render, 1000);
  }

  function myTimeSignature() {
    const now = riyadhNow();
    const list = sortEvents(selectedEvents());
    return now.date + '|' + DATA.days.map((day) => {
      const events = list.filter((e) => e.dayId === day.id);
      const finished = events.filter((e) => isEventFinished(e, now)).map((e) => e.id).sort().join(',');
      return `${day.id}:${isDayCollapsed(day.id, events, now) ? '1' : '0'}:${finished}`;
    }).join('|');
  }

  function refreshTimeState() {
    const route = currentRoute();
    if (route.name !== 'my') {
      lastMyTimeSignature = '';
      return;
    }
    const signature = myTimeSignature();
    if (signature === lastMyTimeSignature) return;
    const now = riyadhNow();
    const list = sortEvents(selectedEvents());
    DATA.days.forEach((day) => {
      const events = list.filter((e) => e.dayId === day.id);
      if (isDayCollapsed(day.id, events, now)) {
        delete openDayPanels[day.id + ':notes'];
        delete openDayPanels[day.id + ':finished'];
      }
    });
    lastMyTimeSignature = signature;
    render();
  }

  /* ---------------- init ---------------- */
  function init() {
    if (isStandalone()) trackEvent('app_open');
    $('#btn-back').addEventListener('click', () => history.back());
    $('#btn-forward').addEventListener('click', () => history.forward());
    $('#btn-install').addEventListener('click', showInstallCard);

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
    loadStatsSummary();
    handleHash(true);

    showWelcome();

    setupInstall();
    setInterval(checkReminders, 30000);
    setTimeout(checkReminders, 2500);
    refreshPrayerBars();
    refreshTimeState();
    setInterval(() => {
      refreshPrayerBars();
      refreshTimeState();
    }, 15000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        refreshPrayerBars();
        refreshTimeState();
      }
    });
    window.addEventListener('focus', () => {
      refreshPrayerBars();
      refreshTimeState();
    });
    window.addEventListener('pagehide', () => {
      clearTimeout(dayNoteTimer);
      writeJSON(DAY_NOTES_KEY, dayNotes);
    });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
