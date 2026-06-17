
FROM node:18-alpine AS development

WORKDIR /usr/src/app

# Chromium dla Puppeteera (eksport PDF). Nie pobieramy Chromium przez puppeteer — systemowy z apk.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
COPY prisma ./prisma/

RUN apk add --no-cache openssl chromium nss freetype harfbuzz ca-certificates ttf-freefont

RUN npm install

COPY . .

RUN npm run build
RUN npx prisma generate

CMD ["sh", "-c", "npx prisma db push && npm run start:prod"]
