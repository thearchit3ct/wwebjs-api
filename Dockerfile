# Use the official Node.js Debian image as the base image
FROM node:22-bookworm-slim AS base

ENV CHROME_BIN="/usr/bin/chromium" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    NODE_ENV="production"

WORKDIR /usr/src/app

FROM base AS deps

COPY package*.json ./

RUN npm ci --only=production --ignore-scripts

# Create the final stage
FROM base

# Install system dependencies and create wwebjs user
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    fonts-freefont-ttf \
    chromium \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    # Create wwebjs user and group with home directory
    groupadd -r wwebjs && \
    useradd -r -g wwebjs -m -d /home/wwebjs -s /bin/bash wwebjs && \
    # Give ownership of the working directory to wwebjs user
    chown -R wwebjs:wwebjs /usr/src/app

# Copy only production dependencies from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --chown=wwebjs:wwebjs . .

EXPOSE 3000

# Use wwebjs user for better security
USER wwebjs

CMD ["npm", "start"]
