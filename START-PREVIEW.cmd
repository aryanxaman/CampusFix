@echo off
cd /d "%~dp0"
echo CampusFix browser demo
echo Open http://127.0.0.1:4173/preview.html and choose Explore the demo.
echo Press Ctrl+C to stop the preview server.
node scripts\preview.mjs
pause
