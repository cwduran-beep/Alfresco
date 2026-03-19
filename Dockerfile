FROM node:20-alpine

RUN apk add --no-cache curl bash tailscale

WORKDIR /app
COPY package.json ./
RUN npm install
COPY proxy.js ./
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 10000
CMD ["./start.sh"]
