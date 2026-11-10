/* صفحة إدارة التقييمات — تسجيل دخول المشرفة وحذف التعليقات.
   الصلاحية تُتحقق في Supabase عبر is_rating_moderator، والحذف تحكمه سياسات RLS. */
(function () {
  'use strict';

  const app = document.getElementById('admin-app');
  const config = window.TAQWIMI_SUPABASE || {};
  const publicKey = config.publishableKey || config.anonKey || '';

  const state = {
    client: null,
    ready: false,
    busy: false,
    loading: false,
    user: false,
    error: '',
    notice: '',
    summary: null,
    comments: [],
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function configOk() {
    return !!(config &&
      typeof config.url === 'string' && /^https:\/\/\S+$/i.test(config.url) &&
      typeof publicKey === 'string' && publicKey.length > 20 &&
      !/YOUR-|YOUR_|REPLACE/i.test(config.url + publicKey));
  }

  function errorMessage(err) {
    const msg = String(err && (err.message || err.error_description || err) || '');
    if (/invalid|credentials|password|email|grant/i.test(msg)) {
      return 'تعذر الدخول. تحقق من البريد وكلمة المرور.';
    }
    if (/network|fetch|load failed|failed to fetch/i.test(msg)) {
      return 'تعذّر الاتصال بخدمة التقييمات.';
    }
    if (/permission|row-level security|policy|not allowed|jwt/i.test(msg)) {
      return 'ليست لديك صلاحية لهذا الإجراء.';
    }
    return 'تعذّر إكمال العملية. حاول مرة أخرى.';
  }

  function formatDate(value) {
    const date = new Date(value || Date.now());
    try {
      return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function stars(rating) {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return `<span class="admin-stars" aria-label="${n} من ٥">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
  }

  function loginHtml() {
    return `<section class="admin-card admin-login">
      <h1 class="admin-title">دخول الإشراف</h1>
      <p class="admin-sub">هذه الصفحة مخصصة للمشرفة فقط. استخدم حساب Supabase المصرح له.</p>
      <form class="admin-form" data-admin-login>
        <label for="admin-email">البريد الإلكتروني
          <input class="input" id="admin-email" name="email" type="email" autocomplete="username" dir="ltr" required ${state.busy ? 'disabled' : ''}>
        </label>
        <label for="admin-password">كلمة المرور
          <input class="input" id="admin-password" name="password" type="password" autocomplete="current-password" dir="ltr" required ${state.busy ? 'disabled' : ''}>
        </label>
        <div class="admin-form-actions">
          <button class="btn btn-primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'جارٍ الدخول…' : 'دخول'}</button>
        </div>
      </form>
      ${state.error ? `<div class="admin-error" role="alert">${esc(state.error)}</div>` : ''}
      ${state.notice ? `<div class="admin-notice" role="status">${esc(state.notice)}</div>` : ''}
    </section>`;
  }

  function commentsHtml() {
    if (state.loading) return '<div class="admin-empty">جارٍ تحميل التعليقات…</div>';
    if (!state.comments.length) return '<div class="admin-empty">لا توجد تعليقات بعد.</div>';
    return `<div class="admin-list">${state.comments.map((entry) => `<article class="admin-comment">
      <div class="admin-comment-head">
        ${stars(entry.rating)}
        <span class="admin-comment-date">${esc(formatDate(entry.updated_at || entry.created_at))}</span>
      </div>
      <p dir="auto">${esc(entry.comment || '')}</p>
      <div class="admin-comment-actions">
        <button class="btn btn-sm btn-danger" type="button" data-admin-delete="${esc(entry.id)}" ${state.busy ? 'disabled' : ''}>${state.busy ? 'جارٍ الحذف…' : 'حذف التعليق'}</button>
      </div>
    </article>`).join('')}</div>`;
  }

  function panelHtml() {
    const summary = state.summary || {};
    const count = Number(summary.count) || 0;
    const average = Number(summary.average) || 0;
    const commentCount = Number(summary.comment_count) || 0;
    return `<section class="admin-card ${state.busy || state.loading ? 'admin-busy' : ''}">
      <div class="admin-panel-head">
        <div>
          <h1 class="admin-title">وضع المشرفة</h1>
          <p class="admin-sub">يمكنك حذف التعليقات المخالفة. لا يظهر بريدك هنا أو في الموقع العام.</p>
        </div>
        <div class="admin-toolbar">
          <button class="btn btn-sm btn-ghost" type="button" data-admin-refresh ${state.busy || state.loading ? 'disabled' : ''}>تحديث</button>
          <button class="btn btn-sm btn-ghost" type="button" data-admin-logout ${state.busy ? 'disabled' : ''}>خروج</button>
        </div>
      </div>
      <div class="admin-stats">
        <div class="admin-stat"><span>إجمالي التقييمات</span><strong>${count}</strong></div>
        <div class="admin-stat"><span>المتوسط</span><strong>${count ? average.toFixed(1) : '—'}</strong></div>
        <div class="admin-stat"><span>التعليقات</span><strong>${commentCount}</strong></div>
      </div>
      ${state.error ? `<div class="admin-error" role="alert">${esc(state.error)}</div>` : ''}
      ${state.notice ? `<div class="admin-notice" role="status">${esc(state.notice)}</div>` : ''}
      ${commentsHtml()}
    </section>`;
  }

  function render() {
    if (!app) return;
    if (!state.ready) {
      app.innerHTML = '<div class="admin-card admin-loading">جارٍ التحقق من الجلسة…</div>';
      return;
    }
    app.innerHTML = state.user ? panelHtml() : loginHtml();
  }

  async function loadComments() {
    if (!state.client || !state.user || state.loading) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const [summaryRes, listRes] = await Promise.all([
        state.client.from('ratings_summary').select('count,average,comment_count').maybeSingle(),
        state.client.from('ratings_public')
          .select('id,rating,comment,created_at,updated_at')
          .not('comment', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(200),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      if (listRes.error) throw listRes.error;
      state.summary = summaryRes.data || {};
      state.comments = Array.isArray(listRes.data) ? listRes.data : [];
    } catch (e) {
      state.error = errorMessage(e);
      console.warn('[admin comments]', e);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function handleLogin(form) {
    if (!state.client || state.busy) return;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (!email || !password) {
      state.error = 'أدخل البريد وكلمة المرور.';
      render();
      return;
    }
    state.busy = true;
    state.error = '';
    state.notice = '';
    render();
    try {
      const { error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: isModerator, error: modError } = await state.client.rpc('is_rating_moderator');
      if (modError) throw modError;
      if (isModerator !== true) {
        await state.client.auth.signOut();
        state.busy = false;
        state.user = false;
        state.error = 'هذا الحساب لا يملك صلاحية المشرفة.';
        render();
        return;
      }
      state.user = true;
      state.busy = false;
      state.notice = 'تم تفعيل وضع المشرفة.';
      await loadComments();
    } catch (e) {
      state.busy = false;
      state.user = false;
      state.error = errorMessage(e);
      render();
      console.warn('[admin login]', e);
    }
  }

  async function logout() {
    if (!state.client || state.busy) return;
    state.busy = true;
    state.error = '';
    state.notice = '';
    render();
    try {
      const { error } = await state.client.auth.signOut();
      if (error) throw error;
      state.user = false;
      state.summary = null;
      state.comments = [];
      state.notice = 'تم الخروج من وضع المشرفة.';
    } catch (e) {
      state.error = errorMessage(e);
      console.warn('[admin logout]', e);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function deleteComment(id) {
    if (!state.client || !state.user || state.busy) return;
    if (!window.confirm('حذف هذا التعليق نهائيًا؟')) return;
    state.busy = true;
    state.error = '';
    state.notice = '';
    render();
    try {
      const { error } = await state.client.from('ratings').delete().eq('id', id);
      if (error) throw error;
      state.busy = false;
      state.notice = 'تم حذف التعليق.';
      await loadComments();
    } catch (e) {
      state.busy = false;
      state.error = errorMessage(e);
      render();
      console.warn('[admin delete]', e);
    }
  }

  async function boot() {
    if (!configOk()) {
      state.ready = true;
      state.error = 'إعدادات خدمة التقييمات غير متاحة.';
      render();
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      state.ready = true;
      state.error = 'تعذّر تحميل خدمة التقييمات.';
      render();
      return;
    }
    try {
      state.client = window.supabase.createClient(String(config.url).replace(/\/+$/, ''), publicKey, {
        auth: {
          storageKey: 'taqwimi-moderator-auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        state.ready = true;
        render();
        return;
      }
      const { data: isModerator, error: modError } = await state.client.rpc('is_rating_moderator');
      if (modError) throw modError;
      if (isModerator !== true) {
        await state.client.auth.signOut();
        state.ready = true;
        state.error = 'هذا الحساب لا يملك صلاحية المشرفة.';
        render();
        return;
      }
      state.user = true;
      state.ready = true;
      await loadComments();
    } catch (e) {
      state.ready = true;
      state.error = errorMessage(e);
      render();
      console.warn('[admin boot]', e);
    }
  }

  if (app) {
    app.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-admin-login]');
      if (!form) return;
      event.preventDefault();
      handleLogin(form);
    });
    app.addEventListener('click', (event) => {
      const logoutButton = event.target.closest('[data-admin-logout]');
      if (logoutButton) { logout(); return; }
      const refreshButton = event.target.closest('[data-admin-refresh]');
      if (refreshButton) { loadComments(); return; }
      const deleteButton = event.target.closest('[data-admin-delete]');
      if (deleteButton) { deleteComment(deleteButton.dataset.adminDelete); return; }
    });
  }

  boot();
})();
