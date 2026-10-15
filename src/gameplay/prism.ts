// Generador de prismas con UV, portado de prism.gd. Lo usan la leña y sus mitades.
//
// Devuelve mallas de DOS grupos:
//   0 = los lados curvos      -> corteza
//   1 = tapas y cara de corte -> madera cortada
//
// Las UV van EN METROS (u recorre el contorno, v la altura). Así la corteza mantiene la
// misma escala en la leña entera y en sus mitades, que miden distinto. Las texturas que
// se usen con esto necesitan RepeatWrapping.
//
// Diferencias con Godot, a propósito: los triángulos salen con el winding correcto (allá
// se apagaba el culling para no pelearse con eso) y las tapas y el corte llevan normales
// planas; la corteza va suavizada como hacía SurfaceTool.generate_normals.

export type Poly = Array<[number, number]>;

export interface PrismData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Rangos de vértices por material: 0 corteza, 1 madera cortada. */
  groups: Array<{ start: number; count: number; materialIndex: 0 | 1 }>;
}

/** Contorno circular completo, en el plano (x, z). */
export function fullPoly(r: number, segs: number): Poly {
  const p: Poly = [];
  for (let i = 0; i < segs; i++) {
    const a = (Math.PI * 2 * i) / segs;
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
}

/**
 * Medio disco. La cara plana queda sobre x = 0, que es el plano del corte: el hacha es
 * una cuña y sus cachetes miran a ±X, así que la madera se abre a lo largo de X.
 */
export function halfPoly(r: number, segs: number, dir: 1 | -1): Poly {
  const p: Poly = [];
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / segs;
    p.push([Math.cos(a) * r * dir, Math.sin(a) * r]);
  }
  return p;
}

/** Puntos para un convex hull que envuelva el prisma (x, y, z intercalados). */
export function hull(poly: Poly, h: number): Float32Array {
  const hy = h / 2;
  const out = new Float32Array(poly.length * 6);
  poly.forEach(([x, z], i) => {
    out.set([x, -hy, z, x, hy, z], i * 6);
  });
  return out;
}

/**
 * Extruye el contorno (x, z) a lo largo de Y, centrado en el origen.
 * flatLastEdge: el último tramo del contorno es la cara del corte (va con madera en vez
 * de corteza). Cierto para las mitades, falso para un cilindro entero.
 */
export function buildPrism(poly: Poly, h: number, flatLastEdge: boolean): PrismData {
  const hy = h / 2;
  const n = poly.length;
  const sideEdges = flatLastEdge ? n - 1 : n;
  const cx = poly.reduce((s, p) => s + p[0], 0) / n;
  const cz = poly.reduce((s, p) => s + p[1], 0) / n;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];

  // Triángulo con la normal mirando hacia `out` (vector aproximado hacia afuera).
  const tri = (
    a: number[], b: number[], c: number[],
    ua: number[], ub: number[], uc: number[],
    out: number[], normals?: [number[], number[], number[]],
  ) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = fn[0] * out[0] + fn[1] * out[1] + fn[2] * out[2] < 0;
    const len = Math.hypot(fn[0], fn[1], fn[2]) || 1;
    const flat = [fn[0] / len, fn[1] / len, fn[2] / len].map((v) => (flip ? -v : v));
    const verts = flip ? [a, c, b] : [a, b, c];
    const uvs = flip ? [ua, uc, ub] : [ua, ub, uc];
    const ns = normals ? (flip ? [normals[0], normals[2], normals[1]] : normals) : [flat, flat, flat];
    for (let i = 0; i < 3; i++) {
      pos.push(...verts[i]);
      uv.push(...uvs[i]);
      nor.push(...ns[i]);
    }
  };

  // Normal suave de corteza: radial desde el centro del contorno.
  const radial = (x: number, z: number) => {
    const dx = x - cx;
    const dz = z - cz;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, 0, dz / l];
  };

  const wall = (a: [number, number], b: [number, number], u0: number, u1: number, smooth: boolean) => {
    const a0 = [a[0], -hy, a[1]];
    const a1 = [a[0], hy, a[1]];
    const b0 = [b[0], -hy, b[1]];
    const b1 = [b[0], hy, b[1]];
    const out = [(a[0] + b[0]) / 2 - cx, 0, (a[1] + b[1]) / 2 - cz];
    const v1 = h;
    const na = smooth ? radial(a[0], a[1]) : undefined;
    const nb = smooth ? radial(b[0], b[1]) : undefined;
    tri(a0, b1, a1, [u0, 0], [u1, v1], [u0, v1], out, na && nb ? [na, nb, na] : undefined);
    tri(a0, b0, b1, [u0, 0], [u1, 0], [u1, v1], out, na && nb ? [na, na, nb] : undefined);
  };

  // --- grupo 0: corteza ---
  let run = 0;
  for (let i = 0; i < sideEdges; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    wall(a, b, run, run + seg, true);
    run += seg;
  }
  const barkCount = pos.length / 3;

  // --- grupo 1: tapas y, si la hay, la cara plana del corte ---
  for (let i = 1; i < n - 1; i++) {
    const [p0, p1, p2] = [poly[0], poly[i], poly[i + 1]];
    for (const y of [hy, -hy]) {
      tri([p0[0], y, p0[1]], [p1[0], y, p1[1]], [p2[0], y, p2[1]], p0, p1, p2, [0, y, 0]);
    }
  }
  if (flatLastEdge) {
    const a = poly[n - 1];
    const b = poly[0];
    wall(a, b, 0, Math.hypot(b[0] - a[0], b[1] - a[1]), false);
  }
  const total = pos.length / 3;

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uv),
    groups: [
      { start: 0, count: barkCount, materialIndex: 0 },
      { start: barkCount, count: total - barkCount, materialIndex: 1 },
    ],
  };
}
