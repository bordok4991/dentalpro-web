#!/bin/bash
# Lokalno testno okruženje: Postgres + šema iz db/ + PostgREST + zamjena za Supabase Auth + izgrađena aplikacija.
# Potrebno: lokalni Postgres 16 (korisnik postgres), PostgREST (PGRST_BIN), Node, a za flow.cjs i Playwright s Chromiumom.
# Pokretanje:  PGRST_BIN=/putanja/postgrest ./e2e/up.sh  &&  node e2e/flow.cjs
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$HERE")"
PGRST_BIN="${PGRST_BIN:-postgrest}"
SECRET="e2e-lokalna-tajna-samo-za-test-0123456789abcdef"
pkill -f "PGRST_E2E=1" 2>/dev/null || true; pkill -f "$PGRST_BIN" 2>/dev/null || true; pkill -f "e2e/server.mjs" 2>/dev/null || true
pg_lsclusters | grep -q online || pg_ctlcluster 16 main start
for i in $(seq 1 20); do pg_isready -q && break; sleep 0.3; done
su postgres -c "psql -q -c 'drop database if exists dp_test' -c 'create database dp_test'" 2>&1 | grep -v NOTICE || true
su postgres -c "psql -q -d dp_test" <<'SQL' 2>&1 | grep -v NOTICE || true
do $$ begin create role authenticator login password 'authpw' noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role e2e login superuser password 'e2e'; exception when duplicate_object then null; end $$;
SQL
for f in "$HERE/shim.sql" "$ROOT"/db/*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -d dp_test" < "$f" 2>&1 | grep -v NOTICE || true; done
su postgres -c "psql -q -d dp_test -c 'grant anon, authenticated to authenticator'"
PGRST_DB_URI="postgres://authenticator:authpw@127.0.0.1:5432/dp_test" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3001 PGRST_LOG_LEVEL=warn nohup "$PGRST_BIN" > "$HERE/.pgrst.log" 2>&1 &
ANON=$(node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'anon',iat:1,exp:4102444800});console.log(h+'.'+p+'.'+c.createHmac('sha256','$SECRET').update(h+'.'+p).digest('base64url'))")
cd "$ROOT"
printf 'VITE_SUPABASE_URL=http://localhost:54321\nVITE_SUPABASE_KEY=%s\n' "$ANON" > .env.e2e.local
npx vite build --mode e2e --outDir "$HERE/.dist" --emptyOutDir > "$HERE/.build.log" 2>&1
rm -f .env.e2e.local
cd "$HERE" && [ -d node_modules/pg ] || npm install --silent
nohup node server.mjs "$HERE/.dist" "$SECRET" > "$HERE/.server.log" 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:54321/ && curl -s -o /dev/null http://127.0.0.1:3001/ && break; sleep 0.3; done
echo "aplikacija: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:54321/login)"
