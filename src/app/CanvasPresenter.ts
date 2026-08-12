import type { RenderCommand, RenderFrame } from '../rendering/types';

export interface CanvasView {
  readonly centerX?: number;
  readonly centerY?: number;
  readonly worldSpan?: number;
}

/** Browser-only adapter. It interprets render commands; it owns no gameplay state. */
export class CanvasPresenter {
  readonly canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  #dpr = 1;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.novaSurface = 'canonical-world';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;background:#04060d;touch-action:none';
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    this.#context = context;
    parent.append(this.canvas);
    this.resize();
  }

  resize(): void {
    this.#dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * this.#dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * this.#dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  draw(frame: RenderFrame, view: CanvasView = {}): void {
    this.resize();
    const ctx = this.#context;
    const width = this.canvas.width / this.#dpr;
    const height = this.canvas.height / this.#dpr;
    const span = Math.max(600, view.worldSpan ?? 5000);
    const scale = Math.min(width, height) / span;
    const centerX = view.centerX ?? 0;
    const centerY = view.centerY ?? 0;

    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    for (const command of frame.commands) this.drawCommand(command, 1 / scale);
    ctx.restore();
  }

  worldPoint(clientX: number, clientY: number, view: CanvasView = {}): { x:number; y:number } {
    const rect = this.canvas.getBoundingClientRect();
    const span = Math.max(600, view.worldSpan ?? 5000);
    const scale = Math.min(rect.width, rect.height) / span;
    return {
      x:(clientX - rect.left - rect.width / 2) / scale + (view.centerX ?? 0),
      y:(clientY - rect.top - rect.height / 2) / scale + (view.centerY ?? 0),
    };
  }

  private drawCommand(command: RenderCommand, pixel: number): void {
    const ctx = this.#context;
    ctx.save();
    ctx.globalAlpha = command.alpha ?? 1;
    switch (command.kind) {
      case 'circle':
        ctx.beginPath(); ctx.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
        if (command.fill) { ctx.fillStyle = command.fill; ctx.fill(); }
        if (command.stroke) { ctx.strokeStyle = command.stroke; ctx.lineWidth = command.lineWidth ?? pixel; ctx.stroke(); }
        break;
      case 'rect':
        ctx.translate(command.x, command.y); ctx.rotate(command.rotation ?? 0);
        if (command.fill) { ctx.fillStyle = command.fill; ctx.fillRect(-command.width/2, -command.height/2, command.width, command.height); }
        if (command.stroke) { ctx.strokeStyle = command.stroke; ctx.lineWidth = command.lineWidth ?? pixel; ctx.strokeRect(-command.width/2, -command.height/2, command.width, command.height); }
        break;
      case 'line':
        ctx.beginPath(); ctx.moveTo(command.x1, command.y1); ctx.lineTo(command.x2, command.y2); ctx.strokeStyle = command.color; ctx.lineWidth = command.width; ctx.stroke();
        break;
      case 'glow': {
        const gradient = ctx.createRadialGradient(command.x, command.y, 0, command.x, command.y, command.radius);
        gradient.addColorStop(0, command.color); gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient; ctx.fillRect(command.x-command.radius, command.y-command.radius, command.radius*2, command.radius*2);
        break;
      }
      case 'text':
        ctx.fillStyle = command.color; ctx.font = `${command.size}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(command.text, command.x, command.y);
        break;
    }
    ctx.restore();
  }
}
