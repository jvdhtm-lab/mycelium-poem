FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/serve.mjs ./scripts/serve.mjs
COPY index.html ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
ENV MYCELIUM_DATA_FILE=/data/additions.json

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4173

CMD ["node", "scripts/serve.mjs"]
