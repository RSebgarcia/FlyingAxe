import { MeshStandardMaterial, type Texture } from 'three/webgpu';
import type { TextureSet } from './assets';

// Port of materials.gd. Generated meshes have UVs in metres, so tiling = 1 means one
// repeat of the texture per metre; imported meshes (the ground box) need it set by hand.
export function pbr(set: TextureSet, tiling: number, roughness = 1.0): MeshStandardMaterial {
  // Textures are cloned so two materials can tile the same image differently.
  const tile = (t: Texture) => {
    const c = t.clone();
    c.repeat.set(tiling, tiling);
    c.needsUpdate = true;
    return c;
  };
  return new MeshStandardMaterial({
    map: tile(set.color),
    normalMap: tile(set.normal),
    roughnessMap: tile(set.rough),
    roughness,
    metalness: 0,
  });
}
