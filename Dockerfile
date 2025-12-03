# 1. BASE IMAGE: Use a lightweight, stable Node.js image based on Debian/Ubuntu
FROM node:20-slim

# 2. INSTALL SYSTEM DEPENDENCIES (The poppler-utils step!)
RUN apt-get update && \
    apt-get install -y poppler-utils && \
    rm -rf /var/lib/apt/lists/*

# 3. SET WORKING DIRECTORY & EXPOSE PORT
WORKDIR /usr/src/app
EXPOSE 3000

# 4. COPY & INSTALL NODE DEPENDENCIES
# Copy package.json and any lock files to leverage build cache
COPY package*.json ./
# If you use a lock file (highly recommended for production builds), use 'npm ci' instead of 'npm install'
RUN npm install

# 5. COPY APPLICATION CODE
COPY . .

# 6. PRODUCTION START COMMAND (Overridden by docker-compose for dev)
CMD [ "npm", "start" ]