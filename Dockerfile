# Use the official Node.js 16 image as the base
FROM node:16

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the application source codes into the working directory
COPY . .

# Open the port on which the proxy runs (ensure this is the port your script uses)
EXPOSE 25566

# Start the application with `node .`
CMD [ "node", "." ]
