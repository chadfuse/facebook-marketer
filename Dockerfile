# Use official Playwright image which includes all required Linux dependencies for Chromium
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
