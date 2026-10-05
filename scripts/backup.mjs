// Full project backup — Firestore + Firebase Auth + Firebase Storage.
// Uses Google REST APIs with the token from `firebase login` (no service-account key needed).
//
//   npm run backup
//
// Output: backup/firebase-backup-<timestamp>/
//   firestore/<collection>/documents.json      readable JSON ({id, path, data})
//   firestore/<collection>/documents.raw.json  exact Firestore REST payloads (round-trippable)
//   auth/users.json                            Firebase Auth accounts
//   storage/**                                 every object in the Storage bucket
//   manifest.json                              counts, hashes, missing/orphan report
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PROJECT_ID = 'recruitment-portal-7b629';
const BUCKET_CANDIDATES = [
  'recruitment-portal-7b629.firebasestorage.app',
  'recruitment-portal-7b629.appspot.com',
];
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OUT_DIR = path.join(process.cwd(), 'backup', `firebase-backup-${stamp()}`);
const PAGE_SIZE = 500;
const CONCURRENCY = 8;
const FAILED = [];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// --------------------------------------------------------------- credentials
async function getAccessToken() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Not logged in to Firebase CLI. Run: firebase login');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const refreshToken = cfg?.tokens?.refresh_token;
  if (!refreshToken) throw new Error('No Firebase CLI refresh token. Run: firebase login');
  const fbAuthPath = path.join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib', 'auth.js');
  const fbAuth = require(fbAuthPath);
  const t = await fbAuth.getAccessToken(refreshToken, String(cfg.tokens.scope || '').split(' ').filter(Boolean));
  const access = t?.access_token || t?.accessToken;
  if (!access) throw new Error('Could not obtain an access token from Firebase CLI credentials');
  return access;
}

// ------------------------------------------------------------------ utilities
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return results;
}

async function api(url, opts = {}, attempts = 3) {
  let lastErr;
  for (let n = 0; n < attempts; n++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res.json();
      const body = (await res.text()).slice(0, 400);
      const err = new Error(`HTTP ${res.status} ${res.statusText} :: ${body}`);
      err.status = res.status;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
      lastErr = err;
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1200 * (n + 1)));
  }
  throw lastErr;
}

function toPlain(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('bytesValue' in v) return { __type: 'bytes', base64: v.bytesValue };
  if ('referenceValue' in v) return { __type: 'reference', path: v.referenceValue };
  if ('geoPointValue' in v) return { __type: 'geopoint', latitude: v.geoPointValue.latitude, longitude: v.geoPointValue.longitude };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(toPlain);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = toPlain(val);
    return out;
  }
  return v;
}

function collectUrls(node, source, out) {
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node) && /firebasestorage\.googleapis\.com|\/storage\/v1\/object\/|supabase\.co\/storage/.test(node)) {
      out.push({ url: node, source });
    }
    return;
  }
  if (Array.isArray(node)) return node.forEach((n, i) => collectUrls(n, `${source}[${i}]`, out));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collectUrls(v, source ? `${source}.${k}` : k, out);
  }
}

function objectNameFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'firebasestorage.googleapis.com') {
      const m = u.pathname.match(/\/o\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : null;
    }
    if (u.hostname === 'storage.googleapis.com') {
      const seg = u.pathname.split('/').filter(Boolean);
      const o = seg.indexOf('o');
      return o >= 0 ? decodeURIComponent(seg.slice(o + 1).join('/')) : null;
    }
    if (u.hostname.includes('supabase.co')) {
      const m = u.pathname.match(/\/object\/(?:public|sign)\/(.+)$/);
      if (m) return decodeURIComponent(m[1].split('?')[0]);
    }
  } catch { /* ignore */ }
  return null;
}

// ------------------------------------------------------------------ firestore
async function listRootCollections(H) {
  const r = await api(`${FIRESTORE}:listCollectionIds`, { method: 'POST', headers: H, body: '{}' });
  return r.collectionIds || [];
}

async function listDocuments(H, colPath) {
  const docs = [];
  let pageToken;
  do {
    const url = `${FIRESTORE}/${colPath}?pageSize=${PAGE_SIZE}&orderBy=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await api(url, { headers: H });
    for (const d of r.documents || []) docs.push(d);
    pageToken = r.nextPageToken;
  } while (pageToken);
  return docs;
}

async function listSubcollections(H, docPath) {
  try {
    const r = await api(`${FIRESTORE}/${docPath}:listCollectionIds`, { method: 'POST', headers: H, body: '{}' });
    return r.collectionIds || [];
  } catch (err) {
    FAILED.push({ step: 'listSubcollections', path: docPath, error: String(err.message).slice(0, 300) });
    return [];
  }
}

async function dumpCollection(H, colPath, dir, stats) {
  const raw = await listDocuments(H, colPath);
  const readable = raw.map((d) => {
    const id = d.name.split('/').pop();
    const parent = d.name.split('/documents/')[1].split('/');
    parent.pop();
    return { id, path: [parent.join('/'), id].filter(Boolean).join('/'), data: toPlain(d.fields || {}) };
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'documents.json'), JSON.stringify(readable, null, 2));
  fs.writeFileSync(path.join(dir, 'documents.raw.json'), JSON.stringify(raw, null, 2));
  stats[colPath] = { documents: readable.length };

  const docPaths = raw.map((d) => d.name.split('/documents/')[1]);
  const subs = await mapPool(docPaths, CONCURRENCY, async (p) => ({ p, ids: await listSubcollections(H, p) }));
  for (const { p, ids } of subs) {
    for (const id of ids) {
      stats[colPath].documents += 0;
      const childStats = {};
      await dumpCollection(H, `${p}/${id}`, path.join(dir, p.split('/').pop(), id), childStats);
      for (const [k, v] of Object.entries(childStats)) stats[k] = v;
    }
  }
  log(`  ${colPath}: ${readable.length} doc(s)${subs.some((s) => s.ids.length) ? ', subcollections found' : ''}`);
  return readable.length;
}

// ----------------------------------------------------------------------- auth
async function dumpAuth(H) {
  const users = [];
  let pageToken;
  let redacted = false;
  do {
    const r = await api('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT_ID + '/accounts:query', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ maxResults: 1000, returnUserInfo: true, ...(pageToken ? { pageToken } : {}) }),
    });
    for (const u of r.userInfo || []) {
      const hash = u.passwordHash ?? null;
      if (hash && Buffer.from(hash, 'base64').toString('utf8') === 'REDACTED') redacted = true;
      users.push({
        uid: u.localId,
        email: u.email ?? null,
        emailVerified: u.emailVerified ?? false,
        displayName: u.displayName ?? null,
        photoUrl: u.photoUrl ?? null,
        passwordHash: hash,
        passwordUpdatedAt: u.passwordUpdatedAt ?? null,
        providerData: (u.providerUserInfo || []).map((p) => ({
          providerId: p.providerId, federatedId: p.federatedId ?? null, email: p.email ?? null, displayName: p.displayName ?? null,
        })),
        validSince: u.validSince ?? null,
        disabled: u.disabled ?? false,
        createdAt: u.createdAt ?? null,
        lastLoginAt: u.lastLoginAt ?? null,
        customAttributes: u.customAttributes ?? null,
        raw: u,
      });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  fs.mkdirSync(path.join(OUT_DIR, 'auth'), { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'auth', 'users.json'), JSON.stringify({ users }, null, 2));
  log(`Auth: ${users.length} account(s)${redacted ? ' (password hashes returned as REDACTED by Google — see README)' : ''}`);
  return { count: users.length, passwordHashesRedacted: redacted };
}

// -------------------------------------------------------------------- storage
async function listBucket(H, bucket) {
  const items = [];
  let pageToken;
  do {
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?maxResults=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await api(url, { headers: H });
    for (const it of r.items || []) {
      items.push({ name: it.name, size: Number(it.size || 0), contentType: it.contentType || null, md5Hash: it.md5Hash || null, updated: it.updated || null });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return items;
}

async function downloadObject(H, bucket, obj) {
  const dest = path.join(OUT_DIR, 'storage', ...obj.name.split('/'));
  if (fs.existsSync(dest) && fs.statSync(dest).size === obj.size) return { name: obj.name, skipped: true, bytes: obj.size };
  const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(obj.name)}?alt=media`;
  try {
    const res = await apiRaw(url, H);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return { name: obj.name, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), contentType: obj.contentType };
  } catch (err) {
    FAILED.push({ step: 'download', path: obj.name, error: String(err.message).slice(0, 300) });
    return { name: obj.name, error: String(err.message).slice(0, 200) };
  }
}

async function apiRaw(url, H, attempts = 4) {
  let lastErr;
  for (let n = 0; n < attempts; n++) {
    try {
      const res = await fetch(url, { headers: H });
      if (res.ok) return res;
      const body = (await res.text()).slice(0, 300);
      const err = new Error(`HTTP ${res.status} ${res.statusText} :: ${body}`);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
      lastErr = err;
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1500 * (n + 1)));
  }
  throw lastErr;
}

// ----------------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log(`Backup directory: ${OUT_DIR}`);

  const access = await getAccessToken();
  const H = { Authorization: `Bearer ${access}` };
  const HDR = { ...H, 'Content-Type': 'application/json' };
  log('Access token ready (firebase login credentials)');

  const manifest = {
    project: PROJECT_ID,
    startedAt: new Date().toISOString(),
    tool: 'scripts/backup.mjs',
    firestore: { collections: {} },
    storage: {},
    referencedFiles: { total: 0, missing: [], byFolder: {} },
    failures: FAILED,
  };

  const roots = await listRootCollections(HDR);
  log(`Firestore: ${roots.length} root collection(s): ${roots.join(', ')}`);
  for (const c of roots) {
    await dumpCollection(HDR, c, path.join(OUT_DIR, 'firestore', c), manifest.firestore.collections);
  }

  manifest.auth = await dumpAuth(HDR);

  // importable Auth file (accounts:query redacts password hashes; auth:export does not)
  const authExportPath = path.join(OUT_DIR, 'auth', 'auth-export.json');
  const cliJs = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const exp = fs.existsSync(cliJs)
    ? spawnSync(process.execPath, [cliJs, 'auth:export', authExportPath, '--project', PROJECT_ID], { encoding: 'utf8' })
    : spawnSync('firebase', ['auth:export', authExportPath, '--project', PROJECT_ID], { encoding: 'utf8', shell: true });
  if (exp.status === 0 && fs.existsSync(authExportPath)) {
    const n = (JSON.parse(fs.readFileSync(authExportPath, 'utf8')).users || []).length;
    manifest.auth.importFile = 'auth/auth-export.json';
    manifest.auth.importFileCount = n;
    log(`Auth: firebase auth:export wrote ${n} account(s) (importable, with password hashes)`);
  } else {
    FAILED.push({ step: 'auth:export', error: String(exp.stderr || exp.error?.message || '').slice(0, 300) });
    log('Auth: firebase auth:export failed — users.json only');
  }

  // files referenced by documents
  const fsDir = path.join(OUT_DIR, 'firestore');
  const urls = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'documents.json') {
        const rel = path.relative(fsDir, path.dirname(p)) || '.';
        collectUrls(JSON.parse(fs.readFileSync(p, 'utf8')), rel, urls);
      }
    }
  })(fsDir);
  const referenced = new Map();
  for (const u of urls) {
    const name = objectNameFromUrl(u.url);
    if (!name) continue;
    if (!referenced.has(name)) referenced.set(name, []);
    referenced.get(name).push(u.source);
    const folder = name.split('/')[0];
    manifest.referencedFiles.byFolder[folder] = (manifest.referencedFiles.byFolder[folder] || 0) + 1;
  }
  manifest.referencedFiles.total = referenced.size;
  log(`Files referenced by documents: ${referenced.size} (${urls.length} URL(s) found)`);

  let bucket = null;
  let objects = [];
  for (const b of BUCKET_CANDIDATES) {
    try {
      objects = await listBucket(H, b);
      bucket = b;
      break;
    } catch (err) {
      log(`Bucket "${b}" unavailable: ${String(err.message).slice(0, 160)}`);
    }
  }
  if (!bucket) throw new Error('Could not list the Storage bucket');

  const results = await mapPool(objects, CONCURRENCY, (o) => downloadObject(H, bucket, o));
  const ok = results.filter((r) => !r.error);
  manifest.storage = {
    bucket,
    objects: objects.length,
    downloaded: ok.length,
    failed: results.filter((r) => r.error).map((r) => ({ name: r.name, error: r.error })),
    totalBytes: objects.reduce((s, o) => s + o.size, 0),
    files: ok.map((r) => ({ name: r.name, bytes: r.bytes ?? null, sha256: r.sha256 ?? null })),
  };
  log(`Storage: ${ok.length}/${objects.length} file(s), ${(manifest.storage.totalBytes / 1048576).toFixed(1)} MB`);

  const onDisk = new Set(objects.map((o) => o.name));
  manifest.referencedFiles.missing = [...referenced.keys()].filter((n) => !onDisk.has(n));
  manifest.referencedFiles.orphans = objects.filter((o) => !referenced.has(o.name)).map((o) => o.name);
  manifest.ok = manifest.referencedFiles.missing.length === 0 && FAILED.length === 0 && manifest.storage.failed.length === 0;
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  fs.writeFileSync(
    path.join(OUT_DIR, 'README.txt'),
    [
      `FIREBASE BACKUP — ${PROJECT_ID}`,
      `Created: ${manifest.startedAt}`,
      '',
      'CONTENTS',
      '  firestore/<collection>/documents.json    readable JSON: [{id, path, data}]',
      '  firestore/<collection>/documents.raw.json exact Firestore REST payloads',
      '  auth/users.json                          Firebase Auth accounts (password hashes REDACTED)',
      '  auth/auth-export.json                    Firebase Auth accounts, importable, WITH password hashes',
      '  storage/**                               every file in the Storage bucket (resumes, certificates, JDs)',
      '  manifest.json                            counts + SHA-256 of every file + missing/orphan report',
      '',
      'RESTORE',
      '  Firestore: each documents.raw.json entry is an exact Firestore REST Document resource —',
      '    replay it with POST ' + FIRESTORE + ':batchWrite',
      '    (or recreate the readable documents.json entries with the firebase-admin SDK).',
      '    Ask for scripts/restore-firestore.mjs if you want a ready-made restore script.',
      '  Auth: firebase auth:import auth/auth-export.json --project ' + PROJECT_ID,
      '    (restores accounts with existing passwords; users.json is human-readable but has',
      '     password hashes redacted by Google — see manifest.auth.passwordHashesRedacted)',
      '  Storage: gcloud storage rsync --recursive storage/ gs://' + (manifest.storage.bucket || '<bucket>'),
      '',
      'VERIFY: manifest.ok === true means every referenced file was downloaded with no API failures.',
    ].join('\r\n'),
  );

  // zip
  const zipPath = `${OUT_DIR}.zip`;
  const tar = spawnSync('tar', ['-a', '-cf', zipPath, '-C', path.dirname(OUT_DIR), path.basename(OUT_DIR)], { encoding: 'utf8' });
  if (tar.status === 0 && fs.existsSync(zipPath)) {
    log(`Archive: ${zipPath} (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`);
  } else {
    log(`Archive skipped (tar failed): ${(tar.stderr || '').slice(0, 200)}`);
  }

  log('--- summary ---');
  log(`collections : ${Object.entries(manifest.firestore.collections).map(([k, v]) => `${k}=${v.documents}`).join(', ')}`);
  log(`auth        : ${manifest.auth.count} account(s), hashes redacted=${manifest.auth.passwordHashesRedacted}`);
  log(`storage     : ${manifest.storage.downloaded}/${manifest.storage.objects} file(s) from ${manifest.storage.bucket}`);
  log(`missing refs: ${manifest.referencedFiles.missing.length}`);
  log(`orphans     : ${manifest.referencedFiles.orphans.length} (in bucket, referenced by no document)`);
  log(`failures    : ${FAILED.length + manifest.storage.failed.length}`);
  log(`OK          : ${manifest.ok}`);
  log(`manifest    : ${path.join(OUT_DIR, 'manifest.json')}`);
}

main().catch((err) => {
  console.error('BACKUP FAILED:', err);
  process.exit(1);
});
