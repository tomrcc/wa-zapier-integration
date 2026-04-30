import fs from "node:fs";
import path from "node:path";
import slugify from "slugify";
import yaml from "js-yaml";

(async () => {
  const waDirPath = "./writer-access";
  const waDirFiles = await fs.promises.readdir(waDirPath);
  const waPosts = waDirFiles.filter((fileName) => fileName != "formatter.mjs");
  const postsDirPath = "src/content/blog";

  await Promise.all(
    waPosts.map(async (post) => {
      const postPath = path.join(waDirPath, post);
      const postDataRaw = await fs.promises.readFile(postPath, "utf-8");
      const postData = JSON.parse(sanitizeWriterAccessJson(postDataRaw));

      const postName = slugify(post.replace(".json", ""), { lower: true });
      const pathToWrite = path.join(postsDirPath, `${postName}.mdx`);
      const postContents = jsonToMdx(postData);
      await fs.promises.writeFile(pathToWrite, postContents);
    }),
  );

  // Clean up directory after we've written posts
  await cleanupWriterAccessDir(waDirPath);
})();

async function cleanupWriterAccessDir(waDirPath) {
  const files = await fs.promises.readdir(waDirPath);
  for (const file of files) {
    if (file === "formatter.mjs") continue;
    await fs.promises.unlink(path.join(waDirPath, file));
  }
}

// Rewrites applied to the post body to swap WA's HTML for what CloudCannon expects.
// Add a new [pattern, replacement] entry here whenever a fresh quirk turns up.
const cloudCannonRewrites = [
  [/style='text-align:\s*justify;?\s*'/g, "class='align-justify'"],
  [/style='text-align:\s*center;?\s*'/g, "class='align-center'"],
  [/style='text-align:\s*left;?\s*'/g, "class='align-left'"],
  [/style='text-align:\s*right;?\s*'/g, "class='align-right'"],
];

function applyCloudCannonRewrites(body) {
  return cloudCannonRewrites.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    body,
  );
}

function jsonToMdx(postData) {
  const { title = "", body = "", ...rest } = postData;
  const rewrittenBody = applyCloudCannonRewrites(body);

  const frontmatter = {
    _schema: "default",
    title,
    post_hero: {
      heading: title,
      date: new Date().toISOString(),
      tags: [],
      author: "",
      image: "",
      image_alt: "",
    },
    thumb_image_path: "",
    thumb_image_alt: "",
    ...rest,
  };

  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlStr}---\n${rewrittenBody}\n`;
}

function sanitizeWriterAccessJson(raw) {
  const startMatch = raw.match(/"body"\s*:\s*"/);
  if (!startMatch) return raw;
  const startIdx = startMatch.index + startMatch[0].length;

  const tailMatch = raw.slice(startIdx).match(/"\s*}\s*$/);
  if (!tailMatch) return raw;
  const endIdx = startIdx + tailMatch.index;

  const before = raw.slice(0, startIdx);
  const body = raw
    .slice(startIdx, endIdx)
    .replaceAll("\\", "\\\\") // escape backslashes first so later escapes aren't double-escaped
    .replaceAll('"', "'") // swap inner double quotes for single quotes (the JSON-breaking ones)
    .replaceAll("\r", "\\r") // escape carriage returns (illegal raw in JSON strings)
    .replaceAll("\n", "\\n") // escape newlines (illegal raw in JSON strings)
    .replaceAll("\t", "\\t"); // escape tabs (illegal raw in JSON strings)
  const after = raw.slice(endIdx);

  return before + body + after;
}
