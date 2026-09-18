declare module "@deepseek-ai/dsh-client-ui-primitives" {
  import type { ComponentType } from "react";

  export interface MarkdownLabels {
    readonly code: { readonly copyLabel: string; readonly copiedLabel: string };
    readonly footnotes: string;
  }

  export const MarkdownText: ComponentType<{
    readonly text: string;
    readonly streaming?: boolean;
    readonly labels: MarkdownLabels;
  }>;
}
