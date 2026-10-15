import { ACESFilmicToneMapping, PCFShadowMap, WebGPURenderer } from 'three/webgpu';

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches;

// WebGPU where the browser has it, WebGL 2 everywhere else. WebGPURenderer picks the
// backend on its own; `?webgl` forces the fallback so it can be checked on any machine.
export async function createRenderer(canvas: HTMLCanvasElement) {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL });
  await renderer.init();

  // Phones have 3x screens; rendering at 3x costs a lot and is hard to tell from 2x.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  return { renderer, backend };
}
