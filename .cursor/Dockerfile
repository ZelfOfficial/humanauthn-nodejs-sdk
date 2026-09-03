# Development image for humanauthn-nodejs-sdk.
# Pins the latest Node.js (26.x, the Current release line) via the official
# image so Cloud Agents and CI develop against the same toolchain. Using a clean
# node:26 base (no nvm) makes `node -v` unambiguously 26 for the agent and for
# terminals once the environment is built from this Dockerfile.
FROM node:26-bookworm-slim

# git and curl are expected by tooling and useful for a fully custom image;
# ca-certificates keeps HTTPS working; corepack enables modern package managers.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

USER node
