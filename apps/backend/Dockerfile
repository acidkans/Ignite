
FROM node:18-alpine AS development

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN apk add --no-cache openssl

RUN npm install

COPY . .

RUN npm run build
RUN npx prisma generate

CMD ["sh", "-c", "npx prisma db push && npm run start:prod"]
