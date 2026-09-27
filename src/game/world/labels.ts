import * as THREE from 'three/webgpu';

export interface LabelOptions {
  color?: string;
  background?: string;
  /** World units tall. */
  height?: number;
  font?: string;
}

/**
 * A text label that always faces the camera, drawn on a canvas. Canvas text keeps names
 * sharp and readable without shipping a font atlas.
 */
export class Label {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private readonly options: Required<LabelOptions>;
  private text = '';

  constructor(text: string, options: LabelOptions = {}) {
    this.options = {
      color: options.color ?? '#e8ecf5',
      background: options.background ?? 'rgba(10, 15, 28, 0.72)',
      height: options.height ?? 0.35,
      font: options.font ?? "600 44px 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
    };
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.setText(text);
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.font = this.options.font;
    const padding = 24;
    const width = Math.ceil(context.measureText(text).width) + padding * 2;
    const height = 72;
    this.canvas.width = width;
    this.canvas.height = height;
    // Resizing a canvas clears it and resets its settings, so set the font again.
    context.font = this.options.font;
    context.fillStyle = this.options.background;
    context.beginPath();
    context.roundRect(0, 0, width, height, 18);
    context.fill();
    context.fillStyle = this.options.color;
    context.textBaseline = 'middle';
    context.fillText(text, padding, height / 2 + 2);
    this.texture.needsUpdate = true;
    this.sprite.scale.set((this.options.height * width) / height, this.options.height, 1);
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
