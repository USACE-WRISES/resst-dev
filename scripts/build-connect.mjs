// Root-base build of the same app for the Posit Connect Cloud test mirror.
//
// Output: connect-cloud/ (gitignored) — except connect-cloud/.posit/, which
// holds Posit Publisher's configuration and deployment record and must survive
// every rebuild. Vite's emptyOutDir would delete it (it spares .git only), so
// this script clears the directory itself and builds with emptyOutDir: false.
//
// GitHub Pages (https://usace-wrises.github.io/resst-dev/) stays canonical.
// This build differs from the Pages build in exactly one setting, base: "/",
// because Connect Cloud serves each content item at the root of its own
// hostname. Everything else comes from vite.config.ts. See docs/DEPLOYMENT.md,
// "Second host: Posit Connect Cloud".
import { build } from "vite";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = "connect-cloud";
const KEEP = new Set([".posit"]);

// Posit Publisher's bundler drops every file named manifest.json (that is the
// name of Posit's own bundle manifest), so the deployed mirror answered 404 for
// data/manifest.json while its siblings loaded. The app fetches that file from
// exactly one place (src/lib/data.ts); this build renames the file and points
// the bundle at the new name. sediment/manifest.json is a build artifact the
// app never requests, so it is left alone (Publisher skips it harmlessly).
const MANIFEST_SRC = "data/manifest.json";
const MANIFEST_OUT = "data/data-manifest.json";
let manifestRewrites = 0;
const renameManifestFetch = {
  name: "resst-connect-rename-manifest",
  transform(code, id) {
    if (!/[\\/]src[\\/]lib[\\/]data\.ts$/.test(id)) return null;
    const needle = `"${MANIFEST_SRC}"`;
    if (!code.includes(needle)) return null;
    manifestRewrites += 1;
    return { code: code.replaceAll(needle, `"${MANIFEST_OUT}"`), map: null };
  },
};

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) {
  if (!KEEP.has(name)) rmSync(join(OUT, name), { recursive: true, force: true });
}

await build({
  configFile: "vite.config.ts",
  base: "/",
  plugins: [renameManifestFetch],
  build: { outDir: OUT, emptyOutDir: false },
});

if (manifestRewrites !== 1) fail(`expected to rewrite the ${MANIFEST_SRC} fetch once, did it ${manifestRewrites} times`);
renameSync(join(OUT, MANIFEST_SRC), join(OUT, MANIFEST_OUT));

// Guards: the Pages base must not survive into this bundle. Vite inlines
// import.meta.env.BASE_URL as the quoted literal "/resst-dev/" and rewrites
// index.html's root-absolute paths to ="/resst-dev/...", so both appear as a
// quote followed by /resst-dev/. The canonical citation
// "https://usace-wrises.github.io/resst-dev/" and the GitHub repository links
// carry /resst-dev/ inside a longer URL and do not match.
const html = readFileSync(join(OUT, "index.html"), "utf8");
if (!html.includes('src="/assets/index-')) {
  fail("index.html does not reference /assets/: the base override did not apply");
}
const bundles = readdirSync(join(OUT, "assets"))
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => join("assets", f));
const offenders = ["index.html", ...bundles].filter((rel) =>
  readFileSync(join(OUT, rel), "utf8").includes('"/resst-dev/'),
);
if (offenders.length) fail(`still carry the Pages base "/resst-dev/": ${offenders.join(", ")}`);
if (!existsSync(join(OUT, "fonts", "Noto Sans Regular", "0-255.pbf"))) {
  fail("glyphs are missing from the bundle (public/fonts was not copied)");
}
const js = bundles.filter((rel) => rel.endsWith(".js")).map((rel) => readFileSync(join(OUT, rel), "utf8")).join("\n");
if (js.includes(MANIFEST_SRC)) fail(`the bundle still fetches ${MANIFEST_SRC}, which Publisher will not upload`);
if (!js.includes(MANIFEST_OUT) || !existsSync(join(OUT, MANIFEST_OUT))) {
  fail(`the bundle and the file must both use ${MANIFEST_OUT}`);
}
console.log(`connect-cloud/ built with base "/" (${bundles.length} bundles). Deploy it with Posit Publisher.`);

function fail(msg) {
  console.error(`build-connect: ${msg}`);
  process.exit(1);
}
