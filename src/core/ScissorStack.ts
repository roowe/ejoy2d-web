// Port of lib/scissor.c; animation traversal owns the lifetime of each push.
import { intersect, type Rect } from "./Matrix";

export class ScissorStack {
  private readonly stack: Rect[] = [];
  get depth() {
    return this.stack.length;
  }
  get current(): Rect | null {
    return this.stack.at(-1) ?? null;
  }

  push(rect: Rect) {
    if (this.depth === 8)
      throw new Error("Scissor stack exceeds the original limit of 8");
    const previous = this.current;
    this.stack.push(previous ? intersect(previous, rect) : rect);
    return this.current!;
  }

  pop() {
    if (!this.depth) throw new Error("Unbalanced scissor pop");
    this.stack.pop();
    return this.current;
  }
}
