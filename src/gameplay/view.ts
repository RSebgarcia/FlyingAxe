// Puente sim -> three.js: dibuja la leña (entera, cargada, mitades y escombros) y mueve
// el modelo del hacha según los cuerpos de Rapier. No crea luces, cielo ni piso: eso es
// del escenario (paso 1) y del clima (paso 3).

import {
  BufferAttribute, BufferGeometry, Group, type Material, Mesh, MeshStandardMaterial,
  type Object3D, type Scene,
} from 'three';
import type { Half } from './woodLog';
import type { PrismData } from './prism';
import type { GameSim } from './sim';

export interface LogMaterials {
  /** Corteza: los lados curvos. UV en metros, necesita RepeatWrapping. */
  bark: Material;
  /** Madera cortada: tapas y cara del corte. */
  cut: Material;
}

export function prismGeometry(p: PrismData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p.positions, 3));
  g.setAttribute('normal', new BufferAttribute(p.normals, 3));
  g.setAttribute('uv', new BufferAttribute(p.uvs, 2));
  for (const gr of p.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.computeBoundingSphere();
  return g;
}

/** Materiales de reserva hasta que el paso 1 cargue las texturas de corteza y madera. */
export function fallbackLogMaterials(): LogMaterials {
  return {
    bark: new MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 }),
    cut: new MeshStandardMaterial({ color: 0xc89b62, roughness: 0.85 }),
  };
}

export class GameplayView {
  /** El hacha: su origen es el agarre. El modelo se cuelga adentro. */
  readonly axe = new Group();
  private readonly whole: Mesh;
  private carried: Mesh | null = null;
  private halfMeshes = new Map<Half, Mesh>();
  private version = -1;
  private readonly mats: Material[];

  constructor(
    private readonly sim: GameSim,
    private readonly scene: Scene,
    opts: { axeModel?: Object3D; materials?: LogMaterials } = {},
  ) {
    const m = opts.materials ?? fallbackLogMaterials();
    this.mats = [m.bark, m.cut];
    this.axe.name = 'Axe';
    if (opts.axeModel) this.setAxeModel(opts.axeModel);
    scene.add(this.axe);
    this.whole = new Mesh(new BufferGeometry(), this.mats);
    this.whole.name = 'Log';
    this.whole.castShadow = this.whole.receiveShadow = true;
    scene.add(this.whole);
    this.sync();
  }

  /**
   * El modelo del .glb (objeto "aXE") va escalado 0.09 y girado 180° en Y, como en
   * main.tscn: así el agarre cae en el origen y el filo hacia -Z local.
   */
  setAxeModel(model: Object3D): void {
    model.scale.setScalar(0.09);
    model.rotation.set(0, Math.PI, 0);
    model.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    this.axe.add(model);
  }

  sync(): void {
    const { axe, log } = this.sim;
    this.axe.position.copy(axe.position());
    this.axe.quaternion.copy(axe.rotation());

    if (this.version !== log.version) {
      this.version = log.version;
      this.whole.geometry.dispose();
      this.whole.geometry = prismGeometry(log.wholeMesh);
      this.dropCarried();
    }
    this.whole.position.copy(log.center());
    this.whole.visible = !log.isSplit && !log.carried;

    if (axe.carrying && !this.carried) {
      this.carried = new Mesh(this.whole.geometry, this.mats);
      this.carried.castShadow = true;
      this.carried.position.copy(axe.carriedLocal.pos);
      this.carried.quaternion.copy(axe.carriedLocal.rot);
      this.axe.add(this.carried);
    } else if (!axe.carrying) {
      this.dropCarried();
    }

    const live = new Set<Half>([...log.halves, ...log.debris]);
    for (const [h, mesh] of this.halfMeshes) {
      if (!live.has(h)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.halfMeshes.delete(h);
      }
    }
    for (const h of live) {
      let mesh = this.halfMeshes.get(h);
      if (!mesh) {
        mesh = new Mesh(prismGeometry(h.mesh), this.mats);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.halfMeshes.set(h, mesh);
      }
      const p = h.body.translation();
      const q = h.body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  private dropCarried(): void {
    if (!this.carried) return;
    this.axe.remove(this.carried);
    this.carried = null;
  }
}
