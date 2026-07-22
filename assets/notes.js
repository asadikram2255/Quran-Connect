/**
 * notes.js — per-ayah study notes.
 *
 * Local first: a note is written to localStorage the moment it is saved, so
 * notes work offline, survive a refresh, and never wait on a network call.
 * When an account is signed in (see assets/notes-config.js) the same notes are
 * mirrored to Supabase, which is what makes them show up on every device.
 *
 * Talking to Supabase is done with plain fetch against its REST and auth
 * endpoints rather than the supabase-js bundle, so the site keeps loading no
 * scripts from anyone else.
 *
 * Usage:  await QuranNotes.ready;
 *         QuranNotes.list(2, 255)          // notes on 2:255, oldest first
 *         QuranNotes.add(2, 255, "…")
 *         QuranNotes.subscribe(fn)         // fn() on every change
 */
(function () {
  "use strict";

  const LS_NOTES = "quran-notes-v1";
  const LS_AUTH = "quran-notes-auth-v1";
  const SYNC_DELAY = 1500;          // ms of quiet before a save is uploaded

  const cfg = window.QURAN_NOTES_CONFIG || {};
  const base = String(cfg.url || "").replace(/\/+$/, "");
  const key = String(cfg.anonKey || "");
  const configured = !!(base && key);

  let notes = {};                   // id → note
  let session = null;               // {access_token, refresh_token, expires_at, user}
  let syncTimer = null;
  let syncing = null;               // in-flight sync promise
  let lastError = "";
  const listeners = new Set();

  /* ── Local store ───────────────────────────────────────────────────────── */

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // Fallback for older WebViews: RFC-4122 v4 from crypto.getRandomValues.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function readJSON(k, fallback) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function loadLocal() {
    const doc = readJSON(LS_NOTES, null);
    notes = (doc && doc.notes) || {};
  }

  function persist() {
    try {
      localStorage.setItem(LS_NOTES, JSON.stringify({ v: 1, notes }));
    } catch (e) {
      lastError = "This browser is out of storage space for notes.";
    }
    emit();
  }

  function emit() {
    for (const fn of listeners) {
      try { fn(); } catch (e) { /* a bad listener must not stop the rest */ }
    }
  }

  const alive = n => n && !n.deleted;
  const byCreated = (a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0);

  function list(sn, an) {
    return Object.values(notes)
      .filter(n => alive(n) && n.sn === +sn && n.an === +an)
      .sort(byCreated);
  }

  function all() {
    return Object.values(notes)
      .filter(alive)
      .sort((a, b) => a.sn - b.sn || a.an - b.an || byCreated(a, b));
  }

  function count(sn, an) {
    return list(sn, an).length;
  }

  function total() {
    return Object.values(notes).filter(alive).length;
  }

  function add(sn, an, body) {
    const now = new Date().toISOString();
    const note = { id: uid(), sn: +sn, an: +an, body: String(body), created: now, updated: now, deleted: false };
    notes[note.id] = note;
    persist();
    queueSync();
    return note;
  }

  function update(id, body) {
    const n = notes[id];
    if (!n) return null;
    n.body = String(body);
    n.updated = new Date().toISOString();
    persist();
    queueSync();
    return n;
  }

  function remove(id) {
    const n = notes[id];
    if (!n) return;
    n.deleted = true;
    n.body = "";
    n.updated = new Date().toISOString();
    persist();
    queueSync();
  }

  /* ── Account ───────────────────────────────────────────────────────────── */

  function loadAuth() {
    const s = readJSON(LS_AUTH, null);
    session = s && s.access_token ? s : null;
  }

  function saveAuth(s) {
    session = s;
    try {
      if (s) localStorage.setItem(LS_AUTH, JSON.stringify(s));
      else localStorage.removeItem(LS_AUTH);
    } catch (e) { /* ignore */ }
    emit();
  }

  function shape(json) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      // expires_in is seconds from now; keep an absolute moment instead.
      expires_at: Date.now() + (json.expires_in || 3600) * 1000,
      user: { id: json.user && json.user.id, email: json.user && json.user.email },
    };
  }

  const OFFLINE = "Could not reach the notes server — check your connection.";

  async function authFetch(path, body) {
    let r;
    try {
      r = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(OFFLINE);         // fetch only rejects on network failure
    }
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(json.error_description || json.msg || json.message || `Sign-in failed (${r.status})`);
    }
    return json;
  }

  async function signIn(email, password) {
    const json = await authFetch("/auth/v1/token?grant_type=password", { email, password });
    saveAuth(shape(json));
    await sync();
  }

  async function signUp(email, password) {
    const json = await authFetch("/auth/v1/signup", { email, password });
    // With "Confirm email" on, Supabase returns a user but no session yet.
    if (json.access_token) {
      saveAuth(shape(json));
      await sync();
      return { signedIn: true };
    }
    return { signedIn: false };
  }

  async function resetPassword(email) {
    await authFetch("/auth/v1/recover", { email });
  }

  function signOut() {
    // The notes already on this device stay; only the account link is dropped.
    saveAuth(null);
  }

  async function token() {
    if (!session) return null;
    if (session.expires_at - Date.now() > 60000) return session.access_token;
    try {
      const json = await authFetch("/auth/v1/token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      saveAuth(shape(json));
      return session.access_token;
    } catch (e) {
      saveAuth(null);                       // refresh token is spent or revoked
      lastError = "Signed out — please sign in again.";
      return null;
    }
  }

  /* ── Sync ──────────────────────────────────────────────────────────────── */

  async function rest(method, path, body, extraHeaders) {
    const t = await token();
    if (!t) throw new Error("Not signed in");
    const headers = Object.assign(
      { apikey: key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
      extraHeaders || {}
    );
    let r;
    try {
      r = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(OFFLINE);
    }
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      if (r.status === 404 || /PGRST20[45]/.test(text)) {
        throw new Error("The notes table is missing — run supabase/notes_schema.sql in your Supabase project.");
      }
      throw new Error(`Sync failed (${r.status}). ${text.slice(0, 160)}`);
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  const row = n => ({ id: n.id, sn: n.sn, an: n.an, body: n.body, created: n.created, updated: n.updated, deleted: !!n.deleted });
  const newer = (a, b) => new Date(a).getTime() > new Date(b).getTime();

  function queueSync() {
    if (!configured || !session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { sync(); }, SYNC_DELAY);
  }

  async function sync() {
    if (!configured || !session) return false;
    if (syncing) return syncing;            // one at a time; callers share it
    syncing = (async () => {
      try {
        const remote = (await rest("GET", "/rest/v1/notes?select=*")) || [];
        const remoteById = {};
        for (const r of remote) remoteById[r.id] = r;

        // Anything newer here than there goes up — including notes written
        // while signed out, which is how a fresh sign-in adopts them.
        const push = [];
        for (const n of Object.values(notes)) {
          const r = remoteById[n.id];
          if (!r || newer(n.updated, r.updated)) push.push(row(n));
        }
        // Anything newer there than here comes down.
        for (const r of remote) {
          const n = notes[r.id];
          if (!n || newer(r.updated, n.updated)) {
            notes[r.id] = { id: r.id, sn: r.sn, an: r.an, body: r.body || "", created: r.created, updated: r.updated, deleted: !!r.deleted };
          }
        }
        if (push.length) {
          await rest("POST", "/rest/v1/notes", push, {
            Prefer: "resolution=merge-duplicates,return=minimal",
          });
        }
        lastError = "";
        persist();
        return true;
      } catch (e) {
        lastError = e.message || String(e);
        emit();
        return false;
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  /* ── Boot ──────────────────────────────────────────────────────────────── */

  loadLocal();
  loadAuth();

  const ready = (async () => {
    if (configured && session) await sync();
  })();

  // Pick up notes written on another device when the tab comes back into view.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync();
  });
  // A second tab on this device edited the same store.
  window.addEventListener("storage", e => {
    if (e.key === LS_NOTES) { loadLocal(); emit(); }
    if (e.key === LS_AUTH) { loadAuth(); emit(); }
  });

  window.QuranNotes = {
    ready,
    list, all, count, total,
    add, update, remove,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // account
    configured: () => configured,
    user: () => (session ? session.user : null),
    signIn, signUp, signOut, resetPassword, sync,
    error: () => lastError,
    // Everything, for an export or a printout.
    export: () => ({ v: 1, exported: new Date().toISOString(), notes: all() }),
  };
})();
