# Open Home Foundation design system

Shared design foundations for Open Home Foundation products. The plan and its reasoning are in [ADR 0001](docs/adr/0001-ohf-design-system.md).

| Package | Contents |
|---|---|
| [`@openhomefoundation/tokens`](packages/tokens) | Colours, spacing, radii, typography, shadows and motion as CSS custom properties, JS and JSON |
| [`@openhomefoundation/icons`](packages/icons) | Every Lucide icon plus OHF's own, as icon data, SVG files, a Lit element and Vue components |

## Develop

Needs Node 24 and pnpm.

```bash
pnpm install
```

```bash
pnpm build
```

```bash
pnpm test
```

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). On every push to `main`, [Release Please](https://github.com/googleapis/release-please) opens or updates a release PR for each package with `feat` or `fix` commits. Merging that PR tags the version and publishes the package to npm from GitHub Actions. Each package starts at 0.1.0. There are no `CHANGELOG.md` files: the notes for each version are on its GitHub release.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so there is no npm token in this repo. Two things have to be set up by hand once:

1. **First publish of each package.** A package must exist on npm before trusted publishing can be configured for it. Publish its first version from a laptop with `npm publish --access public`.
2. **Trust this workflow.** On npmjs.com, open the package's settings, add a trusted publisher, and enter the organization `OpenHomeFoundation`, the repository `design-system` and the workflow file `release.yml`.

Release Please also needs the repository setting "Allow GitHub Actions to create and approve pull requests" (Settings, Actions, General).

## Licence

Apache-2.0. The icons package also ships Lucide's licence for the Lucide icons.
