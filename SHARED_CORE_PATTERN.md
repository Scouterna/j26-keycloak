# Report: separate repo with a deliberate shared-core seam

**Audience:** anyone building a *customized* Scoutnet → Keycloak authenticator for a
Scouterna project (J26 and future ones). **Status:** recommended target pattern for
when there is more than one variant. Companion to [BUILD_STRATEGY.md](./BUILD_STRATEGY.md),
which describes what we do *today* (one variant → one repo, copy the shared code).

---

## 1. The problem this solves

The "new" ScoutID is built from independently-released parts: a **provider** JAR
(`scoutid-keycloak-provider`), a **theme** JAR (`scoutid-keycloak-theme`), and an
**image** repo that assembles them. Individual projects increasingly want their *own*
provider — J26 wants an auth-only minimal one; others will want different attribute
sets, claims, or flows.

Two naive answers both fail at scale:

- **A long-lived branch** of `scoutid-keycloak-provider` per project. Branches and
  per-repo release tooling (release-please) don't mix; a variant that deletes large
  parts of the full provider rebases forever; "which branch is deployed?" becomes
  tribal knowledge. Rejected.
- **A blind fork** per project. Clean releases, but the genuinely-shared code
  (the Scoutnet HTTP client, personnummer normalisation, the auth DTOs) is now
  **copied N times**. A Scoutnet API change must be hand-cherry-picked into every
  fork. With 2–4 variants this is a maintenance tax that grows with N.

## 2. The pattern: separate repos over a shared-core library

Keep **one repo per variant** (clean releases, unambiguous ownership, cheap to
retire when a project ends) — but pull the genuinely-shared code into a **single
published library** that every variant and the full provider depend on as an
ordinary Maven artifact.

```
        scoutid-keycloak-provider-core      ← published lib JAR (the seam)
        (Scoutnet HTTP client, DTOs, personnummer/pii helpers)
                    │  depended on by ↓
   ┌────────────────┼─────────────────────────────┐
   ▼                ▼                               ▼
scoutid-keycloak-   j26-keycloak(-provider)    <other>-keycloak(-provider)
provider (full)     (minimal, auth-only)       (next variant)
   │                │                               │
   └── each repo: its own authenticator + factory + ATTRIBUTE-WRITING POLICY,
       its own release cadence, its own image (curling the shared theme).
```

The key move is naming an explicit **seam**: the line between "Scoutnet-talking
plumbing that is identical everywhere" and "the policy that legitimately differs per
project." Everything above the seam is shared and versioned once; everything below it
is the few small classes a variant actually owns.

## 3. What goes where

**`...-provider-core` (shared, published, versioned):**
- `ScoutnetClient` — the HTTP calls to `/api/authenticate` and `/api/get/profile`
  (and more endpoints the full provider needs).
- `normalizePersonnummer` / `safeLogUsername` — input handling and PII-safe logging.
- The wire DTOs: `AuthResponse`, `AuthResult`, `Member`, `ErrorResponse`, and a
  superset `Profile` (variants read only the fields they need).
- Correlation-ID logging conventions.

**Each variant repo (owns, diverges freely):**
- Its `Authenticator` + `AuthenticatorFactory` (the flow shape).
- Its **attribute-writing policy** — *which* Keycloak fields/claims it sets from the
  profile. This is the real per-project difference (J26: firstName/lastName/email +
  member_no; the full provider: roles, groups, memberships, remember-me, …).
- Its `META-INF/services` SPI descriptor, image Dockerfile, and deploy config.

A useful litmus test: **if a Scoutnet API change would force an edit, it belongs in
core. If a product requirement would force an edit, it belongs in the variant.**

## 4. When to adopt it (the trigger)

**Do not extract core for the first variant.** With one consumer you are guessing the
seam, and a wrong guess is worse than a copy. The honest, cheap thing for variant #1
is to copy the shared code (this is what J26 does today; see BUILD_STRATEGY.md).

**Extract `...-provider-core` when the *second* real variant appears.** Two concrete
consumers let you triangulate the seam from evidence instead of speculation. The
extraction is a non-breaking refactor behind a new Maven coordinate:

1. Move the shared classes into a new `scoutid-keycloak-provider-core` repo; give it
   release-please + a published JAR (GitHub Packages, like the existing provider).
2. Repoint the full provider and the existing variant at the `core` dependency,
   deleting their copies. Behaviour is unchanged; only the source location moves.
3. The next variant starts by depending on `core` and writing only its authenticator
   + attribute policy.

To keep this door cheap, variants should **keep the Java package `se.scouterna.keycloak`**
even when their Maven groupId reflects project ownership (e.g. `se.j26.keycloak`).
A shared package across variants makes the eventual extraction a move, not a rename.

## 5. Trade-offs (stated honestly)

- **Cost:** one more repo and release stream (`core`), and a version bump in each
  consumer when core changes. This is the price of *not* cherry-picking fixes N times.
- **Coupling:** all variants now share core's release cadence for plumbing. That is a
  feature for Scoutnet-API fixes (land once, everyone upgrades) and a non-issue for
  product differences (those live in the variants, decoupled).
- **Versioning discipline:** core must treat its public surface (client + DTOs) as an
  API. In practice it already is — it is the Scoutnet contract.
- **Not free for N=1.** The whole point of the trigger in §4 is to avoid paying this
  before there is a second consumer to justify it.

## 6. One-line summary

*Repos per variant for clean, retireable releases; a single published `core` library
for the Scoutnet plumbing they all share; the seam between them is "API change → core,
product change → variant"; extract core when variant #2 arrives, not before.*
