# Stage 1: Build Angular production distribution
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production Nginx web server
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built Angular files from builder stage
COPY --from=build /app/dist/hackathon-website-frontend/browser ./

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

ENV PORT=8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
