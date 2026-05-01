# Writer Access → Site pipeline

This repo auto-publishes posts written in [Writer Access](https://www.writeraccess.com/) to the blog. End-to-end:

```
Writer Access  ──►  Zapier  ──►  this repo (writer-access/*.json on main)
                                          │
                                          ▼
                                  CloudCannon build is triggered
                                  prebuild runs writer-access/formatter.mjs
                                          │
                                          ▼
                                  src/content/blog/<slug>.mdx
                                  (generated in the build container,
                                   then Astro builds the site as normal)
```

### 1. Editor exports a post in Writer Access

On an approved order in WA, the editor opens **Export Content → Zapier**. WA fires a webhook to Zapier with the order payload (`title`, `body`, etc.).

### 2. Zapier zap

The zap has three steps:

1. **Webhooks by Zapier — Catch Hook**: receives the WA payload.
2. **GitHub — Create or Update File**: writes the payload as a JSON file into `writer-access/` on `main` (filename = order title `.json`). The push to `main` is what kicks off the CloudCannon build in step 3.
3. **Email by Zapier — Send Outbound Email**: notifies the dev/editor that a new post has arrived, so they know to check the live site.

### 3. CloudCannon prebuild formats the post

CloudCannon runs `.cloudcannon/prebuild` before each site build. That script is a one-liner:

```bash
node writer-access/formatter.mjs
```

For each `*.json` in `writer-access/`, the script (see `writer-access/formatter.mjs`):

- **Sanitizes the JSON** — WA's `body` field contains raw HTML with unescaped `"`, newlines, and tabs that break `JSON.parse`. `sanitizeWriterAccessJson` rewrites just the body's value range to make it parseable.
- **Rewrites HTML for CloudCannon** — `applyCloudCannonRewrites` runs a list of `[pattern, replacement]` rules against the body, e.g. swapping `style='text-align:justify'` for `class='align-justify'` (CC's expected form). Add new entries to `cloudCannonRewrites` whenever a fresh quirk turns up.
- **Builds an MDX file via `jsonToMdx`** — `body` becomes the MDX body (HTML pasted inline; MDX accepts that), and the rest of the keys become YAML frontmatter. Schema-required fields the WA payload doesn't provide (`post_hero.*`, `thumb_image_path`, `thumb_image_alt`) are stubbed with empty/placeholder values so the post passes the content-collection schema in `src/content.config.ts`. An editor can fill those in afterwards in CloudCannon.
- **Slugifies the filename** and writes to `src/content/blog/<slug>.mdx`.

After the prebuild finishes, Astro builds the site with the freshly generated MDX bundled in. Nothing is committed back to the repo — the generated `.mdx` only exists inside the build container. The source of truth for each post is its `*.json` file in `writer-access/` on `main`.

### What to do when it doesn't work

- **Post didn't appear on the live site**: check the build log in CloudCannon for the run that should have included the new post. Schema validation failures will name the missing frontmatter field; rewrite errors and `JSON.parse` errors surface in the prebuild step's stdout.
- **`JSON.parse` error in the prebuild logs**: WA sent a payload with a structure `sanitizeWriterAccessJson` doesn't expect (e.g. `body` is no longer the last field, or a non-string field also has illegal characters). The sanitizer is deliberately scoped to just the `body` value — adjust it if the payload shape changes.
- **HTML renders but looks wrong (e.g. alignment classes missing)**: WA emitted a style/markup form not yet covered by `cloudCannonRewrites`. Add a new entry to that array.
- **Zap didn't fire**: check the Zap History in Zapier. WA-side issues mean the editor didn't pick **Export Content → Zapier**, or the Catch Hook URL in WA's integration settings is stale.

## Project Structure

```
├── .cloudcannon/          # CloudCannon schemas and postbuild
├── cloudcannon.config.yml # CloudCannon configuration
├── data/                  # Site-wide data files
├── public/                # Static assets
└── src/
    ├── components/        # Astro components
    ├── content/           # Content collections (pages, blog)
    ├── layouts/           # Page layouts
    ├── pages/             # Astro page routes
    ├── scripts/           # Component registration for visual editing
    └── styles/            # Global CSS (Tailwind v4)
```
