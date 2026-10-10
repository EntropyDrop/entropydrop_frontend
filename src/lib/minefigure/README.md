# Minefigure generation core

These files are vendored from the local `minefigure` project's `shared`,
`web_model/src/mcModel`, and `web_sticker/src/sticker` working tree on 2026-10-08
(base revision `0a9b794f52d3c606e9e97a62085d2e86e351b644`). The original AGPL-3.0
license is retained in `LICENSE`. The frontend builds independently of the
sibling checkout.

The React integration is in `src/pages/figure/print`. It fixes Cute mode, the
0.5 alpha threshold, and Cute assembly defaults; it does not read Minefigure's
saved settings. Both the preview and STL use the same Manifold solids, while
the merged A4 sticker composer uses the same skin data and assembly settings.

Local adaptations:

- Removed the unused legacy `three-bvh-csg` subtraction path; the active solid
  builder uses `manifold-3d`.
- Kept only the page constants and image scaling used by the merged composer
  in `pageComposer.js`.
- Made the WASM URL import statically analyzable by Vite.
- Added TypeScript declarations at the sticker module boundary and explicit
  cleanup for the offscreen guide renderer.
- Uncovered voxel step walls, socket walls, and connectors use bare white.
  Skin colors stay on faces with corresponding stickers; assembly guides use
  the same white fallback, including transparent core texels.

No device clients, settings UI, 3MF exporter, or original standalone app UI are
included. Run `npm run test:figure` for the integration's geometry/export checks.
