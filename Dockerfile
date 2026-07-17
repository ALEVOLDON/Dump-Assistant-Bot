# --- Stage 1: Build the website ---
FROM node:22-alpine AS website-builder
WORKDIR /build/website
COPY website/package*.json ./
RUN npm ci
COPY website/ ./
RUN npm run build

# --- Stage 2: Main application ---
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY prompts ./prompts

# Copy the built website from stage 1
COPY --from=website-builder /build/website/dist ./website/dist

RUN mkdir -p data

ENV NODE_ENV=production

CMD ["node", "src/index.js"]