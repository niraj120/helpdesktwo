#!/usr/bin/env bash
# BBP <-> Helpdesk integration test harness.
#
# Exercises every URL and API published in docs/BBP_LOGIN_INTEGRATION.md, plus
# the security cases from docs/BBP_HELPDESK_INTEGRATION_SPEC.md section 11.
#
# Usage:
#   BASE=http://localhost:3003 FRONTEND=http://localhost:5173 \
#   KEY=pub_xxx EMAIL=asha.verma@example.com MOBILE=9876543210 \
#   bash scripts/test-bbp-integration.sh
#
# Optional: TEST_EXPIRY=1 (adds a 125s wait), TEST_RATELIMIT=1 (burns 65 mints).
# Every case prints PASS/FAIL. Exit code is the number of failures.

set -uo pipefail

BASE="${BASE:-http://localhost:3003}"
FRONTEND="${FRONTEND:-http://localhost:5173}"
KEY="${KEY:?set KEY to the BBP pub_ API key}"
EMAIL="${EMAIL:?set EMAIL to a user that exists in the BBP project}"
MOBILE="${MOBILE:-}"
V1="$BASE/api/v1"
FAILS=0

# --- helpers ----------------------------------------------------------------
say()  { printf '\n== %s\n' "$1"; }
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s -- %s\n' "$1" "$2"; FAILS=$((FAILS+1)); }

NL=$'\n'

# post <url> <json> [extra curl args...] -> sets BODY and CODE
post() {
  local url="$1" data="$2"; shift 2
  local raw
  raw=$(curl -sS -m 20 -w "${NL}%{http_code}" -X POST "$url" \
        -H 'Content-Type: application/json' "$@" -d "$data")
  CODE="${raw##*$NL}"
  BODY="${raw%$NL*}"
}

# get <url> [extra curl args...]
get() {
  local url="$1"; shift
  local raw
  raw=$(curl -sS -m 20 -w "${NL}%{http_code}" "$url" "$@")
  CODE="${raw##*$NL}"
  BODY="${raw%$NL*}"
}

# expect <label> <wanted-status> [wanted-substring]
expect() {
  local label="$1" want="$2" sub="${3:-}"
  if [ "$CODE" != "$want" ]; then
    fail "$label" "status $CODE (want $want): $BODY"
    return
  fi
  if [ -n "$sub" ] && ! grep -q -- "$sub" <<<"$BODY"; then
    fail "$label" "missing '$sub' in: $BODY"
    return
  fi
  pass "$label"
}

# jsonval <key> <json>
jsonval() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" <<<"$2" | head -1; }

AUTH=(-H "X-API-Key: $KEY")

# --- 1. POST /api/v1/users --------------------------------------------------
say "1. POST /api/v1/users"
post "$V1/users" "{\"email\":\"$EMAIL\",\"mobile\":\"${MOBILE:-9876543210}\",\"firstName\":\"Asha\",\"lastName\":\"Verma\"}" "${AUTH[@]}"
expect "create/upsert BBP user" 201 '"user_id"'

post "$V1/users" '{}' "${AUTH[@]}"
expect "missing email rejected" 400

# validatePublicApiKey answers a MISSING key with 400 BAD_REQUEST and a
# WRONG key with 401 INVALID_API_KEY.
post "$V1/users" "{\"email\":\"$EMAIL\"}"
expect "no API key rejected" 400

# --- 2. GET /api/v1/users/lookup --------------------------------------------
say "2. GET /api/v1/users/lookup"
if [ -n "$MOBILE" ]; then
  get "$V1/users/lookup?mobile=$MOBILE" "${AUTH[@]}"
  expect "lookup by mobile" 200
fi
get "$V1/users/lookup?mobile=0000000000" "${AUTH[@]}"
expect "unknown mobile -> 404" 404

# --- 3. POST /api/v1/auth/login-url (happy paths) ---------------------------
say "3. POST /api/v1/auth/login-url"
post "$V1/auth/login-url" "{\"email\":\"$EMAIL\"}" "${AUTH[@]}"
expect "mint by email (default returnPath)" 200 '"login_url"'
TOKEN=$(jsonval token "$BODY")
LOGIN_URL=$(jsonval login_url "$BODY")
if [ -n "$TOKEN" ]; then pass "token returned"; else fail "token returned" "$BODY"; fi
if grep -q -- '/partner-login?token=' <<<"$LOGIN_URL"; then
  pass "login_url shape /<project>/partner-login?token="
else
  fail "login_url shape" "$LOGIN_URL"
fi
# The ticket must be opaque random bytes, not a JWT — a JWT signed with our own
# session secret is a bearer credential everywhere else on the API.
if grep -q -- '\.' <<<"$TOKEN"; then
  fail "ticket is opaque (not a JWT)" "token contains dots: ${TOKEN:0:24}..."
else
  pass "ticket is opaque (not a JWT)"
fi

for p in "/portal/service-requests?tab=new" /portal/service-requests /student/dashboard /student/submit-ticket /student/my-tickets /student/faq; do
  post "$V1/auth/login-url" "{\"email\":\"$EMAIL\",\"returnPath\":\"$p\"}" "${AUTH[@]}"
  expect "returnPath $p accepted" 200 '"login_url"'
done

if [ -n "$MOBILE" ]; then
  post "$V1/auth/login-url" "{\"mobile\":\"$MOBILE\"}" "${AUTH[@]}"
  expect "mint by 10-digit mobile" 200 '"login_url"'
  post "$V1/auth/login-url" "{\"mobile\":\"91$MOBILE\"}" "${AUTH[@]}"
  expect "mint by 91-prefixed mobile" 200 '"login_url"'
fi

# --- 4. login-url error and abuse cases -------------------------------------
say "4. login-url errors (spec section 11)"
post "$V1/auth/login-url" "{\"email\":\"$EMAIL\"}"
expect "no API key -> 400 BAD_REQUEST" 400

post "$V1/auth/login-url" "{\"email\":\"$EMAIL\"}" -H 'X-API-Key: pub_deadbeefdeadbeef'
expect "bad API key -> 401" 401

post "$V1/auth/login-url" '{}' "${AUTH[@]}"
expect "no email/mobile -> BAD_REQUEST" 400 'BAD_REQUEST'

post "$V1/auth/login-url" "{\"email\":\"nobody-$RANDOM@example.com\"}" "${AUTH[@]}"
expect "unknown user -> USER_NOT_FOUND" 404 'USER_NOT_FOUND'

for bad in 'https://evil.test' '//evil.test' '/student/../admin/dashboard' '/admin/dashboard' '/sr-settings' '/service-requests?tab=new' 'javascript:alert(1)'; do
  post "$V1/auth/login-url" "{\"email\":\"$EMAIL\",\"returnPath\":\"$bad\"}" "${AUTH[@]}"
  expect "returnPath '$bad' -> INVALID_RETURN_PATH" 400 'INVALID_RETURN_PATH'
done

# --- 5. POST /api/auth/handoff/redeem ---------------------------------------
say "5. POST /api/auth/handoff/redeem"
post "$V1/auth/login-url" "{\"email\":\"$EMAIL\",\"returnPath\":\"/portal/service-requests?tab=new\"}" "${AUTH[@]}"
TOKEN=$(jsonval token "$BODY")

post "$BASE/api/auth/handoff/redeem" "{\"token\":\"$TOKEN\"}"
expect "redeem -> session" 200 '"token"'
SESSION=$(jsonval token "$BODY")
# Staff hub is project-scoped, so this must come back WITH the project prefix.
if grep -q -- '"returnPath":"/bbp/portal/service-requests?tab=new"' <<<"$BODY"; then
  pass "returnPath resolved under the project prefix"
else
  fail "returnPath resolved under the project prefix" "$BODY"
fi

# Replay. Spec section 4.3 rule 4 requires single use.
post "$BASE/api/auth/handoff/redeem" "{\"token\":\"$TOKEN\"}"
if [ "$CODE" = "401" ]; then
  pass "replay rejected (single-use)"
else
  fail "replay rejected (single-use)" "2nd redeem returned $CODE - token is REPLAYABLE for its full TTL"
fi

post "$BASE/api/auth/handoff/redeem" '{"token":"totally-made-up-ticket"}'
expect "unknown ticket -> 401" 401

post "$BASE/api/auth/handoff/redeem" '{}'
expect "empty token -> 401" 401

post "$BASE/api/auth/handoff/redeem" "{\"token\":\"${TOKEN}x\"}"
expect "modified ticket -> 401" 401

# The URL-borne handoff token must NOT authenticate normal APIs.
post "$V1/auth/login-url" "{\"email\":\"$EMAIL\"}" "${AUTH[@]}"
HTOK=$(jsonval token "$BODY")
get "$BASE/api/auth/me" -H "Authorization: Bearer $HTOK"
if [ "$CODE" = "200" ]; then
  fail "handoff token rejected as session bearer" "GET /api/auth/me returned 200 - the token in the URL is a full API session"
else
  pass "handoff token rejected as session bearer ($CODE)"
fi

# The redeemed session token must work.
get "$BASE/api/auth/me" -H "Authorization: Bearer $SESSION"
expect "redeemed session works on /api/auth/me" 200

# --- 6. Expiry (opt-in) -----------------------------------------------------
if [ "${TEST_EXPIRY:-0}" = "1" ]; then
  say "6. Expiry (125s wait)"
  post "$V1/auth/login-url" "{\"email\":\"$EMAIL\"}" "${AUTH[@]}"
  EXPTOK=$(jsonval token "$BODY")
  sleep 125
  post "$BASE/api/auth/handoff/redeem" "{\"token\":\"$EXPTOK\"}"
  expect "expired token -> 401" 401
else
  say "6. Expiry - skipped (set TEST_EXPIRY=1)"
fi

# --- 7. Ticket APIs the portal depends on -----------------------------------
say "7. Ticket APIs"
get "$V1/tickets/form-schema" "${AUTH[@]}"
expect "form-schema" 200
get "$V1/tickets/count" "${AUTH[@]}"
expect "ticket count" 200
get "$V1/tickets/search?limit=1" "${AUTH[@]}"
expect "ticket search" 200

# --- 8. Rate limit (opt-in) -------------------------------------------------
if [ "${TEST_RATELIMIT:-0}" = "1" ]; then
  say "8. Rate limit - 65 mints in one minute"
  LAST=0
  for _ in $(seq 1 65); do
    post "$V1/auth/login-url" "{\"email\":\"$EMAIL\"}" "${AUTH[@]}"
    LAST="$CODE"
  done
  if [ "$LAST" = "429" ]; then pass "429 after 60/min"; else fail "429 after 60/min" "last status $LAST"; fi
else
  say "8. Rate limit - skipped (set TEST_RATELIMIT=1)"
fi

# --- 9. Frontend route and headers ------------------------------------------
say "9. Frontend route + headers"
get "$FRONTEND/bbp/partner-login"
expect "partner-login page served" 200

HDRS=$(curl -sSI -m 20 "$FRONTEND/bbp/partner-login")
if grep -qi 'referrer-policy: *no-referrer' <<<"$HDRS"; then
  pass "Referrer-Policy: no-referrer on handoff route"
else
  fail "Referrer-Policy: no-referrer" "$(grep -i referrer <<<"$HDRS" || echo 'header absent')"
fi
if grep -qi 'x-frame-options\|frame-ancestors' <<<"$HDRS"; then
  pass "framing policy present"
else
  fail "framing policy" "neither X-Frame-Options nor frame-ancestors set"
fi

say "Done - $FAILS failure(s)"
exit $FAILS
