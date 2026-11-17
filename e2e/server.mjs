// Lokalna zamjena za Supabase u testu:
//   /rest/v1/*  -> pravi PostgREST nad pravim Postgresom (ista šema i pravila pristupa)
//   /auth/v1/*  -> jednostavna zamjena za Supabase Auth (izdaje JWT iste strukture)
//   /storage/v1/* -> zamjena za Supabase Storage: upis ide kroz ista pravila pristupa
//                   (storage.objects u bazi), fajl se čuva u memoriji
//   sve ostalo  -> izgrađena aplikacija (SPA)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const [, , DIST, SECRET] = process.argv;
const PORT = 54321;
const PGRST = { host: '127.0.0.1', port: 3001 };
const db = new pg.Pool({ host: '127.0.0.1', user: 'e2e', password: 'e2e', database: 'dp_test' });

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(claims);
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token || '').split('.');
  if (!s) return null;
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  if (sig !== s) return null;
  return JSON.parse(Buffer.from(b, 'base64url').toString());
}

const passwords = new Map(); // email -> lozinka
const refresh = new Map(); // refresh token -> user id

function userObj(row) {
  return {
    id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email,
    email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' },
    user_metadata: row.raw_user_meta_data || {}, created_at: new Date().toISOString(),
  };
}
function sessionFor(row) {
  const now = Math.floor(Date.now() / 1000);
  const rt = crypto.randomBytes(12).toString('hex');
  refresh.set(rt, row.id);
  return {
    access_token: jwt({ sub: row.id, role: 'authenticated', aud: 'authenticated', email: row.email, iat: now, exp: now + 3600 }),
    token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: rt, user: userObj(row),
  };
}
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
};
const fail = (res, code, error_code, msg) => send(res, code, { code, error_code, msg });

async function auth(req, res, url, body) {
  const p = url.pathname.replace('/auth/v1', '');
  const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');

  if (p === '/signup' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase();
    if ((body.password || '').length < 6) return fail(res, 422, 'weak_password', 'Password should be at least 6 characters.');
    const ex = await db.query('select 1 from auth.users where email=$1', [email]);
    if (ex.rowCount) return fail(res, 422, 'user_already_exists', 'User already registered');
    const r = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning *', [email, body.data || {}]);
    passwords.set(email, body.password);
    // "+confirm" u adresi oponaša uključenu potvrdu emaila: nalog postoji, sesije nema.
    if (email.includes('+confirm')) return send(res, 200, { ...userObj(r.rows[0]), email_confirmed_at: null, confirmation_sent_at: new Date().toISOString() });
    return send(res, 200, sessionFor(r.rows[0]));
  }
  if (p === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const email = String(body.email || '').toLowerCase();
      if (!passwords.has(email) || passwords.get(email) !== body.password) return fail(res, 400, 'invalid_credentials', 'Invalid login credentials');
      const r = await db.query('select * from auth.users where email=$1', [email]);
      return send(res, 200, sessionFor(r.rows[0]));
    }
    if (grant === 'refresh_token') {
      const id = refresh.get(body.refresh_token);
      if (!id) return fail(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      const r = await db.query('select * from auth.users where id=$1', [id]);
      return send(res, 200, sessionFor(r.rows[0]));
    }
  }
  if (p === '/logout') return send(res, 204);
  if (p === '/recover') return send(res, 200, {});
  if (p === '/user') {
    const claims = verify(bearer);
    if (!claims) return fail(res, 401, 'bad_jwt', 'invalid JWT');
    const r = await db.query('select * from auth.users where id=$1', [claims.sub]);
    if (req.method === 'PUT' && body.password) passwords.set(r.rows[0].email, body.password);
    return send(res, 200, userObj(r.rows[0]));
  }
  return fail(res, 404, 'not_found', 'not found');
}

const files = new Map(); // "bucket/putanja" -> { type, body }
const LIMIT = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function storage(req, res, url) {
  const up = url.pathname.match(/^\/storage\/v1\/object\/(?!public\/)([^/]+)\/(.+)$/);
  if (up && req.method === 'POST') {
    const claims = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!claims || claims.role !== 'authenticated') return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const type = String(req.headers['content-type'] || '').split(';')[0];
    if (!IMAGE_TYPES.includes(type)) return send(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
    if (body.length > LIMIT) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    const [bucket, name] = [up[1], decodeURIComponent(up[2])];
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [claims.sub]);
      const r = await c.query('insert into storage.objects (bucket_id, name, owner, owner_id) values ($1, $2, $3, $4) returning id', [bucket, name, claims.sub, claims.sub]);
      await c.query('commit');
      files.set(`${bucket}/${name}`, { type, body });
      return send(res, 200, { Id: r.rows[0].id, Key: `${bucket}/${name}` });
    } catch (e) {
      await c.query('rollback').catch(() => {});
      return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: String(e.message) });
    } finally {
      c.release();
    }
  }
  const pub = url.pathname.match(/^\/storage\/v1\/object\/public\/(.+)$/);
  if (pub && req.method === 'GET') {
    const f = files.get(decodeURIComponent(pub[1]));
    if (!f) return send(res, 404, { message: 'not found' });
    res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'max-age=31536000' });
    return res.end(f.body);
  }
  return send(res, 404, { message: 'not found' });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/rest/v1')) {
      const proxied = http.request({ ...PGRST, method: req.method, path: url.pathname.replace('/rest/v1', '') + url.search, headers: { ...req.headers, host: 'localhost' } }, (pr) => {
        res.writeHead(pr.statusCode, pr.headers);
        pr.pipe(res);
      });
      proxied.on('error', (e) => send(res, 502, { message: String(e) }));
      return req.pipe(proxied);
    }
    if (url.pathname.startsWith('/storage/v1')) return await storage(req, res, url);
    if (url.pathname.startsWith('/auth/v1')) {
      let raw = '';
      for await (const c of req) raw += c;
      return await auth(req, res, url, raw ? JSON.parse(raw) : {});
    }
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { message: String(e) });
  }
}).listen(PORT, () => console.log('ready', PORT));
