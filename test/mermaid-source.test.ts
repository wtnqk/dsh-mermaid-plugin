import { describe, expect, it } from "vitest";
import {
  filenameOf,
  isMermaidInfoString,
  wheelDeltaPixels,
  zoomOffsetAroundPoint,
} from "../src/mermaid-source.js";

describe("isMermaidInfoString", () => {
  it("recognizes Mermaid fence info strings", () => {
    expect(isMermaidInfoString("mermaid")).toBe(true);
    expect(isMermaidInfoString('  Mermaid title="Flow"')).toBe(true);
    expect(isMermaidInfoString("typescript")).toBe(false);
    expect(isMermaidInfoString(undefined)).toBe(false);
  });
});

describe("filenameOf", () => {
  it("extracts and decodes the resource basename", () => {
    expect(filenameOf("dsh-resource://file/session/id/docs/system%20map.md")).toBe("system map.md");
  });

  it("keeps malformed encoded names readable", () => {
    expect(filenameOf("dsh-resource://file/session/id/diagram%ZZ.mmd")).toBe("diagram%ZZ.mmd");
  });
});

describe("wheelDeltaPixels", () => {
  it("normalizes pixel, line, and page deltas", () => {
    expect(wheelDeltaPixels(2, 0, 600)).toBe(2);
    expect(wheelDeltaPixels(2, 1, 600)).toBe(32);
    expect(wheelDeltaPixels(2, 2, 600)).toBe(1200);
  });
});

describe("zoomOffsetAroundPoint", () => {
  it("keeps the pointed diagram coordinate stationary", () => {
    expect(zoomOffsetAroundPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 2)).toEqual({
      x: -100,
      y: -50,
    });
  });
});
