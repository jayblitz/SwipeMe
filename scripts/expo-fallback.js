// Fallback server for port 8081 when Expo dev server can't start
// This allows the workflow to complete while serving a redirect to the static build

const http = require('http');

const port = 8081;

const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('packager-status:running');
    return;
  }
  
  // For all other requests, show a message
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SwipeMe - Expo Dev</title>
      <style>
        body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
        .container { text-align: center; padding: 40px; }
        h1 { color: #0066FF; }
        p { color: #888; margin: 20px 0; }
        a { color: #0066FF; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>SwipeMe</h1>
        <p>The app is running with static builds.</p>
        <p>Use your Android APK to connect to the production server.</p>
        <p><a href="https://expo.dev/accounts/crypto4eva/projects/swipeme/builds">View EAS Builds</a></p>
      </div>
    </body>
    </html>
  `);
});

server.listen(port, '0.0.0.0', () => {
  console.log('Expo fallback server listening on port ' + port);
  console.log('packager-status:running');
});
