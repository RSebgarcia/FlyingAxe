import { RepeatWrapping, type Texture, type WebGPURenderer } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// All game assets are built by tools/build-assets.mjs: KTX2 (Basis) textures and
// meshopt-compressed glTF. Paths are relative so the build works under any base URL.
const BASE = import.meta.env.BASE_URL;
export const assetUrl = (path: string) => `${BASE}assets/${path}`;

export type TextureSet = { color: Texture; normal: Texture; rough: Texture };

export class Assets {
  readonly ktx2: KTX2Loader;
  readonly gltf: GLTFLoader;

  constructor(renderer: WebGPURenderer) {
    this.ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}basis/`).detectSupport(renderer);
    this.gltf = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
  }

  model(name: string): Promise<GLTF> {
    return this.gltf.loadAsync(assetUrl(`models/${name}.glb`));
  }

  async texture(path: string): Promise<Texture> {
    const tex = await this.ktx2.loadAsync(assetUrl(path));
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  async textureSet(base: 'bark' | 'grass' | 'woodcut'): Promise<TextureSet> {
    const [color, normal, rough] = await Promise.all([
      this.texture(`textures/${base}_color.ktx2`),
      this.texture(`textures/${base}_normal.ktx2`),
      this.texture(`textures/${base}_rough.ktx2`),
    ]);
    return { color, normal, rough };
  }

  sky(name: string): Promise<Texture> {
    return this.ktx2.loadAsync(assetUrl(`skies/${name}.ktx2`));
  }
}
