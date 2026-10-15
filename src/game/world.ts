import {
  Box3,
  CylinderGeometry,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  type Object3D,
} from 'three/webgpu';
import { AMBIENT_INTENSITY, AXE_HOME, AXE_MODEL_SCALE, CAMERA, SUN } from '../config';
import type { Assets } from '../render/assets';
import { pbr } from '../render/materials';
import { SkyDome } from '../render/sky';
import { isTouchDevice } from '../render/renderer';

// Node names the Blender scene must keep. The `-col` suffix is Godot's convention for
// "also make a static collider"; here physics/static.ts reads the same suffix.
const GROUND_NODE = 'Piso-col';
const STUMP_NODE = 'Tocon-col';

export type World = {
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  sky: SkyDome;
  ground: Object3D;
  stump: Object3D;
  stumpTop: number;
  axe: Group;
  log: Mesh;
};

function requireNode(root: Object3D, name: string, consequence: string): Object3D {
  const node = root.getObjectByName(name);
  // Fail loudly. In the demo a renamed node didn't crash, it just silently lost its
  // texture or its collider, which took longer to notice than an error would.
  if (!node) throw new Error(`escenario.glb has no '${name}': ${consequence}`);
  return node;
}

export async function buildWorld(assets: Assets): Promise<World> {
  const scene = new Scene();

  const camera = new PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.05, 400);
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.lookAt);

  const [escenario, axeGltf, sky, grass, woodcut, bark] = await Promise.all([
    assets.model('escenario'),
    assets.model('axe'),
    assets.sky('sky_01'),
    assets.textureSet('grass'),
    assets.textureSet('woodcut'),
    assets.textureSet('bark'),
  ]);

  // Sky. The same panorama is the background and the image-based ambient light.
  sky.mapping = EquirectangularReflectionMapping;
  const skyDome = new SkyDome(sky);
  scene.add(skyDome);
  scene.environment = sky;
  scene.environmentIntensity = AMBIENT_INTENSITY;

  const sun = new DirectionalLight(0xffffff, SUN.intensity);
  sun.position.set(...SUN.position);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const shadowSize = isTouchDevice() ? 2048 : 4096;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  // The play area is about 3 x 3 m around the stump; a tight frustum keeps texels small.
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Scene: ground and stump from Blender, dressed with the demo's textures.
  const stage = escenario.scene;
  const ground = requireNode(stage, GROUND_NODE, 'the ground has no grass and no collider');
  const stump = requireNode(stage, STUMP_NODE, 'the log does not know where to sit');
  const grassMat = pbr(grass, 45);
  const woodMat = pbr(woodcut, 2);
  stage.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.receiveShadow = true;
    o.castShadow = o !== ground && !ground.children.includes(o);
  });
  ground.traverse((o) => o instanceof Mesh && (o.material = grassMat));
  // The stump has a single surface, so bark on the side and wood on top isn't possible
  // yet. Cut wood wins: the top is where the axe lands and where the eye goes.
  stump.traverse((o) => o instanceof Mesh && (o.material = woodMat));
  scene.add(stage);

  // Measured, not hard-coded: re-export the stump at another height and the log follows.
  stage.updateMatrixWorld(true);
  const stumpTop = new Box3().setFromObject(stump).max.y;

  // Axe. The body origin is the grip point at the base of the handle.
  const axe = new Group();
  axe.name = 'Axe';
  const model = axeGltf.scene;
  model.scale.set(...AXE_MODEL_SCALE);
  model.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = o.receiveShadow = true;
  });
  axe.add(model);
  axe.position.set(...AXE_HOME.position);
  axe.rotation.x = AXE_HOME.rotationX;
  scene.add(axe);

  // Placeholder log, the same cylinder as main.tscn. Step 2 replaces it with the
  // generated prism (prism.gd) that has bark on the side and cut wood on the caps.
  const logHeight = 0.4;
  const log = new Mesh(new CylinderGeometry(0.16, 0.16, logHeight, 20), [
    pbr(bark, 1),
    pbr(woodcut, 1),
    pbr(woodcut, 1),
  ]);
  log.name = 'Log';
  log.position.set(0, stumpTop + logHeight / 2, 0);
  log.castShadow = log.receiveShadow = true;
  scene.add(log);

  return { scene, camera, sun, sky: skyDome, ground, stump, stumpTop, axe, log };
}

