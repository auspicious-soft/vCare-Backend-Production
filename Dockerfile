# FROM node:18-bullseye-slim

# WORKDIR /app

# # Native dependencies required by modules like canvas/sharp during npm install.
# RUN apt-get update && apt-get install -y --no-install-recommends \
#   python3 \
#   make \
#   g++ \
#   pkg-config \
#   libcairo2-dev \
#   libpango1.0-dev \
#   libjpeg62-turbo-dev \
#   libgif-dev \
#   librsvg2-dev \
#   && rm -rf /var/lib/apt/lists/*

# COPY package*.json ./
# # RUN npm ci --no-audit --no-fund
# RUN npm ci --no-audit --no-fund --verbose
# COPY . .

# EXPOSE 8000

# CMD ["npm", "start"]


FROM node:20-bullseye-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg62-turbo-dev \
  libgif-dev \
  librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm cache clean --force

RUN npm install && ls -la node_modules/.bin

COPY . .

EXPOSE 8000

CMD ["npm", "start"]