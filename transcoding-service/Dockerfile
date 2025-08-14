# --- Build Stage ---
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies for native modules & ffmpeg
RUN apk add --no-cache python3 make g++ ffmpeg

COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY .env .env

CMD ["node", "dist/index.js"]
