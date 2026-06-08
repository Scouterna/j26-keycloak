# syntax=docker/dockerfile:1
#
# J26 minimal ScoutID Keycloak image.
#
# Monorepo build: the minimal provider JAR is compiled here from ../provider
# (no external release artifact). The ScoutID theme is the one genuinely shared
# resource — it is curled from the scoutid-keycloak-theme release. Both are baked
# into an optimized Keycloak image. The theme is applied only to the jamboree26
# realm (loginTheme: scoutid in keycloak-config); master stays themeless.
#
# Build context = repo root:
#   docker build -f docker/Dockerfile -t <registry>/j26-keycloak:<tag> .

ARG KEYCLOAK_TAG="26.5.6"
ARG SCOUTID_THEME_VERSION="0.3.2"

# --- stage 1: build the provider JAR (./provider) and fetch the shared theme ---
FROM docker.io/library/maven:3.9-eclipse-temurin-21 AS build
ARG SCOUTID_THEME_VERSION
WORKDIR /build
COPY provider/ ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -B -DskipTests clean package
# Shared ScoutID theme (Keycloakify "all other versions" JAR works for KC 26.x).
RUN curl -fsSL -o /theme.jar \
    https://github.com/Scouterna/scoutid-keycloak-theme/releases/download/v${SCOUTID_THEME_VERSION}/keycloak-theme-for-kc-all-other-versions.jar

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

COPY --from=build --chown=keycloak:keycloak --chmod=644 \
    /build/target/keycloak-scoutnet-authenticator-*.jar \
    /opt/keycloak/providers/keycloak-scoutnet-authenticator.jar
COPY --from=build --chown=keycloak:keycloak --chmod=644 \
    /theme.jar /opt/keycloak/providers/keycloak-scoutid-theme.jar

RUN /opt/keycloak/bin/kc.sh build

# --- stage 3: runtime ---
FROM quay.io/keycloak/keycloak:${KEYCLOAK_TAG}
COPY --from=builder /opt/keycloak/ /opt/keycloak/

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
