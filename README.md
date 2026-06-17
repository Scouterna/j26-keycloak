# j26-keycloak-scoutid

Source of truth for the **`jamboree26` Keycloak realm** configuration used by ScoutID
login on the J26 cluster.

The runtime Keycloak image and login theme come from upstream
(`Scouterna/scoutid-keycloak-provider`, `Scouterna/scoutid-keycloak-theme`). This repo
owns only the realm *content* — the realm, authentication flows, client scopes, and
clients that make ScoutID/Scoutnet login work for Jamboree 2026.


## Layout

| Path | What it is |
|------|------------|
| `keycloak-config/01-realm.yaml` | The `jamboree26` realm: token/session lifetimes, login theme, i18n (sv/en), login behavior. |
| `keycloak-config/02-authentication.yaml` | Browser login flow — cookie re-authenticator falling back to the interactive Scoutnet authenticator. |
| `keycloak-config/03-scopes.yaml` | Client scopes, incl. `scoutnet_member_no` profile mapper and `scoutnet-memberships`. |
| `keycloak-config/04-clients.yaml` | Client config (account console, admin console scopes). |
| `k8s/45-keycloak-config-configmap.yaml` | **Generated** ConfigMap embedding all four files. Committed so deployment references a ready artifact — do not hand-edit. |

These configs were ported from upstream's `master`-realm example and renamed to
`jamboree26`, then customized for J26 (i18n, login behavior, two-execution browser
flow). They are a deliberate fork and will drift from upstream — that divergence is
what this repo tracks.

## Editing the realm config

1. Edit the relevant file(s) under `keycloak-config/`.
2. **Regenerate the ConfigMap** (the deployment uses the generated file, not the
   sources directly):

   ```bash
   kubectl create configmap keycloak-config \
     --namespace j26-keycloak-scoutid \
     --from-file=keycloak-config \
     --dry-run=client -o yaml \
     > k8s/45-keycloak-config-configmap.yaml
   ```

   Then restore the header comment at the top of the file (the command above
   overwrites it). The generated file is `apiVersion: v1 / kind: ConfigMap` with each
   `keycloak-config/*.yaml` embedded under `data:`.

3. Commit **both** the edited `keycloak-config/*.yaml` source and the regenerated
   `k8s/45-keycloak-config-configmap.yaml`. They must always be in sync — if they
   diverge, the cluster runs the ConfigMap, not your source edits.

> Forgetting step 2 is the classic mistake: the source files look right but the
> deployed config is stale because the ConfigMap wasn't regenerated.

## Deploying

This repo is **config source only** — it does not deploy to the cluster itself. The
cluster manifests (the keycloak-config-cli Job, ArgoCD application, etc.) live in
[`j26-infra`](https://github.com/Scouterna/j26-infra), and ArgoCD reconciles them.

To ship a realm-config change:

1. Make the change here following [Editing the realm config](#editing-the-realm-config)
   above, and merge it (regenerated ConfigMap committed).
2. **Open a PR on `j26-infra`** that picks up the new
   `k8s/45-keycloak-config-configmap.yaml`. Once merged, ArgoCD applies it and the
   keycloak-config-cli Job reconciles the realm.

How `j26-infra` consumes the ConfigMap and how ArgoCD re-runs the config Job is
documented in that repo, not here.
