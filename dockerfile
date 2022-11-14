FROM node:latest
WORKDIR .
COPY . .
RUN npm install
CMD ["node", "server.js"]