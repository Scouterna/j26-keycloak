#!/usr/bin/env bash
# Create/ensure a PERMANENT admin user in the master realm, so admin login does
# not depend on the temporary KC_BOOTSTRAP_ADMIN. The master realm is otherwise
# left completely stock (config-cli does not manage it).
#
# Uses the bootstrap admin (from the keycloak-admin Secret) to authenticate, then
# upserts a permanent admin via the Keycloak admin API. The admin API + token
# endpoint for the master realm are served on the ADMIN hostname (KC_HOSTNAME_ADMIN).
set -euo pipefail

NS=j26-keycloak-scoutid
# Admin console / admin API live on the admin hostname.
KC_URL="${KC_URL:-https://admin.id.dev.j26.se}"

# Permanent admin to create. Sourced from the keycloak-admin Secret (MASTER_ADMIN_*,
# from secrets.local.yaml); override via env if desired. No password is hardcoded here.
ADMIN_USER="${MASTER_ADMIN_USER:-$(kubectl get secret keycloak-admin -n "$NS" -o jsonpath='{.data.MASTER_ADMIN_USERNAME}' | base64 -d)}"
ADMIN_PASS="${MASTER_ADMIN_PASS:-$(kubectl get secret keycloak-admin -n "$NS" -o jsonpath='{.data.MASTER_ADMIN_PASSWORD}' | base64 -d)}"
if [ -z "$ADMIN_USER" ] || [ -z "$ADMIN_PASS" ]; then
  echo "   ERROR: MASTER_ADMIN_USERNAME/PASSWORD not set (in env or the keycloak-admin Secret)"; exit 1
fi

BOOT_USER=$(kubectl get secret keycloak-admin -n "$NS" -o jsonpath='{.data.KC_BOOTSTRAP_ADMIN_USERNAME}' | base64 -d)
BOOT_PASS=$(kubectl get secret keycloak-admin -n "$NS" -o jsonpath='{.data.KC_BOOTSTRAP_ADMIN_PASSWORD}' | base64 -d)

echo "   getting bootstrap admin token..."
TOKEN=$(curl -s --max-time 20 -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "grant_type=password" \
  -d "username=$BOOT_USER" --data-urlencode "password=$BOOT_PASS" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

if [ -z "$TOKEN" ]; then echo "   ERROR: could not get bootstrap token"; exit 1; fi

# Does the permanent admin already exist?
EXISTING=$(curl -s --max-time 20 "$KC_URL/admin/realms/master/users?username=$ADMIN_USER&exact=true" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")

if [ -n "$EXISTING" ]; then
  echo "   admin user '$ADMIN_USER' already exists (id $EXISTING) — leaving as is."
  exit 0
fi

echo "   creating permanent admin user '$ADMIN_USER'..."
curl -s --max-time 20 -o /dev/null -w "   create user -> HTTP %{http_code}\n" \
  -X POST "$KC_URL/admin/realms/master/users" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"enabled\":true,\"credentials\":[{\"type\":\"password\",\"value\":\"$ADMIN_PASS\",\"temporary\":false}]}"

USER_ID=$(curl -s --max-time 20 "$KC_URL/admin/realms/master/users?username=$ADMIN_USER&exact=true" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")

# Grant the realm 'admin' role.
ROLE=$(curl -s --max-time 20 "$KC_URL/admin/realms/master/roles/admin" -H "Authorization: Bearer $TOKEN")
curl -s --max-time 20 -o /dev/null -w "   assign admin role -> HTTP %{http_code}\n" \
  -X POST "$KC_URL/admin/realms/master/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "[$ROLE]"

echo "   permanent master admin ready: $ADMIN_USER / $ADMIN_PASS"
