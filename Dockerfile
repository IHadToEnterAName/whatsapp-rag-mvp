# 1. BASE IMAGE: Use a lightweight, stable Node.js image based on Debian/Ubuntu
# 'slim' is recommended as it's smaller than the full image but still supports apt-get
FROM node:20-slim

# 2. INSTALL SYSTEM DEPENDENCIES (The poppler-utils step!)
# Update package list and install poppler-utils
# The '\\' character breaks the command across multiple lines for readability
RUN apt-get update && \
    apt-get install -y poppler-utils && \
    rm -rf /var/lib/apt/lists/*

# 3. SET WORKING DIRECTORY
WORKDIR /usr/src/app

# 4. COPY & INSTALL NODE DEPENDENCIES
# Copying package.json first allows Docker to cache the 'npm install' layer
# This speeds up subsequent builds if only your source code changes
COPY package*.json ./
RUN npm install

# 5. COPY APPLICATION CODE
# Copy the rest of the application source code
COPY . .

# 6. EXPOSE PORT
# Express typically runs on port 3000 or 8080 (match your Express config)
EXPOSE 3000

# 7. START COMMAND
# Define the command to run when the container starts
CMD [ "npm", "start" ]