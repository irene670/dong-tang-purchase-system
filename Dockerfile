# --- Build Stage ---
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend assets
COPY --from=build /app/dist ./dist

# Copy backend server files
COPY --from=build /app/server ./server
COPY --from=build /app/netlify ./netlify
COPY --from=build /app/shared ./shared

EXPOSE 8080
CMD ["node", "server/server.mjs"]
