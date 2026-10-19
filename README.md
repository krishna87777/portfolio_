# portfolio_

Krishna Pandey's ML portfolio as a drivable 3D sky city, with a spacecraft race (Sky Race) against three AI ships named after optimizers.

- three.js (WebGL), no build step: open `index.html` through any static server.
- All sounds and music are synthesized live with the Web Audio API (no audio files).
- Desktop: WASD / arrows to drive, Enter to open an area, R for the race, Tab for the map.
- Phone: hold a finger where you want to go, tap a diamond to open it, pinch to zoom.

Edit your name, links and projects in `js/data.js`.

Run locally:

    python3 -m http.server 8766
    # open http://127.0.0.1:8766
