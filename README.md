# Writer Access → Site pipeline

This repo auto-publishes posts written in [Writer Access](https://www.writeraccess.com/) to the blog. End-to-end:

```
Writer Access  ──►  Zapier  ──►  this repo (writer-access/*.json)
                                          │
                                          ▼
                                  GitHub Actions runs
                                  writer-access/formatter.mjs
                                          │
                                          ▼
                                  src/content/blog/<slug>.mdx
                                  (committed back to main)
```

### 1. Editor exports a post in Writer Access

On an approved order in WA, the editor opens **Export Content → Zapier**. WA fires a webhook to Zapier with the order payload (`title`, `body`, etc.).

### 2. Zapier zap

The zap has three steps:

1. **Webhooks by Zapier — Catch Hook**: receives the WA payload.
2. **GitHub — Create or Update File**: writes the payload as a JSON file into `writer-access/` on `main` (filename = order title `.json`). This commit is what kicks off step 3.
3. **Email by Zapier — Send Outbound Email**: notifies the dev/editor that a new post has arrived, so they know to check the resulting MDX.

### 3. GitHub Actions formats the post

The workflow at `.github/workflows/format-writer-access.yml` triggers on any push that touches `writer-access/**`. It:

1. Installs deps and runs `node writer-access/formatter.mjs`.
2. The script (see `writer-access/formatter.mjs`) for each `*.json` in `writer-access/`:
   - Sanitizes the JSON — WA's `body` field contains raw HTML with unescaped `"`, newlines, and tabs that break `JSON.parse`. `sanitizeWriterAccessJson` rewrites just the body's value range to make it parseable.
   - Builds an MDX file via `jsonToMdx` — `body` becomes the MDX body (HTML pasted inline; MDX accepts that), and the rest of the keys become YAML frontmatter. Schema-required fields the WA payload doesn't provide (`post_hero.*`, `thumb_image_path`, `thumb_image_alt`) are stubbed with empty/placeholder values so the post passes the content-collection schema in `src/content.config.ts`. An editor fills these in afterwards in CloudCannon.
   - Slugifies the filename and writes to `src/content/blog/<slug>.mdx`.
   - Empties the `writer-access/` directory (except `formatter.mjs`) so the next run starts clean.
3. Commits the generated `.mdx` and the cleanup deletions back to `main` as the `github-actions[bot]` user.

The workflow's commit uses the auto-provided `GITHUB_TOKEN` with `contents: write` permission. Pushes from `GITHUB_TOKEN` deliberately do not trigger other workflow runs, so there's no infinite loop — but be aware that any deploy/CI workflow you add later won't auto-fire on the bot's commit unless you switch to a PAT or GitHub App token.

### What to do when it doesn't work

- **Post didn't appear**: check the Actions tab for a failed `Format Writer Access posts` run. Schema validation failures will name the missing frontmatter field.
- **JSON.parse error in the workflow logs**: WA sent a payload with a structure `sanitizeWriterAccessJson` doesn't expect (e.g. `body` is no longer the last field, or a non-string field also has illegal characters). The sanitizer is deliberately scoped to just the `body` value — adjust it if the payload shape changes.
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
