// Load every page of the built sprite atlas (node tools and tests).
//   const { frames, pixel } = loadAtlas(rootDir)
//   frames[name] -> { frame, anchor, page }; pixel(name, x, y) -> [r, g, b, a]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export function loadAtlasFrames(root) {
  const dir = path.join(root, 'public', 'assets');
  const { pages } = JSON.parse(fs.readFileSync(path.join(dir, 'atlas-index.json'), 'utf8'));
  const frames = {};
  pages.forEach((p, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, p.json), 'utf8'));
    for (const [name, f] of Object.entries(data.frames)) frames[name] = { ...f, page: i };
  });
  return { frames, pages, dir };
}

export function loadAtlas(root) {
  const { frames, pages, dir } = loadAtlasFrames(root);
  const images = pages.map((p) => PNG.sync.read(fs.readFileSync(path.join(dir, p.image))));
  const pixel = (name, x, y) => {
    const f = frames[name];
    const img = images[f.page];
    const i = ((f.frame.y + y) * img.width + f.frame.x + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  };
  return { frames, pixel };
}
