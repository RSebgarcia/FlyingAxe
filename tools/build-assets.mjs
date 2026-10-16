// Rebuilds public/assets from the original Godot project.
//
//   node tools/build-assets.mjs "<path to the Godot 'Flying Axe' folder>"
//
// Needs the KTX-Software `ktx` CLI on PATH (https://github.com/KhronosGroup/KTX-Software).
// The outputs are committed, so CI and contributors never need to run this; it only
// has to run again when a source asset changes.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-assets.mjs "<Godot Flying Axe folder>"');
  process.exit(1);
}
const assets = join(src, 'Assets');
const out = 'public/assets';
const tmp = join(tmpdir(), 'flyingaxe-assets');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
for (const dir of ['models', 'textures', 'skies', 'sfx']) mkdirSync(join(out, dir), { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const gltfTransform = (args) => run('npx', ['gltf-transform', ...args]);
const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;

// --- models -----------------------------------------------------------------

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Axe.glb drags along a duplicate axe 10 m away and a stray Empty. Keep only `aXE`.
{
  const doc = await io.read(join(assets, 'Axe.glb'));
  const scene = doc.getRoot().getDefaultScene();
  for (const node of scene.listChildren()) {
    if (node.getName() !== 'aXE') node.dispose();
  }
  await doc.transform(prune());
  const cleaned = join(tmp, 'axe.glb');
  await io.write(cleaned, doc);
  const dest = join(out, 'models/axe.glb');
  gltfTransform(['optimize', cleaned, dest, '--compress', 'meshopt', '--texture-compress', 'ktx2',
    // The axe is ~250 px wide on a 1080p screen; 512 px textures are already more texels
    // than pixels, and they keep the mobile download budget (docs/perf-budget.md).
    '--texture-size', '512', '--simplify', 'false', '--join', 'false', '--instance', 'false']);
  console.log('axe.glb', kb(join(assets, 'Axe.glb')), '->', kb(dest));
}

// The scene is tiny; meshopt only. Node names (Piso-col, Tocon-col) are kept on purpose.
{
  const dest = join(out, 'models/escenario.glb');
  gltfTransform(['optimize', join(assets, 'Escenario.glb'), dest, '--compress', 'meshopt',
    '--simplify', 'false', '--join', 'false', '--flatten', 'false', '--instance', 'false',
    // Its materials have no textures, so the default prune would drop the UVs the game
    // needs to tile grass and wood on it.
    '--prune-attributes', 'false',
    '--palette', 'false']);
  console.log('escenario.glb', kb(dest));
}

// --- textures ---------------------------------------------------------------

// Color maps go to ETC1S (small, sRGB). Normal maps go to UASTC, since ETC1S blocks
// show up as faceting in lighting; RDO trades a little quality for a much smaller file. Roughness is linear data, ETC1S is fine.
async function ktx(input, dest, { size, kind }) {
  const png = join(tmp, basename(dest, '.ktx2') + '.png');
  await sharp(input).resize(size.w, size.h, { fit: 'fill' }).ensureAlpha(1).png().toFile(png);
  const common = ['create', '--generate-mipmap', '--zstd', '18'];
  const args =
    kind === 'normal'
      ? [...common, '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '1.5']
      : kind === 'linear'
        ? [...common, '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--clevel', '4', '--qlevel', '200']
        : [...common, '--format', 'R8G8B8A8_SRGB', '--encode', 'basis-lz', '--clevel', '4', '--qlevel', '200'];
  // --zstd only applies to UASTC; basis-lz is already supercompressed.
  if (kind !== 'normal') args.splice(args.indexOf('--zstd'), 2);
  run('ktx', [...args, png, dest]);
  console.log(basename(dest), kb(input), '->', kb(dest));
}

const tex = join(assets, 'textures');
for (const set of ['bark', 'grass', 'woodcut']) {
  const size = { w: 1024, h: 1024 };
  await ktx(join(tex, `${set}_color.png`), join(out, `textures/${set}_color.ktx2`), { size, kind: 'color' });
  await ktx(join(tex, `${set}_normal.png`), join(out, `textures/${set}_normal.ktx2`), { size, kind: 'normal' });
  await ktx(join(tex, `${set}_rough.png`), join(out, `textures/${set}_rough.ktx2`), { size, kind: 'linear' });
}

// Skies are equirectangular panoramas; they stay at 2048 x 1024.
for (const f of readdirSync(join(tex, 'skies')).filter((f) => f.endsWith('.png'))) {
  await ktx(join(tex, 'skies', f), join(out, 'skies', f.replace('.png', '.ktx2')), {
    size: { w: 2048, h: 1024 },
    kind: 'color',
  });
}

// --- audio ------------------------------------------------------------------

// Short mono 16-bit clips, ~130 KB each. WAV decodes everywhere (Safari included) with
// no codec surprises, which matters more than the bytes here.
const sfx = join(assets, 'sfx/WoodSplit');
const clips = readdirSync(sfx).filter((f) => f.endsWith('.wav')).sort();
clips.forEach((f, i) => copyFileSync(join(sfx, f), join(out, `sfx/split_${String(i + 1).padStart(2, '0')}.wav`)));
console.log(`${clips.length} split clips copied`);

rmSync(tmp, { recursive: true, force: true });
