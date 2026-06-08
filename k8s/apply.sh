#!/usr/bin/env bash
# Deploy the minimal J26 ScoutID Keycloak to the J26 (dev) cluster (no ArgoCD yet).
#
#   KUBECONFIG=~/.kube/config.j26 ./k8s/apply.sh
#
# Idempotent: re-running re-applies manifests and re-creates the config-cli Job.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"   # repo root = j26-keycloak-scoutid/
NS=j26-keycloak-scoutid

SECRETS="$HERE/secrets.local.yaml"
if [ ! -f "$SECRETS" ]; then
  echo "ERROR: $SECRETS not found." >&2
  echo "  cp $HERE/secrets.example.yaml $SECRETS  and fill in real values, then re-run." >&2
  exit 1
fi

echo ">> namespace"
kubectl apply -f "$HERE/00-namespace.yaml"

echo ">> secrets (gitignored secrets.local.yaml)"
kubectl apply -f "$SECRETS"

echo ">> postgres + keycloak + Traefik ingressroutes + servicemonitor"
kubectl apply -f "$HERE/10-postgres.yaml"
kubectl apply -f "$HERE/20-keycloak.yaml"
kubectl apply -f "$HERE/30-ingressroute.yaml"
kubectl apply -f "$HERE/50-servicemonitor.yaml"

echo ">> (re)build keycloak-config ConfigMap from keycloak-config/*.yaml"
kubectl create configmap keycloak-config \
  --namespace "$NS" \
  --from-file="$REPO_ROOT/keycloak-config" \
  --dry-run=client -o yaml | kubectl apply -f -

echo ">> wait for keycloak to be ready before running config-cli"
kubectl rollout status deployment/keycloak -n "$NS" --timeout=300s

echo ">> ensure a permanent master-realm admin user (master stays stock; config-cli does NOT manage it)"
"$HERE/ensure-master-admin.sh"

echo ">> (re)run keycloak-config Job (creates/updates the jamboree26 realm)"
kubectl delete job keycloak-config -n "$NS" --ignore-not-found
kubectl apply -f "$HERE/40-config-cli.yaml"

echo ">> done. follow the config job with:"
echo "   kubectl logs -f job/keycloak-config -n $NS"
