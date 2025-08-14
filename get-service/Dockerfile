# --- Build Stage ---
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies for Prisma and build tools
RUN apk add --no-cache python3 make g++ openssl

COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:22-alpine AS production
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm install --only=production

# Copy Prisma binaries & build output
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

COPY .env .env

EXPOSE 4000
CMD ["node", "dist/index.js"]
