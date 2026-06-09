# syntax=docker/dockerfile:1
#
# J26 full ScoutID Keycloak image.
#
# The full Scoutnet authenticator provider JAR is pulled from the upstream
# release (Scouterna/scoutid-keycloak-provider v${SCOUTNET_PROVIDER_VERSION})
# instead of being compiled from a vendored ./provider copy. The login theme
# JAR is still built here from ./theme (a vendored copy of
# scoutid-keycloak-theme v0.3.2 — Keycloakify/Vite). Both are baked into an
# optimized Keycloak image. The theme is applied only to the jamboree26 realm
# (loginTheme: scoutid in keycloak-config); master stays themeless.
#
# Build context = repo root:
#   docker build -f docker/Dockerfile -t <registry>/j26-keycloak:<tag> .

ARG KEYCLOAK_TAG="26.5.6"
ARG SCOUTNET_PROVIDER_VERSION="0.13.0"

# --- stage 1: download the provider JAR from the upstream release ---
FROM docker.io/library/alpine:3 AS provider
ARG SCOUTNET_PROVIDER_VERSION
RUN apk add --no-cache curl
RUN curl -fsSL -o /keycloak-scoutnet-authenticator.jar \
    https://github.com/Scouterna/scoutid-keycloak-provider/releases/download/v${SCOUTNET_PROVIDER_VERSION}/keycloak-scoutnet-authenticator-${SCOUTNET_PROVIDER_VERSION}.jar

# --- stage 1b: build the login theme JAR (./theme) ---
# Keycloakify drives the build with Node (pnpm) and invokes Maven internally,
# so this stage needs both. Node 24 matches theme/.node-version (24.12); the
# JDK image provides Maven + Java 21 for the Keycloakify Maven step.
FROM docker.io/library/maven:3.9-eclipse-temurin-21 AS theme
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /theme
COPY theme/package.json theme/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile
COPY theme/ ./
# Produces dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar
# (the "all other versions" JAR works for KC 26.x — same artifact we used
# to download from the scoutid-keycloak-theme release).
RUN --mount=type=cache,target=/root/.m2 pnpm run build-keycloak-theme

# --- stage 2: optimized Keycloak build ---
FROM quay.io/keycloak/keycloak:${KEYCLOAK_TAG} AS builder

ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_DB=postgres
# Bake in per-user-event metrics (keycloak_logins / failed_login_attempts /
# registrations). This is a build-time feature, so it must be set before kc.sh
# build — it cannot be enabled at runtime under `start --optimized`. The runtime
# KC_EVENT_METRICS_USER_* vars live in k8s/20-keycloak.yaml.
ENV KC_FEATURES=user-event-metrics
ENV KC_EVENT_METRICS_USER_ENABLED=true

WORKDIR /opt/keycloak

COPY --from=provider --chown=keycloak:keycloak --chmod=644 \
    /keycloak-scoutnet-authenticator.jar \
    /opt/keycloak/providers/keycloak-scoutnet-authenticator.jar
COPY --from=theme --chown=keycloak:keycloak --chmod=644 \
    /theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar \
    /opt/keycloak/providers/keycloak-scoutid-theme.jar

RUN /opt/keycloak/bin/kc.sh build

# --- stage 3: runtime ---
FROM quay.io/keycloak/keycloak:${KEYCLOAK_TAG}
COPY --from=builder /opt/keycloak/ /opt/keycloak/

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
