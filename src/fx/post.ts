import { ACESFilmicToneMapping, type Camera, type Scene } from 'three/webgpu';
import { RenderPipeline, type Node, type WebGPURenderer } from 'three/webgpu';
import {
  float,
  mix,
  mrt,
  normalView,
  output,
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
//   tocón en vez de flotando. Sale de la misma pasada de la escena (normales por MRT):
//   una pasada previa aparte duplicaba el costo de dibujar la escena, y en un teléfono o
//   con GL por software eso es la diferencia entre jugable y no.

export interface PostOptions {
  ao?: boolean;
  bloom?: boolean;
}

export class PostFx {
  readonly pipeline: RenderPipeline;
  readonly contrast = uniform(1.06);
  readonly saturation = uniform(1.08);
  readonly aoStrength = uniform(0.7);
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
    const useAO = opts.ao ?? true;
    // Las pasadas son de media precisión, así que la normal entra cruda, con signo.
    if (useAO) scenePass.setMRT(mrt({ output, normal: normalView }));

    const hdr = scenePass.getTextureNode('output');
    let color: Node<'vec4'> = hdr;
    if (useAO) {
      const aoPass = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
      aoPass.radius.value = 0.6;
      aoPass.scale.value = 1.6;
      aoPass.resolutionScale = 0.5;
      // Godot oscurece solo la luz indirecta; acá se aplica a todo, así que va atenuado.
      const occlusion = mix(float(1), aoPass.getTextureNode().sample(screenUV).r, this.aoStrength);
      color = vec4(hdr.rgb.mul(occlusion), hdr.a);
    }
    if (opts.bloom ?? true) {
      const glow = bloom(hdr, 0.5, 0.4, 1.05);
      color = color.add(glow);
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
