// Builds the Web Passport extension.
//
// All entrypoints are bundled as ESM:
//   - the service worker is registered with `"type": "module"` in the manifest
//   - extension pages load their bundle via <script type="module">
// The overlay content script (M2) cannot be ESM and will get its own IIFE build.
//
// Entry files live at src/*.{ts,tsx} with unique basenames so dist outputs are
// predictable: dist/service-worker.js, dist/checkpoint.js, dist/popup.js,
// dist/offscreen.js

const watch = process.argv.includes("--watch");

const esmEntrypoints = [
  "./src/service-worker.ts",
  "./src/offscreen.ts",
];

const iifeEntrypoints = [
  "./src/checkpoint.tsx",
  "./src/popup.tsx",
  "./src/app.tsx",
  "./src/overlay.tsx",
];

// Copy bundled persona packages into dist/personas/ and dist/assets/personas/
// so the extension can fetch them at runtime. Source of truth is public/assets/personas/.
async function copyPersonas() {
  const { cp, mkdir, readdir, writeFile } = await import("node:fs/promises");
  const src = "./public/assets/personas";
  const dest = "./dist/personas";
  const assetsDest = "./dist/assets/personas";
  await mkdir(dest, { recursive: true });
  await mkdir(assetsDest, { recursive: true });
  let names: string[] = [];
  try {
    names = (await readdir(src, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const index: Array<{ id: string; name: string; description?: string; author?: string }> = [];
  for (const name of names) {
    if (!(await Bun.file(`${src}/${name}/persona.json`).exists())) continue;
    await cp(`${src}/${name}`, `${dest}/${name}`, { recursive: true });
    await cp(`${src}/${name}`, `${assetsDest}/${name}`, { recursive: true });
    const manifest = (await Bun.file(`${src}/${name}/persona.json`).json()) as {
      id: string;
      name: string;
      description?: string;
      author?: string;
    };
    index.push(manifest);
  }
  await writeFile(`${dest}/index.json`, JSON.stringify(index, null, 2));
  await writeFile(`${assetsDest}/index.json`, JSON.stringify(index, null, 2));
  return index;
}

// Build-time environment: debug (default) exposes dev-only UI; prod hides it.
const WEBPASSPORT_ENV = process.env.WEBPASSPORT_ENV ?? "debug";

async function build() {
  // 1. ESM: service worker + offscreen (must be modules)
  const esm = await Bun.build({
    entrypoints: esmEntrypoints,
    outdir: "./dist",
    target: "browser",
    format: "esm",
    naming: "[name].[ext]",
    minify: false,
    sourcemap: "inline",
    define: {
      "process.env.WEBPASSPORT_ENV": JSON.stringify(WEBPASSPORT_ENV),
    },
  });
  if (!esm.success) {
    console.error("ESM build failed:");
    for (const log of esm.logs) console.error(log);
    if (!watch) process.exit(1);
    return;
  }

  // 2. IIFE: UI pages + overlay. IIFE deduplicates React across deps correctly.
  const iife = await Bun.build({
    entrypoints: iifeEntrypoints,
    outdir: "./dist",
    target: "browser",
    format: "iife",
    naming: "[name].[ext]",
    minify: false,
    sourcemap: "inline",
    define: {
      "process.env.WEBPASSPORT_ENV": JSON.stringify(WEBPASSPORT_ENV),
    },
  });
  if (!iife.success) {
    console.error("IIFE build failed:");
    for (const log of iife.logs) console.error(log);
    if (!watch) process.exit(1);
    return;
  }

  const index = await copyPersonas();
  console.log(
    `Build complete (${esm.outputs.length + iife.outputs.length} outputs, ${index?.length ?? 0} personas, env=${WEBPASSPORT_ENV})`,
  );
}

await build();

if (watch) {
  console.log("Watching src/ for changes...");
  const watcher = (await import("node:fs")).watch(
    "./src",
    { recursive: true },
    () => build(),
  );
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

export {};
