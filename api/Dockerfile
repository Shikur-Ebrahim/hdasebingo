FROM node:22-alpine

# Install fonts for server-side flyer generation (Amharic / Ethiopic + sans-serif)
RUN apk add --no-cache \
    fontconfig \
    font-noto \
    font-noto-ethiopic \
    ttf-liberation \
    && fc-cache -fv

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3002

CMD ["node", "dist/index.js"]
