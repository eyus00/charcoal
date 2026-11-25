# The server (Jelly). Build from the REPOSITORY ROOT so the workspace and shared packages are visible:
#   docker build -f apps/server/Dockerfile -t charcoal-server .
#   docker run -p 8080:8080 charcoal-server
# The same image runs on Railway, on a VPS, or on your own computer.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Install only the server's dependencies. Every workspace's package.json is copied so the lockfile
# matches; packages/ holds shared code (empty until the first shared package exists).
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/ packages/
RUN npm ci --workspace apps/server --include-workspace-root --omit=dev

# Optional: a Chromium for the browser runtime (providers that need page JavaScript).
#   docker build -f apps/server/Dockerfile --build-arg WITH_BROWSER=true -t charcoal-server:browser .
# then run with BROWSER_WORKER=local. See docs/platform/BROWSER.md. About 400 MB more.
ARG WITH_BROWSER=false
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN if [ "$WITH_BROWSER" = "true" ]; then npx playwright-core install --with-deps chromium && rm -rf /var/lib/apt/lists/*; fi

COPY apps/server/ apps/server/

ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
WORKDIR /app/apps/server
CMD ["npx", "tsx", "src/server.ts"]
