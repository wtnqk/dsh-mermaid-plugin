import "@deepseek-ai/cordis";

declare module "@deepseek-ai/cordis" {
  interface Events {
    "theme/change"(snapshot: unknown): void;
  }
}
