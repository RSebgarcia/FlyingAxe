import { equirectUV, float, normalLocal, texture, uniform } from 'three/tsl';
import { BackSide, Mesh, MeshBasicNodeMaterial, SphereGeometry, type Camera, type Texture } from 'three/webgpu';

// The panorama sky as a dome that follows the camera.
//
// Not `scene.background`: three.js r186 lost all horizontal detail when it turned this
// KTX2 panorama into a background (bands of colour by elevation only, on the WebGL 2
// path). A dome sampling the panorama directly works the same on both backends, and
// gives ambience.ts a material it can tint and fade between weathers.
export class SkyDome extends Mesh<SphereGeometry, MeshBasicNodeMaterial> {
  readonly intensity = uniform(1);

  constructor(panorama: Texture) {
    const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    super(new SphereGeometry(300, 64, 32), material);
    this.name = 'Sky';
    this.renderOrder = -1;
    this.frustumCulled = false;
    this.setPanorama(panorama);
  }

  setPanorama(panorama: Texture) {
    // Level 0 always: the sky is magnified on screen, and automatic mip selection
    // breaks into a visible line at the panorama's wrap-around seam.
    // The sphere's inward normals point at the viewer; flip them to get the view ray.
    this.material.colorNode = texture(panorama, equirectUV(normalLocal.negate())).level(float(0)).mul(this.intensity);
    this.material.needsUpdate = true;
  }

  follow(camera: Camera) {
    this.position.copy(camera.position);
  }
}
