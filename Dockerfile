# ===== Stage 1: Build =====
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (use npm ci when lockfile is present, fallback to install)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# ===== Stage 2: Serve with Nginx =====
FROM nginx:alpine

# SPA-aware Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static build output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]