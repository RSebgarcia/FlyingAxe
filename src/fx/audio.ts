import type { Object3D, Vector3 } from 'three/webgpu';
import { Vector3 as V3, Quaternion } from 'three/webgpu';

// Sonido del golpe con Web Audio (sfx.gd + la parte de audio de juice.gd).
//
// Los crujidos son las grabaciones de Assets/sfx/WoodSplit; el rebote y la clavada siguen
// siendo los sintetizados de la demo, porque no hay grabación para esos dos. Si la
// carpeta de crujidos no carga, se cae al crujido sintetizado, como en Godot.

const RATE = 22050;

export const SOUND_DB = -6;
// AudioStreamPlayer3D.unit_size: hasta esta distancia suena a volumen pleno.
const UNIT_SIZE = 6;

/** El tono baja con la fuerza del golpe: un hachazo flojo suena más agudo y chiquito. */
export function pitchFor(force: number, random: () => number = Math.random): number {
  const base = Math.min(Math.max(1.28 - force * 0.3, 0.72), 1.35);
  return base * (0.96 + random() * 0.08);
}

/** Elige al azar pero nunca el mismo dos veces seguidas. */
export function pickNoRepeat(count: number, last: number, random: () => number = Math.random): number {
  if (count <= 1) return 0;
  let i = last;
  while (i === last) i = Math.floor(random() * count);
  return i;
}

// Ruido determinista para que los sintetizados suenen igual en cada carga.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const TAU = Math.PI * 2;

/** Crujido: la madera se raja en etapas, así que son varios chasquidos escalonados. */
export function synthCrack(): Float32Array {
  const n = Math.floor(RATE * 0.55);
  const out = new Float32Array(n);
  const r = rng(7411);
  const rajaduras = [0, 0.014, 0.033, 0.061, 0.098, 0.155];
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (const at of rajaduras) if (t >= at) s += r() * Math.exp(-(t - at) * 42);
    s += Math.sin(TAU * 78 * t) * Math.exp(-t * 14) * 0.7;
    s += Math.sin(TAU * 132 * t) * Math.exp(-t * 22) * 0.4;
    lp += (s - lp) * 0.42;
    out[i] = lp * 0.55;
  }
  return out;
}

/** Rebote de lomo: golpe sordo, sin astillado. */
export function synthThud(): Float32Array {
  const n = Math.floor(RATE * 0.25);
  const out = new Float32Array(n);
  const r = rng(991);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = Math.sin(TAU * 96 * t) * Math.exp(-t * 26);
    s += r() * Math.exp(-t * 90) * 0.5;
    lp += (s - lp) * 0.22;
    out[i] = lp * 0.6;
  }
  return out;
}

/** Clavada: mordida corta y seca, más aguda que el rebote. */
export function synthChunk(): Float32Array {
  const n = Math.floor(RATE * 0.3);
  const out = new Float32Array(n);
  const r = rng(3313);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = r() * Math.exp(-t * 60);
    s += Math.sin(TAU * 210 * t) * Math.exp(-t * 34) * 0.5;
    lp += (s - lp) * 0.55;
    out[i] = lp * 0.5;
  }
  return out;
}

export type SoundKind = 'crack' | 'thud' | 'chunk';

export class HitAudio {
  enabled = true;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cracks: AudioBuffer[] = [];
  private thud: AudioBuffer | null = null;
  private chunk: AudioBuffer | null = null;
  private lastCrack = -1;
  private pendingUrls: string[] = [];

  private tmpPos = new V3();
  private tmpQuat = new Quaternion();
  private tmpFwd = new V3();
  private tmpUp = new V3();

  constructor(private listener: Object3D) {}

  /**
   * Los navegadores no dejan sonar nada hasta que el jugador toca algo. Se arma el
   * contexto en el primer toque, clic o tecla, y ahí se decodifican los archivos.
   */
  attachUnlock(target: EventTarget = window): void {
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
      target.removeEventListener('pointerdown', unlock);
      target.removeEventListener('keydown', unlock);
      target.removeEventListener('touchend', unlock);
    };
    target.addEventListener('pointerdown', unlock);
    target.addEventListener('keydown', unlock);
    target.addEventListener('touchend', unlock);
  }

  /** URLs de los crujidos grabados. Se bajan ya y se decodifican al desbloquear. */
  setCrackUrls(urls: string[]): void {
    this.pendingUrls = urls;
    if (this.ctx) void this.loadCracks();
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = Math.pow(10, SOUND_DB / 20);
    this.master.connect(ctx.destination);
    this.thud = this.toBuffer(synthThud());
    this.chunk = this.toBuffer(synthChunk());
    void this.loadCracks();
  }

  private toBuffer(samples: Float32Array): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, samples.length, RATE);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  private async loadCracks(): Promise<void> {
    const ctx = this.ctx!;
    const urls = this.pendingUrls;
    const loaded = await Promise.all(
      urls.map(async (u) => {
        try {
          const res = await fetch(u);
          if (!res.ok) return null;
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      }),
    );
    const ok = loaded.filter((b): b is AudioBuffer => b !== null);
    this.cracks = ok.length > 0 ? ok : [this.toBuffer(synthCrack())];
  }

  play(kind: SoundKind, at: Vector3 | undefined, force: number): void {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    let buf: AudioBuffer | null = null;
    if (kind === 'crack') {
      if (this.cracks.length === 0) return;
      this.lastCrack = pickNoRepeat(this.cracks.length, this.lastCrack);
      buf = this.cracks[this.lastCrack];
    } else {
      buf = kind === 'thud' ? this.thud : this.chunk;
    }
    if (!buf) return;

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitchFor(force);

    if (at) {
      this.syncListener();
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = UNIT_SIZE;
      p.rolloffFactor = 1;
      p.positionX.value = at.x;
      p.positionY.value = at.y;
      p.positionZ.value = at.z;
      src.connect(p).connect(this.master);
    } else {
      src.connect(this.master);
    }
    src.start();
  }

  private syncListener(): void {
    const l = this.ctx!.listener;
    this.listener.getWorldPosition(this.tmpPos);
    this.listener.getWorldQuaternion(this.tmpQuat);
    this.tmpFwd.set(0, 0, -1).applyQuaternion(this.tmpQuat);
    this.tmpUp.set(0, 1, 0).applyQuaternion(this.tmpQuat);
    if (l.positionX) {
      l.positionX.value = this.tmpPos.x;
      l.positionY.value = this.tmpPos.y;
      l.positionZ.value = this.tmpPos.z;
      l.forwardX.value = this.tmpFwd.x;
      l.forwardY.value = this.tmpFwd.y;
      l.forwardZ.value = this.tmpFwd.z;
      l.upX.value = this.tmpUp.x;
      l.upY.value = this.tmpUp.y;
      l.upZ.value = this.tmpUp.z;
    } else {
      // Safari viejo.
      l.setPosition(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z);
      l.setOrientation(this.tmpFwd.x, this.tmpFwd.y, this.tmpFwd.z, this.tmpUp.x, this.tmpUp.y, this.tmpUp.z);
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
