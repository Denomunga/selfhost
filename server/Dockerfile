FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY web ../web
# The storefront's hero/story photos are served from /public.
COPY public /public
# Uploaded photos land in /data/uploads (compose) or /app/uploads (bare
# docker run) — both need to be writable by the unprivileged user.
RUN mkdir -p /data/uploads /app/uploads && chown -R node:node /app /data/uploads
USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
