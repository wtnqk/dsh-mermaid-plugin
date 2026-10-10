tall

Install from npm:

```sh
dsh plugin --profile web add @wtnqk/dsh-mermaid-plugin
```

Or install from a local checkout:

```sh
pnpm install
pnpm run build
dsh plugin --profile web add "$(pwd)"
```

Restart `dsh web` after installing the plugin. Open a supported file in the right sidebar's document preview. For Markdown files, choose **Markdown with Mermaid** if it is not selected automatically.

When using `dsh-docker`, pass the container-visible path:

```sh
../dsh-docker/dsh-docker.sh plugin --profile web add "/workspace$(pwd)"
```

To install straight from GitHub, `dsh` builds the package from source on your machine:

```sh
dsh plugin --profile web add github:wtnqk/dsh-mermaid-plugin
```

pnpm ≥10 blocks that build until you allow it, so the first run fails. Copy the package name pnpm prints into the web profile's `pnpm-workspace.yaml` (typically `$DSH_HOME/profiles/web/pnpm-workspace.yaml`):

```yaml
allowBuilds:
  "@wtnqk/dsh-mermaid-plugin": true
```

Then run the `add` again. The build runs at install time, so pin a commit you trust, e.g. `github:wtnqk/dsh-mermaid-plugin#<sha>`, and only install sources you have reviewed.

To install from a package archive instead:

```sh
pnpm run build
pnpm pack
dsh plugin --profile web add ./wtnqk-dsh-mermaid-plugin-0.1.2.tgz
```

## Development

```sh
pnpm run check        # oxlint lint + oxfmt format check
pnpm run fmt          # oxfmt format & write
pnpm run typecheck    # tsc --noEmit
pnpm test             # unit tests
pnpm run pack:check   # build + dry-run pack
```

## Publishing

The first release is published manually, because npm only allows configuring a trusted publisher for a package that already exists on the registry. With 2FA enabled on the npm account:

```sh
npm login
pnpm publish --access public
```

Then open the package's settings on npmjs.com → **Trusted publishing** and add a GitHub Actions publisher:

- Organization or user: `wtnqk`
- Repository: `dsh-mermaid-plugin`
- Workflow filename: `publish.yml`
- Allowed actions: `npm publish`

The configuration must complete one successful publish within 48 hours or it expires. After that, `.github/workflows/publish.yml` builds and publishes every `v*` tag via OIDC (no token) with provenance:

```sh
git tag v0.1.2
git push origin v0.1.2
```

Markdown is rendered by DSH's native `MarkdownText`; only `mermaid` fenced code blocks are enhanced in place. Raw HTML remains disabled. Mermaid-generated SVG is rendered only after Mermaid's strict sanitization.
