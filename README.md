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
| `keycloak-config/00-roles.yaml` | Custom realm roles (e.g. `j26-photography`). |
| `keycloak-config/01-realm.yaml` | The `jamboree26` realm: token/session lifetimes, login theme, i18n (sv/en), login behavior, user-profile attributes. |
| `keycloak-config/02-authentication.yaml` | Browser login flow — cookie re-authenticator falling back to the interactive Scoutnet authenticator. |
| `keycloak-config/03-scopes.yaml` | Client scopes, incl. `scoutnet_member_no` profile mapper and `scoutnet-memberships`. |
| `keycloak-config/04-clients.yaml` | Full client roster (config-as-truth): the J26 app clients, their client roles, and service-account role assignments. |
| `k8s/45-keycloak-config-configmap.yaml` | **Generated** ConfigMap embedding all `keycloak-config/*.yaml` files. Committed so deployment references a ready artifact — do not hand-edit. |

These configs were ported from upstream's `master`-realm example and renamed to
`jamboree26`, then customized for J26 (i18n, login behavior, two-execution browser
flow). They are a deliberate fork and will drift from upstream — that divergence is
what this repo tracks.

### Clients are config-as-truth

`04-clients.yaml` is the complete, authoritative list of J26 application clients.
keycloak-config-cli runs with its default managed mode, so client roles and other
managed sub-resources **not** present in the file are pruned on the next sync — keep
the file in step with reality, and make client changes here rather than by hand in the
admin console.

Clients are modeled from a code scan of the `j26-*` repos:

- **Confidential clients** (`j26-auth`, `j26-notifications`, `j26-group-import`)
  authenticate *as* the client and need a secret.
- **Role-container clients** (`j26-platsbank`, `j26-signupinfo`, `j26-booking`,
  `j26-bracelet-checker`, `j26-screens`) only *verify* JWTs. They carry no secret and
  no flows; they exist purely so their client roles can be assigned via
  `resource_access.<client>.roles`.

### Dev vs. production

The **dev** Keycloak environment keeps its own existing, already-deployed
configuration and is **not** updated from this branch's files. The config here targets
**production** (`app.jamboree.se`) — the host appears only in the `j26-auth` client URLs
in `04-clients.yaml`; everything else is host-agnostic.

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
[`j26-infra`](https://github.com/Scouterna/j26-infra), and ArgoCD reconciles them. Prod
and dev have separate manifest dirs there — prod in
`k8s/app-manifest-prod/j26-keycloak-scoutid/`, dev in
`k8s/app-manifest/j26-keycloak-scoutid/` — both consuming this repo's canonical
`k8s/45-keycloak-config-configmap.yaml`.

To ship a realm-config change:

1. Make the change here following [Editing the realm config](#editing-the-realm-config)
   above, and merge it (regenerated ConfigMap committed).
2. **Open a PR on `j26-infra`** that picks up the new
   `k8s/45-keycloak-config-configmap.yaml`. Once merged, ArgoCD applies it and the
   keycloak-config-cli Job reconciles the realm.

How `j26-infra` consumes the ConfigMap and how ArgoCD re-runs the config Job is
documented in that repo, not here.
