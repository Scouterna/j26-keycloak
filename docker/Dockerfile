# syntax=docker/dockerfile:1
#
# J26 minimal ScoutID Keycloak image.
#
# Monorepo build: the minimal provider JAR is compiled here from ../provider
# (no external release artifact), then baked into an optimized Keycloak image.
# The ScoutID theme is the one genuinely shared resource — when J26 wants
# branding, uncomment the theme stage below to curl it from its release.
#
# Build context = repo root:
#   docker build -f docker/Dockerfile -t <registry>/j26-keycloak:<tag> .

ARG KEYCLOAK_TAG="26.5.6"
# ARG SCOUTID_THEME_VERSION="0.3.2"   # uncomment to add the shared theme

# --- stage 1: build the provider JAR from source (./provider) ---
FROM docker.io/library/maven:3.9-eclipse-temurin-21 AS provider-build
WORKDIR /build
COPY provider/ ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -B -DskipTests clean package

# --- (optional) stage: fetch the shared ScoutID theme JAR ---
# FROM registry.access.redhat.com/ubi9/ubi-minimal AS theme
# ARG SCOUTID_THEME_VERSION
# RUN curl -fsSL -o /theme.jar \
#   https://github.com/Scouterna/scoutid-keycloak-theme/releases/download/v${SCOUTID_THEME_VERSION}/keycloak-theme-for-kc-all-other-versions.jar

# --- stage 2: optimized Keycloak build ---
FROM quay.io/keycloak/keycloak:${KEYCLOAK_TAG} AS builder

ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_DB=postgres

WORKDIR /opt/keycloak

COPY --from=provider-build --chown=keycloak:keycloak --chmod=644 \
    /build/target/keycloak-scoutnet-authenticator-*.jar \
    /opt/keycloak/providers/keycloak-scoutnet-authenticator.jar
# COPY --from=theme --chown=keycloak:keycloak --chmod=644 /theme.jar /opt/keycloak/providers/keycloak-theme.jar

RUN /opt/keycloak/bin/kc.sh build

# --- stage 3: runtime ---
FROM quay.io/keycloak/keycloak:${KEYCLOAK_TAG}
COPY --from=builder /opt/keycloak/ /opt/keycloak/

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
