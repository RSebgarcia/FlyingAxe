// Clima y hora del día (ambience.gd :: CLIMAS), tal cual la demo.
//
// Los cielos se clasificaron midiendo su color medio, no a ojo: sky_76 es el más
// desaturado (0.17) y por eso es el nublado; sky_12 y sky_06 son los más saturados y por
// eso van de atardecer y crepúsculo; sky_98 el más oscuro y frío.
//
// elev/azim en grados. niebla 0 = sin niebla. Colores en sRGB. Las energías están en
// unidades de Godot; weather.ts las pasa a three.

export type Precip = 'nada' | 'lluvia' | 'nieve';
export type RGB = readonly [number, number, number];

export interface Clima {
  nombre: string;
  cielo: string;
  /** Exposición del panorama. El de noche es claro de por sí y sin esto sale de mediodía. */
  cieloEnergia?: number;
  elev: number;
  azim: number;
  luz: RGB;
  energia: number;
  ambiente: number;
  niebla: number;
  nieblaColor: RGB;
  precip: Precip;
  /** Densidad de niebla volumétrica y su respuesta al sol. Sin portar todavía (ver weather.ts). */
  volumetrica: number;
  rayosSol: number;
  rayos?: boolean;
}

export const CLIMAS: readonly Clima[] = [
  {
    nombre: 'Mañana clara', cielo: 'sky_83',
    elev: 42, azim: 35, luz: [1.0, 0.97, 0.9], energia: 1.25,
    ambiente: 0.55, niebla: 0.0, nieblaColor: [0.8, 0.85, 0.9],
    precip: 'nada', volumetrica: 0.018, rayosSol: 2.2,
  },
  {
    nombre: 'Mediodía', cielo: 'sky_83',
    elev: 68, azim: 15, luz: [1.0, 1.0, 0.98], energia: 1.45,
    ambiente: 0.6, niebla: 0.002, nieblaColor: [0.85, 0.9, 0.95],
    precip: 'nada', volumetrica: 0.006, rayosSol: 1.0,
  },
  {
    // El sol bajo es donde los rayos se lucen: atraviesan la escena en diagonal.
    nombre: 'Tarde dorada', cielo: 'sky_01',
    elev: 20, azim: 55, luz: [1.0, 0.86, 0.66], energia: 1.2,
    ambiente: 0.45, niebla: 0.006, nieblaColor: [0.92, 0.82, 0.66],
    precip: 'nada', volumetrica: 0.03, rayosSol: 3.2,
  },
  {
    nombre: 'Atardecer', cielo: 'sky_12',
    elev: 8, azim: 78, luz: [1.0, 0.68, 0.48], energia: 1.05,
    ambiente: 0.4, niebla: 0.012, nieblaColor: [0.9, 0.66, 0.56],
    precip: 'nada', volumetrica: 0.04, rayosSol: 3.6,
  },
  {
    nombre: 'Crepúsculo', cielo: 'sky_06',
    elev: 4, azim: 100, luz: [0.86, 0.66, 0.86], energia: 0.75,
    ambiente: 0.4, niebla: 0.02, nieblaColor: [0.62, 0.5, 0.7],
    precip: 'nada', volumetrica: 0.045, rayosSol: 3.0,
  },
  {
    nombre: 'Noche', cielo: 'sky_95', cieloEnergia: 0.28,
    elev: 52, azim: 200, luz: [0.55, 0.64, 0.95], energia: 0.3,
    ambiente: 0.14, niebla: 0.016, nieblaColor: [0.16, 0.2, 0.32],
    precip: 'nada', volumetrica: 0.02, rayosSol: 1.4,
  },
  {
    nombre: 'Niebla', cielo: 'sky_76',
    elev: 34, azim: 20, luz: [0.86, 0.88, 0.9], energia: 0.7,
    ambiente: 0.65, niebla: 0.055, nieblaColor: [0.76, 0.78, 0.8],
    precip: 'nada', volumetrica: 0.075, rayosSol: 3.8,
  },
  {
    nombre: 'Lluvia', cielo: 'sky_76',
    elev: 40, azim: 10, luz: [0.74, 0.78, 0.84], energia: 0.62,
    ambiente: 0.55, niebla: 0.03, nieblaColor: [0.62, 0.66, 0.7],
    precip: 'lluvia', volumetrica: 0.04, rayosSol: 1.2,
  },
  {
    nombre: 'Nieve', cielo: 'sky_98',
    elev: 30, azim: 300, luz: [0.82, 0.87, 1.0], energia: 0.7,
    ambiente: 0.7, niebla: 0.035, nieblaColor: [0.78, 0.82, 0.88],
    precip: 'nieve', volumetrica: 0.03, rayosSol: 0.8,
  },
  {
    nombre: 'Tormenta', cielo: 'sky_76', cieloEnergia: 0.55,
    elev: 38, azim: 5, luz: [0.6, 0.66, 0.78], energia: 0.45,
    ambiente: 0.4, niebla: 0.045, nieblaColor: [0.46, 0.5, 0.58],
    precip: 'lluvia', volumetrica: 0.05, rayosSol: 0.5,
    rayos: true,
  },
];

/** Dirección DESDE la que viene la luz (ambience.gd :: aplicar). */
export function sunDirection(elevDeg: number, azimDeg: number): [number, number, number] {
  const e = (elevDeg * Math.PI) / 180;
  const a = (azimDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

/**
 * Curva del relámpago: fogonazo, casi apagón y rebote, porque un rayo real no es un
 * solo destello. `flash` baja de 1 a 0.
 */
export function lightningCurve(flash: number): number {
  if (flash < 0.45) return flash * (1 + Math.sin(flash * 26) * 0.7);
  return flash;
}
