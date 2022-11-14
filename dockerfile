FROM node:latest
WORKDIR .
COPY . .
RUN npm install
CMD ["npm", "run server"]
