/** DSHコードブロックのinfo stringがMermaidを指すか判定する。 */
export function isMermaidInfoString(info: string | null | undefined): boolean {
  return info?.trim().split(/\s+/u, 1)[0]?.toLowerCase() === "mermaid";
}

/** DSHのresource addressから表示用ファイル名を取り出す。 */
export function filenameOf(address: string): string {
  const name = address.slice(address.lastIndexOf("/") + 1);
  if (name === "") return address;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** WheelEventのdeltaModeをCSSピクセル相当へ正規化する。 */
export function wheelDeltaPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * Math.max(0, pageSize);
  return delta;
}

/** 拡大後も指定点の図上位置を画面上の同じ場所へ保つオフセットを返す。 */
export function zoomOffsetAroundPoint(
  offset: Readonly<{ x: number; y: number }>,
  point: Readonly<{ x: number; y: number }>,
  scaleRatio: number,
): { x: number; y: number } {
  return {
    x: point.x - (point.x - offset.x) * scaleRatio,
    y: point.y - (point.y - offset.y) * scaleRatio,
  };
}
