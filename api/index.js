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
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function verify(t) {
  try {
    const [p, s] = String(t).split('.');
    if (!same(s, mac(p))) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}
const hashPw = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
const checkPw = (pw, st) => { const [s, h] = String(st).split(':'); return same(crypto.scryptSync(pw, s, 32).toString('hex'), h); };
const rid = () => Math.random().toString(36).slice(2, 9);

// Role presets. 'custom' lets the owner tick permissions by hand.
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
    // Ensure default main shop outlet exists if no outlets exist
    const outletsSnap = await getDocs(collection(db, 'outlets'));
    if (outletsSnap.empty) {
      await setDoc(doc(db, 'outlets', 'main'), { id: 'main', name: 'Main Shop' });
    }

    // Ensure rev exists
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
  const snap = await getDoc(doc(db, 'meta', 'stats'));
  return snap.exists() ? Number(snap.data()?.rev) || 1 : 1;
}

async function incrRev() {
  await ensureInitialized();
  const cur = await getRev();
  const next = cur + 1;
  await setDoc(doc(db, 'meta', 'stats'), { rev: next }, { merge: true });
  return next;
}

async function getOutlets() {
  await ensureInitialized();
  const snap = await getDocs(collection(db, 'outlets'));
  const o = {};
  snap.forEach((d) => {
    o[d.id] = d.data();
  });
  if (!Object.keys(o).length) {
    o.main = { id: 'main', name: 'Main Shop' };
    await setDoc(doc(db, 'outlets', 'main'), o.main);
  }
  return o;
}

const stockOf = (p, outs) => p.stock || { [outs.main ? 'main' : Object.keys(outs)[0]]: +p.qty || 0 };
const sum = (st) => Object.values(st).reduce((a, b) => a + (+b || 0), 0);
const allowed = (me, outs) => (me.owner || !Array.isArray(me.ol) ? Object.keys(outs) : me.ol.filter((id) => outs[id]));

async function whoAmI(req) {
  await ensureInitialized();
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const d = verify(t);
  if (!d) throw fail(401, 'Please sign in again');
  if (d.o) return { name: OWNER_USER, owner: true, master: true, role: 'owner', add: 1, edit: 1, del: 1, sell: 1, blocked: [] };

  const uSnap = await getDoc(doc(db, 'users', d.n));
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
    getDocs(collection(db, 'products')),
    me.owner ? getDocs(collection(db, 'dealer')) : null,
    me.owner ? getDocs(collection(db, 'users')) : null,
  ]);

  const prods = {};
  prodsSnap.forEach((d) => { prods[d.id] = { id: d.id, ...d.data() }; });

  const dealer = {};
  if (dealerSnap) {
    dealerSnap.forEach((d) => { dealer[d.id] = d.data()?.v; });
  }

  const users = {};
  if (usersSnap) {
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
    outlets: ids.map((id) => outs[id]),
    products,
    users: Object.values(users).map(({ h, ...u }) => u),
  };
}

function cleanProduct(b) {
  const a = {};
  for (const [k, v] of Object.entries(b.a || {})) if (v !== '' && v != null && k.length < 30) a[k] = String(v).slice(0, 60);
  const p = {
    id: String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20),
    cat: String(b.cat || '').slice(0, 40),
    brand: String(b.brand || '').trim().slice(0, 40),
    model: String(b.model || '').trim().slice(0, 80),
    a,
    mrp: b.mrp === '' || b.mrp == null ? '' : Number(b.mrp) || 0,
  };
  if (!p.id || !p.cat || !p.brand || !p.model) throw fail(400, 'Brand and model are required');
  return p;
}

const logEv = async (me, act, p, from, to, outlet) => {
  const logId = Date.now() + '_' + rid();
  await setDoc(doc(db, 'log', logId), {
    t: Date.now(),
    who: me.name,
    act,
    outlet: outlet || '',
    cat: p.cat || '',
    brand: p.brand || '',
    model: p.model || '',
    from: from ?? null,
    to: to ?? null,
  });
};

const actions = {
  async login(req, b) {
    await ensureInitialized();
    const u = String(b.u || '').trim().toLowerCase(), p = String(b.p || '').trim();
    let token = null;

    // Admin user: parth / apple8901
    if (u === OWNER_USER && p.toLowerCase() === OWNER_PASS) {
      token = sign({ o: 1, exp: Date.now() + 30 * 864e5 });
    } else {
      const uSnap = await getDoc(doc(db, 'users', u));
      if (uSnap.exists()) {
        const x = uSnap.data();
        if (checkPw(p, x.h)) token = sign({ n: u, exp: Date.now() + 30 * 864e5 });
      }
    }

    if (!token) {
      await new Promise((r) => setTimeout(r, 500));
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
    const logQuery = query(collection(db, 'log'), orderBy('t', 'desc'), limit(2000));
    const snap = await getDocs(logQuery);
    const logs = [];
    snap.forEach((d) => logs.push(d.data()));
    return { log: logs };
  },

  async saveP(req, b, me) {
    const outs = await getOutlets();
    const ids = allowed(me, outs);
    const p = cleanProduct(b.p || {});

    const oldSnap = await getDoc(doc(db, 'products', p.id));
    const old = oldSnap.exists() ? oldSnap.data() : null;

    const sellOnly = !me.owner && !!old && !me.edit && !!me.sell;
    if (!me.owner) {
      if (!sellOnly && (old ? !me.edit : !me.add)) throw fail(403, 'You do not have permission to do that');
      if (sellOnly && (['cat', 'brand', 'model', 'mrp'].some((k) => old[k] !== p[k]) || JSON.stringify(old.a) !== JSON.stringify(p.a))) throw fail(403, 'You can only reduce stock');
      if (me.blocked.includes(p.brand) || (old && me.blocked.includes(old.brand))) throw fail(403, 'That brand is blocked for you');
      if (!ids.length) throw fail(403, 'You have no outlet access');
    }

    const oldStock = old ? stockOf(old, outs) : {};
    const sub = b.p.stock && typeof b.p.stock === 'object' ? b.p.stock : {};
    const stock = { ...oldStock };
    for (const id of ids) if (sub[id] !== undefined) stock[id] = Math.max(0, parseInt(sub[id]) || 0);
    if (sellOnly && Object.keys(stock).some((id) => (+stock[id] || 0) > (+oldStock[id] || 0))) throw fail(403, 'You can only reduce stock');

    p.stock = stock;
    p.qty = sum(stock);

    await setDoc(doc(db, 'products', p.id), p);

    if (!old) {
      const withStock = Object.keys(stock).filter((id) => stock[id] > 0);
      if (!withStock.length) await logEv(me, 'Added', p, null, 0, '');
      for (const id of withStock) await logEv(me, 'Added', p, null, stock[id], outs[id]?.name);
    } else {
      for (const id of new Set([...Object.keys(oldStock), ...Object.keys(stock)])) {
        const f = +oldStock[id] || 0, t = +stock[id] || 0;
        if (f !== t) await logEv(me, t > f ? 'Stock increased' : 'Stock decreased', p, f, t, outs[id]?.name);
      }
      if (['cat', 'brand', 'model', 'mrp'].some((k) => old[k] !== p[k]) || JSON.stringify(old.a) !== JSON.stringify(p.a)) {
        await logEv(me, 'Details edited', p, null, null, '');
      }
    }

    if (me.owner && b.p.dealer !== undefined) {
      if (b.p.dealer === '' || b.p.dealer == null) {
        await deleteDoc(doc(db, 'dealer', p.id));
      } else {
        await setDoc(doc(db, 'dealer', p.id), { v: Number(b.p.dealer) || 0 });
      }
    }

    await incrRev();
    return loadAll(me);
  },

  async delP(req, b, me) {
    const id = String(b.id || '');
    const oldSnap = await getDoc(doc(db, 'products', id));
    const old = oldSnap.exists() ? oldSnap.data() : null;

    if (!me.owner && (!me.del || (old && me.blocked.includes(old.brand)))) {
      throw fail(403, 'You do not have permission to delete');
    }

    await deleteDoc(doc(db, 'products', id));
    await deleteDoc(doc(db, 'dealer', id));

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
    const id = b.id && outs[b.id] ? b.id : 'o' + rid();

    if (Object.values(outs).some((o) => o.id !== id && o.name.toLowerCase() === name.toLowerCase())) {
      throw fail(409, 'An outlet with that name exists');
    }

    await setDoc(doc(db, 'outlets', id), { id, name });
    await incrRev();
    return loadAll(me);
  },

  async delO(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const outs = await getOutlets();
    const id = String(b.id || '');
    if (!outs[id]) throw fail(404, 'Outlet not found');
    if (Object.keys(outs).length < 2) throw fail(400, 'You need at least one outlet');

    const prodsSnap = await getDocs(collection(db, 'products'));
    const prods = [];
    prodsSnap.forEach((d) => prods.push(d.data()));

    if (prods.some((p) => (+stockOf(p, outs)[id] || 0) > 0)) {
      throw fail(409, 'This outlet still has stock. Set it to zero first.');
    }

    await deleteDoc(doc(db, 'outlets', id));
    await incrRev();
    return loadAll(me);
  },

  async saveU(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const u = b.u || {};
    const name = String(u.name || '').trim();
    if (!/^[\w .-]{1,30}$/.test(name)) throw fail(400, 'Username: letters, numbers, space . _ - (max 30)');
    const key = name.toLowerCase(), oldKey = u.old ? String(u.old).toLowerCase() : '';

    const existingSnap = await getDoc(doc(db, 'users', key));
    if (key === OWNER_USER || (key !== oldKey && existingSnap.exists())) {
      throw fail(409, 'That username is taken');
    }

    const prevSnap = oldKey ? await getDoc(doc(db, 'users', oldKey)) : null;
    const prev = prevSnap && prevSnap.exists() ? prevSnap.data() : null;

    const role = ROLES[u.role] ? u.role : 'custom';
    if ((role === 'owner' || (prev && prev.role === 'owner')) && !me.master) {
      throw fail(403, 'Only the main owner can manage Owner accounts');
    }

    const pr = ROLES[role] || { add: +!!u.add, edit: +!!u.edit, del: +!!u.del, sell: +!!u.sell };
    const pw = String(u.pw || '').trim();
    if (!pw && !prev) throw fail(400, 'Password required');

    await setDoc(doc(db, 'users', key), {
      name,
      h: pw ? hashPw(pw) : prev.h,
      role,
      add: pr.add,
      edit: pr.edit,
      del: pr.del,
      sell: pr.sell,
      blocked: Array.isArray(u.blocked) ? u.blocked.map(String) : [],
      outlets: Array.isArray(u.outlets) ? u.outlets.map(String) : null,
    });

    if (oldKey && oldKey !== key) {
      await deleteDoc(doc(db, 'users', oldKey));
    }

    await incrRev();
    return loadAll(me);
  },

  async delU(req, b, me) {
    if (!me.owner) throw fail(403, 'Owner only');
    const targetKey = String(b.name || '').toLowerCase();
    const targetSnap = await getDoc(doc(db, 'users', targetKey));
    const target = targetSnap.exists() ? targetSnap.data() : null;

    if (target && target.role === 'owner' && !me.master) {
      throw fail(403, 'Only the main owner can remove Owner accounts');
    }

    await deleteDoc(doc(db, 'users', targetKey));
    await incrRev();
    return loadAll(me);
  },
};

export default async function apiHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw fail(405, 'POST only');
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const fn = actions[b.a];
    if (!fn) throw fail(400, 'Unknown action');
    const me = b.a === 'login' || b.a === 'rev' ? null : await whoAmI(req);
    res.status(200).json(await fn(req, b, me));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
    if (!e.status) console.error(e);
  }
}
