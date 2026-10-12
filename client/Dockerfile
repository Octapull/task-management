# syntax=docker/dockerfile:1

# ---- Derleme ----------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# package-lock.json ile birlikte: npm ci kilit dosyasına birebir uyar, böylece
# imaj her derlendiğinde aynı paket sürümleri kurulur.
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
# npm start (ng serve) değil: üretimde canlı sunucu yok, statik dosya üretiliyor.
RUN npm run build

# ---- Sunum ------------------------------------------------------------------
# Angular çıktısı düz HTML/JS; Node çalıştırmaya gerek yok, nginx yeterli.
FROM nginx:1.29-alpine AS final

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/task-management-ui/browser /usr/share/nginx/html

EXPOSE 80
