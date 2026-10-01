// JSON equivalent of lib/spritepack.h. IDs and component indices retain original values.
import type { Matrix, Point } from '../core/Matrix';

export const ANCHOR_ID = 0xffff;
export interface Quad { readonly texture: number; readonly src: readonly Point[]; readonly screen: readonly Point[] }
export interface Part { readonly index: number; readonly matrix: Matrix; readonly color: number; readonly add: number; readonly touch: boolean }
export interface Frame { readonly parts: readonly Part[] }
export interface Action { readonly name: string; readonly frames: readonly Frame[] }
export interface Component { readonly id: number; readonly name: string | null }
export interface Picture { readonly type: 'picture'; readonly id: number; readonly quads: readonly Quad[] }
export interface Animation { readonly type: 'animation'; readonly id: number; readonly components: readonly Component[]; readonly actions: readonly Action[] }
export interface LabelData { readonly type: 'label'; readonly id: number; readonly width: number; readonly height: number; readonly size: number; readonly align: number; readonly color: number }
export interface Panel { readonly type: 'pannel'; readonly id: number; readonly width: number; readonly height: number; readonly scissor: boolean }
export interface Anchor { readonly type: 'anchor'; readonly id: typeof ANCHOR_ID }
export type SpriteData = Picture | Animation | LabelData | Panel | Anchor;
