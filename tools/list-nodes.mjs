import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const walk = (n, d) => { console.log('  '.repeat(d) + n.getName(), 'T', n.getTranslation().map(v=>+v.toFixed(3)), 'R', n.getRotation().map(v=>+v.toFixed(3)), 'S', n.getScale().map(v=>+v.toFixed(3)), n.getMesh()?.getName() ?? ''); n.listChildren().forEach(c => walk(c, d+1)); };
root.getDefaultScene().listChildren().forEach(n => walk(n, 0));
for (const t of root.listTextures()) { const s=t.getSize(); console.log('tex', t.getName(), t.getMimeType(), s, (t.getImage().byteLength/1e6).toFixed(1)+'MB'); }
for (const m of root.listMaterials()) console.log('mat', m.getName(), m.getBaseColorFactor(), m.getRoughnessFactor(), m.getMetallicFactor());
for (const me of root.listMeshes()) for (const p of me.listPrimitives()) console.log('prim', me.getName(), p.getMaterial()?.getName());
