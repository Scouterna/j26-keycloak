# Build strategy: J26 minimal ScoutID Keycloak (and the variant pattern)

**Status:** decided 2026-06-06. This document is both the J26 plan and the
reference pattern for other Scouterna projects that need a customized Scoutnet
authenticator.

## The problem

The "new" ScoutID is a Keycloak image assembled from three independently-released
parts (see `scoutid-keycloak`):

```
scoutid-keycloak-provider ──(GitHub Release + JAR asset)──┐
scoutid-keycloak-theme ─────(GitHub Release + JAR asset)──┤
                                                          ▼
                              scoutid-keycloak/docker/Dockerfile
                              (curls both JARs by version, kc.sh build, push ghcr)
                                                          ▼
                              scoutid-keycloak-infra → Azure App Service
```

J26 needs an **authentication-only** provider: same Scoutnet login, but it only
writes Keycloak's standard user fields + `scoutnet_member_no` (+ birthdate/locale).
It deliberately drops roles, groups, memberships, remember-me, and the cookie
authenticator — roughly −2,500 LOC vs. the full provider.

The full provider and the minimal one are expected to **diverge over time**: the
full provider is the experimental "test balloon" that grows features most users
don't need; minimal stays minimal. They are not converging branches of one thing.

## Decision

### 1. Repo-per-variant, NOT a maintained branch

Each customized provider lives in its **own repo**, never as a long-lived branch of
`scoutid-keycloak-provider`. Rationale:

- **release-please is per-repo / linear-on-default-branch.** The image Dockerfile
  pattern wants a versioned release asset; a branch can't produce clean ones.
- **A −2,500-LOC branch rebases forever** against an upstream that keeps growing.
- **"Which branch ships?" is tribal knowledge** we must not propagate to 2–4 projects.
- **Ephemeral projects (J26 ≈ 2 years) are cleanly deletable as repos**; dead
  branches in a shared repo linger.

### 2. J26 is a single monorepo: `j26-keycloak`

For a self-contained, single-variant, time-boxed project, collapse "provider repo +
image repo" into one. `j26-keycloak` holds:

```
j26-keycloak/
  provider/                  # Maven module → the minimal authenticator JAR
    pom.xml                  # groupId: se.j26.keycloak  (package stays se.scouterna.keycloak)
    src/main/java/se/scouterna/keycloak/...
    src/main/resources/META-INF/services/...
  docker/
    Dockerfile               # builds provider JAR in-repo + curls the SHARED theme, kc.sh build
  k8s/                       # homelab manifests (phase 1) → seeds ArgoCD app (phase 2)
  keycloak-config/           # keycloak-config-cli files (jamboree26 realm)
  BUILD_STRATEGY.md          # this file
```

One release cadence, one place to look. The provider JAR is built *inside* the image
build (no separate published release asset) because nothing else consumes it.

### 3. The theme stays shared and external

The image Dockerfile `curl`s the theme from `scoutid-keycloak-theme` releases by
version (`SCOUTID_THEME_VERSION`, currently `0.3.2`), exactly as `scoutid-keycloak`
does. The theme is the genuinely shared resource; we do not fork it.

> The theme (`themeName: scoutid`) is applied to the **jamboree26** realm via
> `loginTheme: scoutid` in `keycloak-config/01-realm.yaml`. The **master**/admin
> realm stays on the default Keycloak theme. Bump `SCOUTID_THEME_VERSION` in the
> Dockerfile to pick up new theme releases.

### 4. Naming

- **Maven groupId:** `se.j26.keycloak` — signals J26 ownership of the artifact.
- **Java package:** keep `se.scouterna.keycloak` (and the SPI descriptor). Renaming
  it is pure churn with no functional gain and would *increase* drift if a shared
  core is extracted later. groupId ≠ Java package, and that's fine.

## What we explicitly defer: the shared core

The genuinely-shared code (`ScoutnetClient`, `normalizePersonnummer`/`safeLogUsername`,
and the auth DTOs `AuthResponse`/`AuthResult`/`Member`/`ErrorResponse`) is currently
**copied** into J26, not shared. That is acceptable for one variant.

**Trigger to extract `scoutid-keycloak-provider-core` (a published lib JAR):** when a
*second* real variant exists. Extracting a shared library from two concrete consumers
is far safer than guessing the seam from one. At that point:

- core holds the Scoutnet-talking code; full + each variant depend on it by version;
- a Scoutnet API fix lands once in core and propagates by version bump (no cherry-picks);
- each variant repo keeps only its own authenticator + attribute-writing policy.

Until then: **2–4 small copies is cheaper than a premature abstraction.** Keeping the
Java package as `se.scouterna.keycloak` keeps this door open.

## Pattern summary for the next project

1. New repo `<project>-keycloak` (monorepo) or `<project>-keycloak-provider` (if the
   provider JAR must be independently consumable).
2. Copy the minimal provider; adjust the **attribute-writing policy** (the part that
   legitimately differs per project) and groupId.
3. Dockerfile: build the provider JAR + `curl` the shared theme → `kc.sh build` → push.
4. Deploy via the project's own k8s/ArgoCD.
5. If you're now the 2nd+ variant, raise extracting `scoutid-keycloak-provider-core`.

## J26 execution checklist (phase 1 → 2)

- [ ] Seed `j26-keycloak/provider/` from the tested minimal working tree
      (currently uncommitted in `scoutid-keycloak-provider`).
- [ ] Set pom groupId `se.j26.keycloak`; keep package `se.scouterna.keycloak`.
- [ ] Add `j26-keycloak/docker/Dockerfile` (build JAR in-repo; curl the shared
      scoutid theme; applied to jamboree26 via loginTheme).
- [ ] Move `deploy/homelab/*` → `j26-keycloak/k8s/`, and `keycloak-config/*` →
      `j26-keycloak/keycloak-config/` (already re-targeted to the jamboree26 realm).
- [ ] Revert `scoutid-keycloak-provider` working tree back to clean.
- [ ] Add `build-image` GitHub Action (mirror `scoutid-keycloak`), push to the chosen
      registry (homelab: `git.maws.se/hakan/keycloak-scoutid`; J26: TBD).
- [ ] Phase 2: ArgoCD app in `j26-infra` pointing at `j26-keycloak/k8s` against the
      J26 cluster (`~/.kube/config.j26`) with its own local Postgres.
```
