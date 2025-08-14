#This is build stage
FROM node:22 AS build

WORKDIR /app

COPY package*.json  ./
RUN npm install


COPY . .

RUN npm run build


#Serve it with Nginx
FROM nginx:stable-alpine AS SERVE

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d

COPY --from=build /app/dist  /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]