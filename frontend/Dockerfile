FROM nginx:alpine

# Clean default nginx content
RUN rm -rf /usr/share/nginx/html/*

WORKDIR /usr/share/nginx/html

# Copy our SPA assets
COPY index.html .
COPY dashboard.html .
COPY app.js .
COPY style.css .

EXPOSE 80
