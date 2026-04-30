// passenger-startup.js
// This file is used by Phusion Passenger (cPanel Node.js App) to start the NestJS application.

const path = require('path');

// Point this to the compiled main.js file
const bootstrap = path.join(__dirname, 'dist', 'main.js');

require(bootstrap);
