import { Box3, Vector3, type Object3D } from 'three/webgpu';
import type { Physics } from './physics';

// Static colliders for the Blender scene. Godot turned `-col` nodes into trimesh
// colliders; here they become simple primitives sized from the mesh bounds, which is
// cheaper and is what escenario_todo.md asks for anyway (`-colonly` boxes).
export function addStaticCollider(physics: Physics, node: Object3D, shape: 'box' | 'cylinder') {
  const { rapier, world } = physics;
  node.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(node);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  const desc =
    shape === 'box'
      ? rapier.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      : rapier.ColliderDesc.cylinder(size.y / 2, Math.max(size.x, size.z) / 2);
  desc.setTranslation(center.x, center.y, center.z);
  return world.createCollider(desc);
}
