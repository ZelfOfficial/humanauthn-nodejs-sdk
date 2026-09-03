# Development image for humanauthn-nodejs-sdk.
# Pins the latest Node.js (26.x, the Current release line) so Cloud Agents and
# CI develop against the same toolchain.
FROM node:26-bookworm-slim

# git and curl are expected by tooling and useful for a fully custom image;
# ca-certificates keeps HTTPS working; corepack enables modern package managers.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

USER node
