// Mehta Sales API — backed by Firebase Firestore
// JSON-RPC style: POST /api { a: 'action', ... }
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import crypto from 'crypto';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const SECRET = process.env.AUTH_SECRET || 'mehta-sales-default-jwt-secret-key-39f8d1e7c4b2a6';
const OWNER_USER = (process.env.OWNER_USER || 'parth').toLowerCase();
const OWNER_PASS = (process.env.OWNER_PASS || 'apple8901').toLowerCase();

const fail = (status, error) => Object.assign(new Error(error), { status });
const b64 = (s) => Buffer.from(s).toString('base64url');
const mac = (p) => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
const sign = (d) => { const p = b64(JSON.stringify(d)); return p + '.' + mac(p); };

const same = (a, b) => {
  try {
    if (!a || !b) return false;
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
};

function verify(t) {
  try {
    if (!t) return null;
    const parts = String(t).split('.');
    if (parts.length !== 2) return null;
    const [p, s] = parts;
    if (!p || !s) return null;
    if (!same(s, mac(p))) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf-8'));
    return d && d.exp > Date.now() ? d : null;
  } catch { return null; }
}

const hashPw = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
};

const checkPw = (pw, st) => {
  try {
    if (!pw || !st) return false;
    const [s, h] = String(st).split(':');
    if (!s || !h) return false;
    return same(crypto.scryptSync(String(pw), s, 32).toString('hex'), h);
  } catch {
    return false;
  }
};

const rid = () => Math.random().toString(36).slice(2, 9);

function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore).filter(x => x !== undefined);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean;
}

// Role presets.
const ROLES = {
  owner: { add: 1, edit: 1, del: 1, sell: 1 },
  manager: { add: 1, edit: 1, del: 1, sell: 1 },
  store: { add: 1, edit: 1, del: 0, sell: 1 },
  sales: { add: 0, edit: 0, del: 0, sell: 1 },
};

// ---------- Firestore Helper Store ----------
let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  try {
    const outletsSnap = await getDocs(collection(db, 'outlets'));
    if (outletsSnap.empty) {
      await setDoc(doc(db, 'outlets', 'main'), { id: 'main', name: 'Main Shop' });
    }

    const revSnap = await getDoc(doc(db, 'meta', 'stats'));
    if (!revSnap.exists()) {
      await setDoc(doc(db, 'meta', 'stats'), { rev: 1 });
    }
  } catch (err) {
    console.error('Error during Firestore initialization:', err);
  }
}

async function getRev() {
  await ensureInitialized();
  try {
    const snap = await getDoc(doc(db, 'meta', 'stats'));
    return snap.exists() ? Number(snap.data()?.rev) || 1 : 1;
  } catch {
    return 1;
  }
}

async function incrRev() {
  await ensureInitialized();
  try {
    const cur = await getRev();
    const next = cur + 1;
    await setDoc(doc(db, 'meta', 'stats'), { rev: next }, { merge: true });
    return next;
  } catch {
    return 1;
  }
}

async function getOutlets() {
  await ensureInitialized();
  try {
    const snap = await getDocs(collection(db, 'outlets'));
    const o = {};
    snap.forEach((d) => {
      const data = d.data();
      if (data && data.id) o[d.id] = data;
    });
    if (!Object.keys(o).length) {
      o.main = { id: 'main', name: 'Main Shop' };
      await setDoc(doc(db, 'outlets', 'main'), o.main);
    }
    return o;
  } catch (err) {
    console.error('getOutlets error:', err);
    return { main: { id: 'main', name: 'Main Shop' } };
  }
}

const stockOf = (p, outs) => p.stock || { [outs.main ? 'main' : Object.keys(outs)[0] || 'main']: +p.qty || 0 };
const sum = (st) => Object.values(st || {}).reduce((a, b) => a + (+b || 0), 0);
const allowed = (me, outs) => (me.owner || !Array.isArray(me.ol) ? Object.keys(outs) : me.ol.filter((id) => outs[id]));

async function whoAmI(req) {
  await ensureInitialized();
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const d = verify(t);
  if (!d) throw fail(401, 'Please sign in again');
  if (d.o) return { name: OWNER_USER, owner: true, master: true, role: 'owner', add: 1, edit: 1, del: 1, sell: 1, blocked: [] };

  const rawUser = String(d.n || '').toLowerCase().trim();
  if (!rawUser || !/^[a-z0-9_.-]{1,50}$/.test(rawUser)) throw fail(401, 'Please sign in again');
  const uSnap = await getDoc(doc(db, 'users', rawUser));
  if (!uSnap.exists()) throw fail(401, 'Account no longer exists');
  const u = uSnap.data();
  if (u.role === 'owner') return { name: u.name, owner: true, master: false, role: 'owner', add: 1, edit: 1, del: 1, sell: 1, blocked: [] };
  return { name: u.name, owner: false, master: false, role: u.role || 'custom', add: u.add, edit: u.edit, del: u.del, sell: u.sell ?? (u.edit ? 1 : 0), blocked: u.blocked || [], ol: u.outlets };
}

async function loadAll(me) {
  await ensureInitialized();
  const rev = await getRev();
  const outs = await getOutlets();
  const ids = allowed(me, outs);

  const [prodsSnap, dealerSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'products')).catch(() => ({ forEach: () => {} })),
    me.owner ? getDocs(collection(db, 'dealer')).catch(() => ({ forEach: () => {} })) : null,
    me.owner ? getDocs(collection(db, 'users')).catch(() => ({ forEach: () => {} })) : null,
  ]);

  const prods = {};
  if (prodsSnap && typeof prodsSnap.forEach === 'function') {
    prodsSnap.forEach((d) => { prods[d.id] = { id: d.id, ...d.data() }; });
  }

  const dealer = {};
  if (dealerSnap && typeof dealerSnap.forEach === 'function') {
    dealerSnap.forEach((d) => { dealer[d.id] = d.data()?.v; });
  }

  const users = {};
  if (usersSnap && typeof usersSnap.forEach === 'function') {
    usersSnap.forEach((d) => { users[d.id] = d.data(); });
  }

  let products = Object.values(prods);
  if (!me.owner) products = products.filter((p) => !me.blocked.includes(p.brand));
  products = products.map((p) => {
    const all = stockOf(p, outs), stock = {};
    ids.forEach((id) => (stock[id] = +all[id] || 0));
    const r = { ...p, stock, qty: sum(stock) };
    if (me.owner) r.dealer = dealer[p.id] ?? '';
    return r;
  });

  const { ol, ...pub } = me;
  return {
    me: { ...pub, outlets: ids },
    rev,
    outlets: ids.map((id) => outs[id]).filter(Boolean),
    products,
    users: Object.values(users).map(({ h, ...u }) => u),
  };
}

function cleanProduct(b) {
  const a = {};
  for (const [k, v] of Object.entries(b?.a || {})) {
    if (v !== '' && v != null && k && k.length < 30) {
      a[k] = String(v).slice(0, 60);
    }
  }
  const rawId = String(b?.id || '').trim();
  const cleanId = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  const id = cleanId || ('p' + rid());
  const cat = String(b?.cat || '').trim().slice(0, 40) || 'Other';
  const brand = String(b?.brand || '').trim().slice(0, 40);
  const model = String(b?.model || '').trim().slice(0, 80);
  
  const mrpVal = b?.mrp;
  let mrp = '';
  if (mrpVal !== '' && mrpVal != null) {
    const num = Number(String(mrpVal).replace(/[^0-9.]/g, ''));
    mrp = isNaN(num) ? 0 : num;
  }

  if (!brand || !model) throw fail(400, 'Brand and model are required');
  return { id, cat, brand, model, a, mrp };
}

const logEv = async (me, act, p, from, to, outlet) => {
  try {
    const logId = Date.now() + '_' + rid();
    await setDoc(doc(db, 'log', logId), sanitizeForFirestore({
      t: Date.now(),
      who: me?.name || 'unknown',
      act: act || '',
      outlet: outlet || '',
      cat: p?.cat || '',
      brand: p?.brand || '',
      model: p?.model || '',
      from: from ?? null,
      to: to ?? null,
    }));
  } catch (err) {
    console.warn('logEv non-fatal error:', err);
  }
};

const actions = {
  async login(req, b) {
    await ensureInitialized();
    const u = String(b.u || '').trim().toLowerCase();
    const p = String(b.p || '').trim();
    if (!u || !p) throw fail(400, 'Please enter username and password');
    let token = null;

    // Support both 'parth' and 'admin' with owner password
    const isOwnerUser = (u === OWNER_USER || u === 'parth' || u === 'admin');
    const isOwnerPass = (p.toLowerCase() === OWNER_PASS || p === 'apple8901');

    if (isOwnerUser && isOwnerPass) {
      token = sign({ o: 1, exp: Date.now() + 30 * 864e5 });
    } else if (/^[a-z0-9_.-]{1,50}$/.test(u)) {
      try {
        const uSnap = await getDoc(doc(db, 'users', u));
        if (uSnap.exists()) {
          const x = uSnap.data();
          if (checkPw(p, x?.h)) token = sign({ n: u, exp: Date.now() + 30 * 864e5 });
        }
      } catch (err) {
        console.warn('User lookup warning:', err);
      }
    }

    if (!token) {
      await new Promise((r) => setTimeout(r, 300));
      throw fail(401, 'Wrong username or password');
    }

    const me = await whoAmI({ headers: { authorization: token } });
    return { token, ...(await loadAll(me)) };
  },

  async load(req, b, me) {
    return loadAll(me);
  },

  async rev(req) {
    if (!verify((req.headers.authorization || '').replace('Bearer ', ''))) {
      throw fail(401, 'Please sign in again');
    }
    return { rev: await getRev() };
  },

  async log(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    try {
      const logQuery = query(collection(db, 'log'), orderBy('t', 'desc'), limit(2000));
      const snap = await getDocs(logQuery);
      const logs = [];
      snap.forEach((d) => logs.push(d.data()));
      return { log: logs };
    } catch (err) {
      console.warn('Ordered log query fallback:', err);
      const snap = await getDocs(collection(db, 'log')).catch(() => ({ forEach: () => {} }));
      const logs = [];
      snap.forEach((d) => logs.push(d.data()));
      logs.sort((x, y) => (y.t || 0) - (x.t || 0));
      return { log: logs.slice(0, 2000) };
    }
  },

  async saveP(req, b, me) {
    const outs = await getOutlets();
    const ids = allowed(me, outs);
    const p = cleanProduct(b.p || {});

    let old = null;
    try {
      const oldSnap = await getDoc(doc(db, 'products', p.id));
      old = oldSnap && oldSnap.exists() ? oldSnap.data() : null;
    } catch (err) {
      console.warn('saveP getDoc warning:', err);
    }

    const sellOnly = !me.owner && !!old && !me.edit && !!me.sell;
    if (!me.owner) {
      if (!sellOnly && (old ? !me.edit : !me.add)) throw fail(403, 'You do not have permission to do that');
      if (sellOnly && (['cat', 'brand', 'model', 'mrp'].some((k) => old[k] !== p[k]) || JSON.stringify(old.a || {}) !== JSON.stringify(p.a || {}))) throw fail(403, 'You can only reduce stock');
      const blocked = Array.isArray(me.blocked) ? me.blocked : [];
      if (blocked.includes(p.brand) || (old && blocked.includes(old.brand))) throw fail(403, 'That brand is blocked for you');
      if (!ids.length) throw fail(403, 'You have no outlet access');
    }

    const oldStock = old ? stockOf(old, outs) : {};
    const sub = b.p?.stock && typeof b.p.stock === 'object' ? b.p.stock : {};
    const stock = { ...oldStock };
    for (const id of ids) {
      if (sub[id] !== undefined) {
        const parsed = parseInt(sub[id], 10);
        stock[id] = Math.max(0, isNaN(parsed) ? 0 : parsed);
      }
    }
    if (sellOnly && Object.keys(stock).some((id) => (+stock[id] || 0) > (+oldStock[id] || 0))) {
      throw fail(403, 'You can only reduce stock');
    }

    p.stock = stock;
    p.qty = sum(stock);

    await setDoc(doc(db, 'products', p.id), sanitizeForFirestore(p));

    if (!old) {
      const withStock = Object.keys(stock).filter((id) => stock[id] > 0);
      if (!withStock.length) await logEv(me, 'Added', p, null, 0, '');
      for (const id of withStock) await logEv(me, 'Added', p, null, stock[id], outs[id]?.name || '');
    } else {
      for (const id of new Set([...Object.keys(oldStock), ...Object.keys(stock)])) {
        const f = +oldStock[id] || 0, t = +stock[id] || 0;
        if (f !== t) await logEv(me, t > f ? 'Stock increased' : 'Stock decreased', p, f, t, outs[id]?.name || '');
      }
      if (['cat', 'brand', 'model', 'mrp'].some((k) => old[k] !== p[k]) || JSON.stringify(old.a) !== JSON.stringify(p.a)) {
        await logEv(me, 'Details edited', p, null, null, '');
      }
    }

    if (me.owner && b.p?.dealer !== undefined) {
      const dVal = b.p.dealer;
      if (dVal === '' || dVal == null) {
        await deleteDoc(doc(db, 'dealer', p.id)).catch(() => {});
      } else {
        const num = Number(String(dVal).replace(/[^0-9.]/g, ''));
        const cleanDealer = isNaN(num) ? 0 : num;
        await setDoc(doc(db, 'dealer', p.id), { v: cleanDealer });
      }
    }

    await incrRev();
    return loadAll(me);
  },

  async delP(req, b, me) {
    const rawId = String(b.id || '').trim();
    const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    if (!id) throw fail(400, 'Product ID required');

    let old = null;
    try {
      const oldSnap = await getDoc(doc(db, 'products', id));
      old = oldSnap && oldSnap.exists() ? oldSnap.data() : null;
    } catch (err) {
      console.warn('delP getDoc warning:', err);
    }

    const blocked = Array.isArray(me.blocked) ? me.blocked : [];
    if (!me.owner && (!me.del || (old && blocked.includes(old.brand)))) {
      throw fail(403, 'You do not have permission to delete');
    }

    await deleteDoc(doc(db, 'products', id)).catch(() => {});
    await deleteDoc(doc(db, 'dealer', id)).catch(() => {});

    if (old) {
      await logEv(me, 'Deleted', old, +old.qty || 0, 0, '');
    }
    await incrRev();
    return loadAll(me);
  },

  async saveO(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const outs = await getOutlets();
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) throw fail(400, 'Enter an outlet name');
    const rawId = String(b.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    const id = rawId && outs[rawId] ? rawId : 'o' + rid();

    if (Object.values(outs).some((o) => o && o.id !== id && String(o.name || '').toLowerCase() === name.toLowerCase())) {
      throw fail(409, 'An outlet with that name exists');
    }

    await setDoc(doc(db, 'outlets', id), { id, name });
    await incrRev();
    return loadAll(me);
  },

  async delO(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const outs = await getOutlets();
    const id = String(b.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || !outs[id]) throw fail(404, 'Outlet not found');
    if (Object.keys(outs).length < 2) throw fail(400, 'You need at least one outlet');

    const prodsSnap = await getDocs(collection(db, 'products')).catch(() => ({ forEach: () => {} }));
    const prods = [];
    if (prodsSnap && typeof prodsSnap.forEach === 'function') {
      prodsSnap.forEach((d) => { if (d.data()) prods.push(d.data()); });
    }

    if (prods.some((p) => (+stockOf(p, outs)[id] || 0) > 0)) {
      throw fail(409, 'This outlet still has stock. Set it to zero first.');
    }

    await deleteDoc(doc(db, 'outlets', id)).catch(() => {});
    await incrRev();
    return loadAll(me);
  },

  async saveU(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const u = b.u || {};
    const name = String(u.name || '').trim();
    if (!/^[a-zA-Z0-9_.-]{1,30}$/.test(name)) throw fail(400, 'Username: letters, numbers, . _ - (max 30)');
    const key = name.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const oldKey = u.old ? String(u.old).toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '') : '';

    let existingSnap = null;
    try {
      existingSnap = await getDoc(doc(db, 'users', key));
    } catch {}
    if (key === OWNER_USER || key === 'parth' || key === 'admin' || (key !== oldKey && existingSnap && existingSnap.exists())) {
      throw fail(409, 'That username is taken');
    }

    let prev = null;
    if (oldKey) {
      try {
        const prevSnap = await getDoc(doc(db, 'users', oldKey));
        prev = prevSnap && prevSnap.exists() ? prevSnap.data() : null;
      } catch {}
    }

    const role = ROLES[u.role] ? u.role : 'custom';
    if ((role === 'owner' || (prev && prev.role === 'owner')) && !me.master) {
      throw fail(403, 'Only the main owner can manage Owner accounts');
    }

    const pr = ROLES[role] || { add: +!!u.add, edit: +!!u.edit, del: +!!u.del, sell: +!!u.sell };
    const pw = String(u.pw || '').trim();
    if (!pw && !prev) throw fail(400, 'Password required');
    const passwordHash = pw ? hashPw(pw) : (prev ? prev.h : hashPw('123456'));

    const userDoc = sanitizeForFirestore({
      name,
      h: passwordHash,
      role,
      add: pr.add ?? 0,
      edit: pr.edit ?? 0,
      del: pr.del ?? 0,
      sell: pr.sell ?? 1,
      blocked: Array.isArray(u.blocked) ? u.blocked.map(String) : [],
      outlets: Array.isArray(u.outlets) ? u.outlets.map(String) : null,
    });

    await setDoc(doc(db, 'users', key), userDoc);

    if (oldKey && oldKey !== key) {
      await deleteDoc(doc(db, 'users', oldKey)).catch(() => {});
    }

    await incrRev();
    return loadAll(me);
  },

  async delU(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const targetKey = String(b.name || '').toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
    if (!targetKey) throw fail(400, 'Username required');

    let target = null;
    try {
      const targetSnap = await getDoc(doc(db, 'users', targetKey));
      target = targetSnap && targetSnap.exists() ? targetSnap.data() : null;
    } catch {}

    if (target && target.role === 'owner' && !me.master) {
      throw fail(403, 'Only the main owner can remove Owner accounts');
    }

    await deleteDoc(doc(db, 'users', targetKey)).catch(() => {});
    await incrRev();
    return loadAll(me);
  },
};

export default async function apiHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, app: 'Mehta Sales API' });
  }
  try {
    if (req.method !== 'POST') throw fail(405, 'POST only');
    let b = req.body;
    if (typeof b === 'string') {
      try {
        b = JSON.parse(b || '{}');
      } catch {
        b = {};
      }
    }
    b = b || {};
    const fn = actions[b.a];
    if (!fn) throw fail(400, 'Unknown action: ' + String(b.a || 'none'));
    const me = b.a === 'login' || b.a === 'rev' ? null : await whoAmI(req);
    const result = await fn(req, b, me);
    if (!res.headersSent) {
      res.status(200).json(result);
    }
  } catch (e) {
    const status = typeof e.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500;
    const errorMsg = e.message || 'Server error';
    if (!res.headersSent) {
      res.status(status).json({ error: errorMsg });
    }
    console.error(`API Error (${status}) [action: ${req?.body?.a}]:`, e);
  }
}
