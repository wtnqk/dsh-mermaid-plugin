// ============================================================================
// ビルドスクリプト
// ----------------------------------------------------------------------------
// 1. ビルド前に lib/ ディレクトリを空にする
// 2. esbuild でサーバー側 (index.ts) とクライアント側 (client.tsx) をそれぞれ
//    バンドル
// 3. tsc で型定義 (.d.ts) のみ lib/types/ に出力
// 日々のビルドは `npm run build` から実行される。
// ============================================================================
import { rm } from "node:fs/promises"; // ファイル削除用 (Node 標準の Promise API)
import { build } from "esbuild"; // バンドル・トランスパイル用ビルダー
import ts from "typescript"; // 型検査・型定義出力用の TypeScript API

// 出力先 (lib/) を再帰的に削除してクリーンな状態から開始する
await rm("lib", { recursive: true, force: true });

// --- サーバー側 (エントリポイント index.ts) のビルド -------------------------
// ESM 形式で node20 向けに出力する。依存は外部 (packages: external) として
// バンドルせず、実行時に解決させる。
await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
});

// --- クライアント側 (client.tsx / React + Mermaid) のビルド ------------------
// ブラウザ向け (chrome120) の CJS として出力する。React 系は外部参照。
// banner / footer により、DSH のモジュールローダー
// (window.__ModuleLoader__.load) にプラグインとして登録するラッパーを付与する。
await build({
  entryPoints: ["src/client.tsx"],
  outfile: "lib/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["chrome120"],
  external: ["react", "react/jsx-runtime", "react-dom", "@deepseek-ai/dsh-client-ui-primitives"],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-mermaid-plugin", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: "return module.exports; } });" },
});

// --- 型定義 (.d.ts) の出力 ---------------------------------------------------
// tsconfig.json を読み込み、emitDeclarationOnly (型定義のみ出力) で
// lib/types/ に型定義を生成する。型エラーがあればここでビルドを中断する。
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
// コマンドライン相当のオプションを付与してコンパイル設定を解析
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd(), {
  emitDeclarationOnly: true,
  noEmit: false,
});
// 型チェック対象のプログラムを生成して検査を実行
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const result = program.emit();
const allDiagnostics = [...diagnostics, ...result.diagnostics];
if (allDiagnostics.length > 0) {
  // 診断結果を人間が読みやすい形式 (色付き・ファイル行付き) で整形
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  };
  // 型エラーがあれば例外を投げてビルドを失敗させる
  throw new Error(ts.formatDiagnosticsWithColorAndContext(allDiagnostics, host));
}
