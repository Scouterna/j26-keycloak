# j26-keycloak-scoutid — Claude Code Context

This repo holds the declarative Keycloak realm configuration for J26. It is **config only** — no Dockerfile, no k8s manifests. The manifests live in the [j26-infra](https://github.com/Scouterna/j26-infra) repo, under `k8s/app-manifest-prod/j26-keycloak-scoutid/` (prod) and `k8s/app-manifest/j26-keycloak-scoutid/` (dev).

## Repo layout

```
keycloak-config/
  00-roles.yaml          # Custom realm roles (e.g. j26-photography)
  01-realm.yaml          # Realm settings, token lifetimes, user profile attributes
  02-authentication.yaml # Browser login flow (scoutnet-authenticator)
  03-scopes.yaml         # OIDC scopes
  04-clients.yaml        # Full client roster + client roles + service-account role assignments
```

Applied to Keycloak via [keycloak-config-cli](https://github.com/adorsys/keycloak-config-cli) (adorsys) as an ArgoCD Sync hook Job in j26-infra.

## Clients are config-as-truth

`04-clients.yaml` is the complete, authoritative list of J26 application clients.
keycloak-config-cli runs with its default managed mode, so client roles and other
managed sub-resources **not** present in the file are pruned on the next sync. Make
client/role changes in this file, not by hand in the admin console.

Two client shapes (decided from a code scan of the `j26-*` repos):

- **Confidential** (`j26-auth`, `j26-notifications`, `j26-group-import`) — authenticate
  *as* the client, need a secret via `$(env:...)`.
- **Role container** (`j26-platsbank`, `j26-signupinfo`, `j26-booking`,
  `j26-bracelet-checker`, `j26-screens`) — only *verify* JWTs; no secret, no flows,
  authorization services off. They exist so their client roles can be assigned via
  `resource_access.<client>.roles`. Don't list the auto-managed `uma_protection` role
  for these.

## Dev vs. production

The dev Keycloak environment keeps its existing, already-deployed config and is **not**
updated from this branch. This config targets **production** (`app.jamboree.se`); that
host appears only in the `j26-auth` URLs in `04-clients.yaml`, everything else is
host-agnostic. In j26-infra, prod and dev have separate manifest dirs
(`k8s/app-manifest-prod/` vs `k8s/app-manifest/`); the runbook below uses the prod paths.

---

## Adding a new OIDC client

### 1. Add the client to `keycloak-config/04-clients.yaml`

**Confidential service-account client** (e.g. a backend that reads Keycloak users/groups):

```yaml
clients:
  - clientId: j26-myapp
    name: j26-myapp
    description: "Service account for myapp backend"
    enabled: true
    publicClient: false
    standardFlowEnabled: false
    implicitFlowEnabled: false
    directAccessGrantsEnabled: false
    serviceAccountsEnabled: true
    secret: $(env:J26_MYAPP_CLIENT_SECRET)   # injected from KV secret at import time
    defaultClientScopes:
      - service_account
      - basic

# Service account role assignments go in the top-level users block, NOT inside clients:
users:
  - username: service-account-j26-myapp
    enabled: true
    serviceAccountClientId: j26-myapp
    clientRoles:
      realm-management:
        - query-groups
        - view-users
```

**Public browser client** (e.g. a frontend using OIDC login):

```yaml
clients:
  - clientId: j26-myapp
    name: My App
    enabled: true
    publicClient: true
    standardFlowEnabled: true
    directAccessGrantsEnabled: false
    redirectUris:
      - "https://myapp.j26.se/*"
    webOrigins:
      - "+"
    defaultClientScopes:
      - profile
      - email
```

> **Gotcha**: `users` is a top-level key, parallel to `clients`. Never nest it inside the `clients` list.

### 2. Provision the client secret in Key Vault (confidential clients only)

Name the secret `j26-dev-<appname>-keycloak-client-secret` (consistent naming — also used by the app itself):

```bash
az keyvault secret set \
  --vault-name kv-j26apps-shared-sdc \
  --name j26-dev-myapp-keycloak-client-secret \
  --value "<generated-secret>"
```

### 3. Expose the secret to keycloak-config-cli

> Paths below are inside the [j26-infra](https://github.com/Scouterna/j26-infra) repo.
> Manifest dir depends on environment: **prod** =
> `k8s/app-manifest-prod/j26-keycloak-scoutid/`, **dev** =
> `k8s/app-manifest/j26-keycloak-scoutid/`. The paths below use the prod dir;
> the dev environment is frozen and normally isn't touched.

In j26-infra, edit `k8s/app-manifest-prod/j26-keycloak-scoutid/15-secret-provider-class.yaml` — add to `secretObjects` and `objects`:

```yaml
secretObjects:
  - secretName: keycloak-client-secrets-csi
    type: Opaque
    data:
      - key: J26_MYAPP_CLIENT_SECRET
        objectName: j26-dev-myapp-keycloak-client-secret
...
objects: |
  array:
    - |
      objectName: j26-dev-myapp-keycloak-client-secret
      objectType: secret
```

In j26-infra, edit `k8s/app-manifest-prod/j26-keycloak-scoutid/40-config-cli.yaml` — add to `env`:

```yaml
- name: J26_MYAPP_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: keycloak-client-secrets-csi
      key: J26_MYAPP_CLIENT_SECRET
```

### 4. Expose the secret to the app

In the app's `secret-provider-class.yaml` in j26-infra, reference the same KV secret:

```yaml
- key: KC_CLIENT_SECRET          # or whatever env var the app reads
  objectName: j26-dev-myapp-keycloak-client-secret
```

### 5. Regenerate the ConfigMap

The generated ConfigMap is canonical **in this repo** at `k8s/45-keycloak-config-configmap.yaml`;
the j26-infra prod manifests consume/copy it. Run from the root of **this repo**:

```bash
kubectl create configmap keycloak-config \
  --namespace j26-keycloak-scoutid \
  --from-file=keycloak-config \
  --dry-run=client -o yaml \
  > k8s/45-keycloak-config-configmap.yaml
```

Then restore the header comment at the top of the file (the command overwrites it).

### 6. Test before committing (important!)

Apply the ConfigMap directly and run the Job manually to verify — don't wait for ArgoCD round trips to find syntax errors:

```bash
# Apply the updated ConfigMap immediately (in-repo canonical copy)
kubectl apply -f k8s/45-keycloak-config-configmap.yaml \
  --namespace j26-keycloak-scoutid

# Delete any existing job and run a fresh one
kubectl delete job keycloak-config -n j26-keycloak-scoutid --ignore-not-found
kubectl create job keycloak-config-test \
  --from=cronjob/keycloak-config \
  -n j26-keycloak-scoutid 2>/dev/null || \
kubectl patch application j26-keycloak-scoutid -n argocd \
  --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD","prune":true}}}' \
  --kubeconfig ~/.kube/config.j26
```

Actually, the simplest test approach is:

```bash
# 1. Apply ConfigMap directly (in-repo canonical copy)
KUBECONFIG=~/.kube/config.j26 kubectl apply \
  -f k8s/45-keycloak-config-configmap.yaml

# 2. Delete old job (ArgoCD hook: BeforeHookCreation handles this in prod)
KUBECONFIG=~/.kube/config.j26 kubectl delete job keycloak-config \
  -n j26-keycloak-scoutid --ignore-not-found

# 3. Trigger ArgoCD sync (runs the Job)
KUBECONFIG=~/.kube/config.j26 kubectl patch application j26-keycloak-scoutid \
  -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD","prune":true}}}'

# 4. Watch the logs
KUBECONFIG=~/.kube/config.j26 kubectl logs -f job/keycloak-config -n j26-keycloak-scoutid
```

A successful run ends with lines like:
```
Importing file 'file:/config/01-realm.yaml'
Importing file 'file:/config/02-authentication.yaml'
Importing file 'file:/config/03-scopes.yaml'
Importing file 'file:/config/04-clients.yaml'
keycloak-config-cli ran in 00:12.707.
```
No `ERROR` lines = success.

### 7. Commit and push

Commit changes in both repos:
- **This repo** (`j26-keycloak-scoutid`): the edited `keycloak-config/*.yaml` source(s)
  **and** the regenerated `k8s/45-keycloak-config-configmap.yaml` (keep them in sync).
- **j26-infra** (only when adding/changing a confidential client's secret wiring), under
  `k8s/app-manifest-prod/j26-keycloak-scoutid/`: `15-secret-provider-class.yaml`,
  `40-config-cli.yaml`, and the app's own `secret-provider-class.yaml`. The prod
  manifests consume this repo's `k8s/45-...` ConfigMap, so there is no separate copy of
  it to commit in j26-infra.

j26-infra requires a PR (branch protection).
