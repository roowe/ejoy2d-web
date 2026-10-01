// Browser replacement for platform touch dispatch: pointer capture and logical-pixel coordinates.
import type { Screen } from "../core/Screen";
export type TouchPhase = "BEGIN" | "MOVE" | "END" | "CANCEL";
export type TouchHandler = (
  phase: TouchPhase,
  x: number,
  y: number,
  pointerId: number,
) => void;

export class Input {
  private readonly controller = new AbortController();
  constructor(canvas: HTMLCanvasElement, screen: Screen, touch: TouchHandler) {
    const options = { signal: this.controller.signal };
    const send = (phase: TouchPhase, event: PointerEvent) => {
      const [x, y] = screen.pointer(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
      );
      touch(phase, x, y, event.pointerId);
    };
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        send("BEGIN", event);
      },
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => send("MOVE", event),
      options,
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        send("END", event);
        if (canvas.hasPointerCapture(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
      },
      options,
    );
    canvas.addEventListener(
      "pointercancel",
      (event) => send("CANCEL", event),
      options,
    );
  }
  dispose() {
    this.controller.abort();
  }
}
