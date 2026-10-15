import { ACESFilmicToneMapping, type Camera, type Scene } from 'three/webgpu';
import { RenderPipeline, type Node, type WebGPURenderer } from 'three/webgpu';
import {
  builtinAOContext,
  float,
  mrt,
  normalView,
  pass,
  renderOutput,
  saturation,
  screenUV,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

// Imagen final (ambience.gd :: _calidad): ACES, glow, oclusión ambiental y un toque de
// contraste y saturación.
//
// - ACES: la curva de cine. Sin esto los cielos de atardecer se queman a blanco.
// - Bloom: lo que hace que el sol y los bordes iluminados "respiren". Umbral 1.05 en HDR,
//   como el glow de Godot, así solo brilla lo que de verdad se pasa de blanco.
// - AO (GTAO): hunde los contactos. Es lo que hace que la leña se vea APOYADA sobre el
//   tocón en vez de flotando. Como el SSAO de Godot, oscurece solo la luz indirecta.

export interface PostOptions {
  ao?: boolean;
  bloom?: boolean;
}

export class PostFx {
  readonly pipeline: RenderPipeline;
  readonly contrast = uniform(1.06);
  readonly saturation = uniform(1.08);
  /** Sin post, se dibuja directo (con ACES igual). Lo baja la calidad adaptativa. */
  enabled = true;

  constructor(
    private renderer: WebGPURenderer,
    private scene: Scene,
    private camera: Camera,
    opts: PostOptions = {},
  ) {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const pipeline = new RenderPipeline(renderer);
    // El tonemap y el paso a sRGB se hacen a mano para poder ajustar después, como hace
    // Godot con `adjustment_*`.
    pipeline.outputColorTransform = false;

    const scenePass = pass(scene, camera);

    if (opts.ao ?? true) {
      // Pasada previa solo con profundidad y normales para alimentar al AO.
      const prePass = pass(scene, camera);
      prePass.setMRT(mrt({ output: normalView }));
      const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
      aoPass.radius.value = 0.6;
      aoPass.scale.value = 1.6;
      aoPass.resolutionScale = 0.5;
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
    }

    const hdr = scenePass.getTextureNode('output');
    let color: Node<'vec4'> = hdr;
    if (opts.bloom ?? true) {
      const glow = bloom(hdr, 0.5, 0.4, 1.05);
      color = hdr.add(glow);
    }

    const mapped = renderOutput(color);
    const adjusted = saturation(mapped.rgb.sub(0.5).mul(this.contrast).add(0.5), this.saturation);
    pipeline.outputNode = vec4(adjusted.max(vec3(float(0))), mapped.a);

    this.pipeline = pipeline;
  }

  render(): void {
    if (this.enabled) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.pipeline.dispose();
  }
}
