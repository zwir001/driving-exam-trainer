# Driving licence theory test trainer: builds the Angular app and serves it with resources/ via nginx.
#
# Build:  docker build -t driving-exam-trainer .
# Run:    docker run --rm -p 8000:80 driving-exam-trainer   ->  http://localhost:8000

FROM node:24-alpine AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/driving-exam-trainer/browser /usr/share/nginx/html
COPY resources /usr/share/nginx/resources
RUN rm -f /usr/share/nginx/resources/*/missing_media.txt
EXPOSE 80
