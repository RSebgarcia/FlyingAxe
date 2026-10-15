import { Color, SRGBColorSpace } from 'three/webgpu';

/** Los colores de la demo están escritos en sRGB, como los ve el editor de Godot. */
export function srgb(r: number, g: number, b: number): Color {
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}
