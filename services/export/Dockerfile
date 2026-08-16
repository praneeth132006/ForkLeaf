FROM node:18-alpine

# Install Pandoc and TeX Live for PDF export
RUN apk add --no-cache \
    pandoc \
    texlive-xetex \
    texlive-luatex \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Compile TypeScript
RUN pnpm exec tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
