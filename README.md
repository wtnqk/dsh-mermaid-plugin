tall

```sh
bun install
bun run build
dsh plugin --profile web add "$(pwd)"
```

Restart `dsh web` after installing the plugin. Open a supported file in the right sidebar's document preview. For Markdown files, choose **Markdown with Mermaid** if it is not selected automatically.

When using `dsh-docker`, pass the container-visible path:

```sh
../dsh-docker/dsh-docker.sh plugin --profile web add "/workspace$(pwd)"
```

To install from a package archive instead:

```sh
bun run build
bunx npm pack
dsh plugin --profile web add ./dsh-mermaid-plugin-0.1.0.tgz
```

## Development

```sh
bun run check        # oxlint lint + oxfmt format check
bun run fmt          # oxfmt format & write
bun run typecheck    # tsc --noEmit
bun test             # unit tests
bun run pack:check   # build + dry-run pack
```

Markdown is rendered by DSH's native `MarkdownText`; only `mermaid` fenced code blocks are enhanced in place. Raw HTML remains disabled. Mermaid-generated SVG is rendered only after Mermaid's strict sanitization.
