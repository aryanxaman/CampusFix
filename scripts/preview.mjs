// A dependency-free UI preview. This does not emulate or replace the Java backend.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/main/webapp');
const port = Number(process.env.PORT || 4173);
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/' || pathname === '/preview.html') {
        let html = await fs.readFile(path.join(root, 'WEB-INF/views/shell.jsp'), 'utf8');
        html = html.replace(/<%@.*?%>\s*/g, '');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      if (!pathname.startsWith('/assets/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error:
              'Java backend is not running in the browser preview. Use Explore the demo, or deploy the WAR to Tomcat.',
          })
        );
        return;
      }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(`CampusFix UI preview: http://127.0.0.1:${port}/preview.html`)
  );
