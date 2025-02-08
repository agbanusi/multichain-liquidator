# Use a Node.js base image
FROM node:18

# Create and set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available) and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# (Optional) If using TypeScript, compile your code (ensure you have a build script)
# RUN npm run build

# Set the default command (adjust if your compiled code is in a dist/ directory or use ts-node)
CMD ["npm", "run", "liquidator"]
