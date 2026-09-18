import type { Context } from "@deepseek-ai/cordis";
import type {
  DocumentPreviewDefinition,
  DocumentPreviewProps,
} from "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MarkdownLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import mermaid from "mermaid";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ComponentType,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  filenameOf,
  isMermaidInfoString,
  wheelDeltaPixels,
  zoomOffsetAroundPoint,
} from "./mermaid-source.js";

const MMD_ID = "dsh-mermaid-plugin/mmd";
const MARKDOWN_ID = "dsh-mermaid-plugin/markdown";

type Translate = (key: "code.copy" | "code.copied" | "footnotes") => string;
interface ThemeSnapshot {
  readonly active: {
    readonly colorScheme: "light" | "dark";
    readonly tokens: Readonly<Record<string, string>>;
  };
  readonly revision: number;
}

type ThemeAwareProps = { readonly theme: ThemeSnapshot };
type LocalizedDocumentProps = DocumentPreviewProps & { readonly t: Translate };
type MermaidMarkdownProps = LocalizedDocumentProps & ThemeAwareProps;
type DocumentSlotDefinition = { readonly name: "sidebar.right.tab.document"; readonly key: string };

interface MermaidContext extends Context {
  readonly theme: { readonly getTheme: () => ThemeSnapshot };
  readonly slots: {
    inject: (name: "sidebar.right.tab.document", registration: () => () => void) => () => void;
    register: {
      (
        definition: DocumentSlotDefinition & { readonly locale: "documentMarkdown" },
        component: ComponentType<LocalizedDocumentProps>,
      ): () => void;
      (
        definition: DocumentSlotDefinition,
        component: ComponentType<DocumentPreviewProps>,
      ): () => void;
    };
  };
}

const styles = {
  document: {
    minWidth: 0,
    padding: "10px 12px",
    fontFamily: "var(--ds-font-family, inherit)",
    whiteSpace: "normal",
  },
  diagram: {
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    width: "100%",
    minHeight: "120px",
    overflow: "auto",
    padding: "16px",
    borderRadius: "12px",
    color: "var(--dsw-alias-label-primary)",
    background: "var(--dsw-alias-bg-base)",
  },
  expandButton: {
    position: "absolute",
    insetBlockStart: "10px",
    insetInlineEnd: "10px",
    minWidth: "32px",
    minHeight: "32px",
    padding: "4px 10px",
    border: "1px solid var(--dsw-alias-border-l2, #d0d7de)",
    borderRadius: "8px",
    color: "var(--dsw-alias-label-primary, #1f2328)",
    background: "var(--dsw-alias-bg-base, #fff)",
    cursor: "pointer",
  },
  error: {
    margin: 0,
    whiteSpace: "pre-wrap",
    color: "var(--dsw-alias-label-primary, #1f2328)",
    font: "var(--dsw-font-markdown-code-block, 12px/1.5 monospace)",
  },
} as const;

function paletteValue(name: string, fallback: string): string {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

/** DSH ThemeRuntimeが選択したパレットをMermaidへ反映する。 */
function mermaidConfig(theme: ThemeSnapshot): Parameters<typeof mermaid.initialize>[0] {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    fontFamily: paletteValue("--ds-font-family", "system-ui, sans-serif"),
    themeVariables: {
      darkMode: theme.active.colorScheme === "dark",
      background: paletteValue("--dsw-alias-bg-base", "#ffffff"),
      primaryColor: paletteValue("--dsw-alias-bg-layer-1", "#f6f8fa"),
      primaryTextColor: paletteValue("--dsw-alias-label-primary", "#1f2328"),
      primaryBorderColor: paletteValue("--dsw-alias-border-l2", "#d0d7de"),
      lineColor: paletteValue("--dsw-alias-label-secondary", "#59636e"),
      secondaryColor: paletteValue("--dsw-alias-bg-layer-2", "#eff1f3"),
      tertiaryColor: paletteValue("--dsw-alias-bg-layer-3", "#ffffff"),
      noteBkgColor: paletteValue("--dsw-alias-markdown-code-block", "#f6f8fa"),
      noteTextColor: paletteValue("--dsw-alias-label-primary", "#1f2328"),
      noteBorderColor: paletteValue("--dsw-alias-border-l2", "#d0d7de"),
      clusterBkg: paletteValue("--dsw-alias-bg-layer-1", "#ffffff"),
      clusterBorder: paletteValue("--dsw-alias-border-l2", "#d0d7de"),
      edgeLabelBackground: paletteValue("--dsw-alias-bg-base", "#ffffff"),
    },
  };
}

// Mermaidの設定はグローバルなので、テーマ設定と描画を直列化する。
let renderQueue: Promise<void> = Promise.resolve();

function renderDiagram(id: string, source: string, theme: ThemeSnapshot): Promise<string> {
  const task = renderQueue.then(async () => {
    mermaid.initialize(mermaidConfig(theme));
    return (await mermaid.render(id, source)).svg;
  });
  renderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function installSvg(host: HTMLElement, svgText: string): void {
  host.innerHTML = svgText;
  decorateSvg(host);
}

function decorateSvg(host: HTMLElement, constrained = true): void {
  const svg = host.querySelector("svg");
  if (svg === null) return;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Mermaid diagram");
  svg.style.display = "block";
  svg.style.width = constrained ? "auto" : "100%";
  svg.style.maxWidth = constrained ? "100%" : "none";
  svg.style.height = constrained ? "auto" : "100%";
  svg.style.margin = "auto";
}

const modalStyles: Record<string, CSSProperties> = {
  dialog: {
    width: "96vw",
    height: "94vh",
    maxWidth: "none",
    maxHeight: "none",
    padding: 0,
    border: "1px solid var(--dsw-alias-border-l2, #d0d7de)",
    borderRadius: "14px",
    color: "var(--dsw-alias-label-primary, #1f2328)",
    background: "var(--dsw-alias-bg-base, #fff)",
    boxShadow: "0 20px 60px rgb(0 0 0 / 35%)",
    overflow: "hidden",
  },
  panel: { display: "flex", flexDirection: "column", width: "100%", height: "100%" },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "52px",
    padding: "8px 12px",
    borderBottom: "1px solid var(--dsw-alias-border-l2, #d0d7de)",
    background: "var(--dsw-alias-bg-base, #fff)",
  },
  title: {
    marginInlineEnd: "auto",
    font: "var(--dsw-font-markdown-base-strong, 600 14px system-ui)",
  },
  toolbar: { display: "flex", alignItems: "center", gap: "6px" },
  button: {
    minWidth: "36px",
    minHeight: "32px",
    padding: "4px 10px",
    border: "1px solid var(--dsw-alias-border-l2, #d0d7de)",
    borderRadius: "8px",
    color: "inherit",
    background: "var(--dsw-alias-bg-layer-1, #f6f8fa)",
    cursor: "pointer",
  },
  viewport: {
    position: "relative",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    touchAction: "none",
    background: "var(--dsw-alias-bg-base, #fff)",
    cursor: "grab",
  },
  canvas: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transformOrigin: "center",
    willChange: "transform",
  },
  status: { display: "grid", placeItems: "center", width: "100%", height: "100%" },
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/** 拡大・パン操作を提供するネイティブdialog。 */
function DiagramModal({
  source,
  title,
  theme,
  onClose,
}: {
  readonly source: string;
  readonly title: string;
  readonly theme: ThemeSnapshot;
  readonly onClose: () => void;
}): ReactNode {
  const id = useId().replace(/[^a-zA-Z0-9_-]/gu, "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
  }>();
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    const diagram = canvas?.querySelector("svg");
    if (viewport === null || canvas === null || diagram === null || diagram === undefined) return;
    const viewBox = diagram.viewBox.baseVal;
    const width = viewBox.width || diagram.getBoundingClientRect().width;
    const height = viewBox.height || diagram.getBoundingClientRect().height;
    if (width <= 0 || height <= 0) return;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    setScale(
      clampScale(
        Math.min((viewport.clientWidth - 48) / width, (viewport.clientHeight - 48) / height),
      ),
    );
    setOffset({ x: 0, y: 0 });
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useLayoutEffect(() => {
    let active = true;
    void renderDiagram(`dsh-mermaid-modal-${id}`, source, theme).then(
      (result) => {
        if (active) setSvg(result);
      },
      (reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [id, source, theme]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (svg === undefined || canvas === null) return;
    decorateSvg(canvas, false);
    fit();
  }, [fit, svg]);

  const zoom = useCallback(
    (factor: number) => setScale((current) => clampScale(current * factor)),
    [],
  );
  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  const onWheel = useCallback(
    (event: globalThis.WheelEvent) => {
      const viewport = viewportRef.current;
      if (viewport === null) return;

      // Reactのwheelイベントはpassiveになり得るため、native non-passive listenerで消費する。
      event.preventDefault();
      event.stopPropagation();

      const deltaX = wheelDeltaPixels(event.deltaX, event.deltaMode, viewport.clientWidth);
      const deltaY = wheelDeltaPixels(event.deltaY, event.deltaMode, viewport.clientHeight);

      // Ctrl / Cmd 併用時はポインター位置を中心に図を拡大縮小する。
      if (event.ctrlKey || event.metaKey) {
        const nextScale = clampScale(scale * Math.exp(-deltaY * 0.0015));
        const rect = viewport.getBoundingClientRect();
        const point = {
          x: event.clientX - (rect.left + rect.width / 2),
          y: event.clientY - (rect.top + rect.height / 2),
        };
        setOffset(zoomOffsetAroundPoint(offset, point, nextScale / scale));
        setScale(nextScale);
        return;
      }
      // 通常ホイールは上下パン。Shift + ホイールは左右パンとして扱う。
      if (event.shiftKey) {
        // ブラウザにより回転量がdeltaX/deltaYのどちらに入るか異なるため主軸を採用する。
        const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        setOffset((current) => ({ ...current, x: current.x - delta }));
      } else {
        setOffset((current) => ({
          ...current,
          x: current.x - deltaX,
          y: current.y - deltaY,
        }));
      }
    },
    [offset, scale],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [onWheel]);
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      setDragging(true);
    },
    [offset],
  );
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.originX + event.clientX - drag.x,
      y: drag.originY + event.clientY - drag.y,
    });
  }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={`${title} diagram viewer`}
      style={modalStyles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          zoom(1.2);
        } else if (event.key === "-") {
          event.preventDefault();
          zoom(1 / 1.2);
        } else if (event.key === "0") {
          event.preventDefault();
          reset();
        } else if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          fit();
        } else if (event.key === "ArrowLeft")
          setOffset((current) => ({ ...current, x: current.x - 32 }));
        else if (event.key === "ArrowRight")
          setOffset((current) => ({ ...current, x: current.x + 32 }));
        else if (event.key === "ArrowUp")
          setOffset((current) => ({ ...current, y: current.y - 32 }));
        else if (event.key === "ArrowDown")
          setOffset((current) => ({ ...current, y: current.y + 32 }));
      }}
    >
      <div style={modalStyles.panel}>
        <header style={modalStyles.header}>
          <strong style={modalStyles.title}>{title}</strong>
          <div style={modalStyles.toolbar} aria-label="Diagram controls">
            <button
              type="button"
              style={modalStyles.button}
              onClick={() => zoom(1 / 1.2)}
              aria-label="Zoom out"
            >
              −
            </button>
            <button type="button" style={modalStyles.button} onClick={reset} title="Reset to 100%">
              {Math.round(scale * 100)}%
            </button>
            <button type="button" style={modalStyles.button} onClick={fit}>
              Fit
            </button>
            <button
              type="button"
              style={modalStyles.button}
              onClick={() => zoom(1.2)}
              aria-label="Zoom in"
            >
              ＋
            </button>
            <button type="button" style={modalStyles.button} onClick={onClose} autoFocus>
              Close
            </button>
          </div>
        </header>
        <div
          ref={viewportRef}
          style={{ ...modalStyles.viewport, cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {error !== undefined ? (
            <pre role="alert" style={{ ...styles.error, ...modalStyles.status }}>
              {error}
            </pre>
          ) : svg === undefined ? (
            <div role="status" style={modalStyles.status}>
              Rendering Mermaid diagram…
            </div>
          ) : (
            <div
              ref={canvasRef}
              style={{
                ...modalStyles.canvas,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

function MermaidDiagram({
  source,
  title,
  theme,
}: {
  readonly source: string;
  readonly title: string;
  readonly theme: ThemeSnapshot;
}): ReactNode {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/gu, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    let active = true;
    setSvg(undefined);
    setError(undefined);
    void renderDiagram(`dsh-mermaid-${reactId}`, source, theme).then(
      (result) => {
        if (active) setSvg(result);
      },
      (reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [reactId, source, theme]);

  useLayoutEffect(() => {
    if (svg !== undefined && hostRef.current !== null) decorateSvg(hostRef.current);
  }, [svg]);

  if (error !== undefined)
    return (
      <pre role="alert" style={styles.error}>
        {error}
      </pre>
    );
  if (svg === undefined)
    return (
      <div role="status" style={styles.diagram}>
        Rendering Mermaid diagram…
      </div>
    );
  return (
    <div style={{ position: "relative" }}>
      <div ref={hostRef} style={styles.diagram} dangerouslySetInnerHTML={{ __html: svg }} />
      <button type="button" style={styles.expandButton} onClick={() => setExpanded(true)}>
        Expand
      </button>
      {expanded && (
        <DiagramModal
          source={source}
          title={title}
          theme={theme}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

/** ネイティブMarkdownが生成したMermaidコードブロックだけを図へ拡張する。 */
function useMermaidFences(
  rootRef: RefObject<HTMLDivElement>,
  text: string,
  theme: ThemeSnapshot,
  onExpand: (source: string) => void,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    let active = true;
    const cleanups: Array<() => void> = [];
    const renderGroup = crypto.randomUUID();
    let index = 0;

    for (const block of root.querySelectorAll<HTMLElement>(".md-code-block")) {
      const banner = block.querySelector<HTMLElement>("[data-code-block-banner]");
      if (!isMermaidInfoString(banner?.firstElementChild?.textContent)) continue;
      const content = block.querySelector<HTMLElement>("[data-code-block-content]");
      const pre = content?.querySelector<HTMLElement>("pre");
      if (content === null || content === undefined || pre === null || pre === undefined) continue;

      const previousDisplay = pre.style.display;
      const host = document.createElement("div");
      Object.assign(host.style, styles.diagram);
      host.style.borderRadius = "0 0 12px 12px";
      host.setAttribute("role", "status");
      host.textContent = "Rendering Mermaid diagram…";
      pre.style.display = "none";
      content.append(host);

      void renderDiagram(
        `dsh-mermaid-markdown-${renderGroup}-${index++}`,
        pre.textContent ?? "",
        theme,
      ).then(
        (svg) => {
          if (!active || !host.isConnected) return;
          host.removeAttribute("role");
          installSvg(host, svg);
          const source = pre.textContent ?? "";
          const nativeButton = banner?.querySelector("button");
          const expand = nativeButton?.cloneNode(false) as HTMLButtonElement | undefined;
          if (expand !== undefined) {
            expand.textContent = "Expand";
            expand.setAttribute("aria-label", "Open Mermaid diagram viewer");
            expand.style.marginInlineStart = "12px";
            const expandDiagram = () => onExpand(source);
            expand.addEventListener("click", expandDiagram);
            banner?.lastElementChild?.append(expand);
            cleanups.push(() => {
              expand.removeEventListener("click", expandDiagram);
              expand.remove();
            });
          }
        },
        () => {
          if (!active) return;
          host.remove();
          pre.style.display = previousDisplay;
        },
      );
      cleanups.push(() => {
        host.remove();
        pre.style.display = previousDisplay;
      });
    }

    return () => {
      active = false;
      for (const cleanup of cleanups) cleanup();
    };
  }, [onExpand, rootRef, text, theme]);
}

function MermaidFile({
  content,
  resourceAddress,
  theme,
}: DocumentPreviewProps & ThemeAwareProps): ReactNode {
  if (content.kind !== "text") return null;
  return (
    <div style={styles.document}>
      <MermaidDiagram source={content.text} title={filenameOf(resourceAddress)} theme={theme} />
    </div>
  );
}

function MermaidMarkdown({ content, resourceAddress, t, theme }: MermaidMarkdownProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const copyLabel = t("code.copy");
  const copiedLabel = t("code.copied");
  const footnotes = t("footnotes");
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel, copiedLabel },
      footnotes,
    }),
    [copyLabel, copiedLabel, footnotes],
  );
  const [expandedSource, setExpandedSource] = useState<string>();
  const expand = useCallback((source: string) => setExpandedSource(source), []);
  useMermaidFences(rootRef, content.kind === "text" ? content.text : "", theme, expand);
  if (content.kind !== "text") return null;
  return (
    <div ref={rootRef} style={styles.document} data-document-markdown>
      <MarkdownText text={content.text} streaming={!content.eof} labels={labels} />
      {expandedSource !== undefined && (
        <DiagramModal
          source={expandedSource}
          title={filenameOf(resourceAddress)}
          theme={theme}
          onClose={() => setExpandedSource(undefined)}
        />
      )}
    </div>
  );
}

function definition(
  id: string,
  extensions: readonly string[],
  title: string,
): DocumentPreviewDefinition {
  return {
    id,
    extensions,
    priority: "extension",
    title: () => title,
    loading: "text-pages",
    wrap: false,
  };
}

function useThemeSnapshot(ctx: MermaidContext): ThemeSnapshot {
  const subscribe = useCallback((listener: () => void) => ctx.on("theme/change", listener), [ctx]);
  const getSnapshot = useCallback(() => ctx.theme.getTheme(), [ctx]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const inject = ["documentPreviews", "slots", "theme"];

export function apply(ctx: MermaidContext): void {
  const ThemedMermaidFile = (props: DocumentPreviewProps): ReactNode => (
    <MermaidFile {...props} theme={useThemeSnapshot(ctx)} />
  );
  const ThemedMermaidMarkdown = (props: LocalizedDocumentProps): ReactNode => (
    <MermaidMarkdown {...props} theme={useThemeSnapshot(ctx)} />
  );
  ctx.effect(
    () => ctx.documentPreviews.register(definition(MMD_ID, ["mmd", "mermaid"], "Mermaid diagram")),
    "dsh-mermaid-plugin: Mermaid metadata",
  );
  ctx.effect(
    () =>
      ctx.documentPreviews.register(
        definition(MARKDOWN_ID, ["md", "markdown"], "Markdown with Mermaid"),
      ),
    "dsh-mermaid-plugin: Markdown metadata",
  );
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.right.tab.document", () =>
        ctx.slots.register({ name: "sidebar.right.tab.document", key: MMD_ID }, ThemedMermaidFile),
      ),
    "dsh-mermaid-plugin: Mermaid body",
  );
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.right.tab.document", () =>
        ctx.slots.register(
          { name: "sidebar.right.tab.document", key: MARKDOWN_ID, locale: "documentMarkdown" },
          ThemedMermaidMarkdown,
        ),
      ),
    "dsh-mermaid-plugin: Markdown body",
  );
}
