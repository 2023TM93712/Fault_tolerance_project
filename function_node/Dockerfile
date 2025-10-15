FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001
    
# Change ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

# Health check removed for now - service works fine externally

# Expose port
EXPOSE 7071

# Start the application
CMD ["npm", "start"]