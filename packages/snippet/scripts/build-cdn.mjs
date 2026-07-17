import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { minify } from 'terser';

const LEGACY_BUNDLE_NAME = 'search-snippet.es.js';
const MANIFEST_NAME = 'manifest.json';
const MAX_LEGACY_BROTLI_BYTES = 24 * 1024;
const MAX_SEARCH_BROTLI_BYTES = 14_400;
const MAX_CHAT_BROTLI_BYTES = 13_950;
const distDirectory = new URL('../dist/', import.meta.url);
const cdnDirectory = new URL('../dist-cdn/', import.meta.url);
const execFileAsync = promisify(execFile);

function sizes(value) {
  const buffer = Buffer.from(value);
  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer).byteLength,
    brotli: brotliCompressSync(buffer).byteLength,
  };
}

function addSizes(total, next) {
  total.raw += next.raw;
  total.gzip += next.gzip;
  total.brotli += next.brotli;
  return total;
}

async function collectArtifacts(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const artifacts = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${prefix}${entry.name}`;
      const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
      return entry.isDirectory()
        ? collectArtifacts(url, `${relativePath}/`)
        : [{ relativePath, url }];
    })
  );
  return artifacts.flat();
}

function relativeImportSpecifiers(source) {
  const specifiers = [];
  const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.\.?\/[^'"]+)\1/g;
  for (const match of source.matchAll(importPattern)) {
    specifiers.push(match[2]);
  }
  return specifiers.sort();
}

async function minifyModule({ relativePath, url }) {
  const mapUrl = new URL(`${relativePath}.map`, distDirectory);
  const [source, sourceMap] = await Promise.all([readFile(url, 'utf8'), readFile(mapUrl, 'utf8')]);
  const fileName = basename(relativePath);
  const result = await minify(
    { [relativePath]: source },
    {
      module: true,
      ecma: 2020,
      compress: {
        defaults: true,
        passes: 2,
        unsafe: false,
      },
      mangle: {
        properties: false,
      },
      format: {
        comments: false,
      },
      sourceMap: {
        content: sourceMap,
        filename: fileName,
        url: `${fileName}.map`,
      },
    }
  );

  assert.ok(result.code, `Terser did not produce ${relativePath}`);
  assert.equal(typeof result.map, 'string', `Terser did not produce a map for ${relativePath}`);
  assert.deepEqual(
    relativeImportSpecifiers(result.code),
    relativeImportSpecifiers(source),
    `Terser changed an import specifier in ${relativePath}`
  );

  const parsedSourceMap = JSON.parse(result.map);
  assert.equal(parsedSourceMap.version, 3, `${relativePath} has an invalid CDN source map`);
  assert.equal(
    parsedSourceMap.file,
    fileName,
    `${relativePath} source map points to the wrong file`
  );
  assert.equal(
    (parsedSourceMap.sourcesContent ?? []).length,
    parsedSourceMap.sources.length,
    `${relativePath} source map is missing source content`
  );

  await Promise.all([
    writeFile(new URL(relativePath, cdnDirectory), result.code),
    writeFile(new URL(`${relativePath}.map`, cdnDirectory), result.map),
  ]);

  return { relativePath, source, code: result.code, sourceMap: parsedSourceMap };
}

function manifestChunk(manifest, key) {
  const chunk = manifest[key];
  assert.ok(chunk, `Vite manifest is missing ${key}`);
  assert.equal(typeof chunk.file, 'string', `Vite manifest entry ${key} has no output file`);
  return chunk;
}

function validateManifest(manifest, artifactPaths) {
  for (const [key, chunk] of Object.entries(manifest)) {
    assert.ok(
      artifactPaths.has(chunk.file),
      `Manifest output for ${key} does not exist: ${chunk.file}`
    );
    for (const dependency of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      assert.ok(
        manifest[dependency],
        `Manifest dependency for ${key} does not exist: ${dependency}`
      );
      assert.ok(
        artifactPaths.has(manifest[dependency].file),
        `Manifest dependency output for ${key} does not exist: ${manifest[dependency].file}`
      );
    }
  }
}

function collectStaticManifestKeys(manifest, entryKey, keys = new Set()) {
  if (keys.has(entryKey)) return keys;
  keys.add(entryKey);
  for (const dependency of manifestChunk(manifest, entryKey).imports ?? []) {
    collectStaticManifestKeys(manifest, dependency, keys);
  }
  return keys;
}

function collectDeferredManifestKeys(manifest, staticKeys) {
  const deferredKeys = new Set();

  function visit(key) {
    if (staticKeys.has(key) || deferredKeys.has(key)) return;
    deferredKeys.add(key);
    const chunk = manifestChunk(manifest, key);
    for (const dependency of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      visit(dependency);
    }
  }

  for (const key of staticKeys) {
    for (const dependency of manifestChunk(manifest, key).dynamicImports ?? []) {
      visit(dependency);
    }
  }
  return deferredKeys;
}

async function graphSizes(manifest, keys) {
  const files = [...keys].map((key) => manifestChunk(manifest, key).file).sort();
  const totals = { raw: 0, gzip: 0, brotli: 0 };
  for (const file of files) {
    addSizes(totals, sizes(await readFile(new URL(file, cdnDirectory))));
  }
  return { files, totals };
}

function normalizeSourcePath(source) {
  return source.replaceAll('\\', '/').replace(/^(\.\.\/)+/, '');
}

function graphSources(manifest, keys, sourceMaps) {
  const sources = new Set();
  for (const key of keys) {
    const file = manifestChunk(manifest, key).file;
    const sourceMap = sourceMaps.get(file);
    assert.ok(sourceMap, `CDN output is missing a parsed source map for ${file}`);
    for (const source of sourceMap.sources) {
      sources.add(normalizeSourcePath(source));
    }
  }
  return sources;
}

function assertLazyBoundary({
  name,
  source,
  dynamicKey,
  initialKeys,
  deferredKeys,
  initialSources,
  deferredSources,
}) {
  assert.ok(manifestChunk(manifest, dynamicKey).isDynamicEntry, `${name} is not a dynamic entry`);
  assert.ok(!initialKeys.has(dynamicKey), `${name} is present in the initial manifest graph`);
  assert.ok(deferredKeys.has(dynamicKey), `${name} is not reachable through a dynamic import`);
  assert.ok(!initialSources.has(source), `${source} is present in the initial output`);
  assert.ok(deferredSources.has(source), `${source} is missing from the deferred output`);
}

async function validateEntry(
  name,
  relativePath,
  expectedExports,
  expectedElements,
  blockedArtifacts = []
) {
  const entryUrl = new URL(relativePath, cdnDirectory);
  const validationScript = `
    import assert from 'node:assert/strict';
    const [entryUrl, expectedExportsJson, expectedElementsJson, name] = process.argv.slice(1);
    const expectedExports = JSON.parse(expectedExportsJson);
    const expectedElements = JSON.parse(expectedElementsJson);
    const registrations = new Map();
    globalThis.HTMLElement = class HTMLElement {};
    globalThis.customElements = {
      define(elementName, elementClass) {
        assert.ok(!registrations.has(elementName), name + ' registered ' + elementName + ' twice');
        registrations.set(elementName, elementClass);
      },
      get(elementName) {
        return registrations.get(elementName);
      },
    };
    const entryExports = await import(entryUrl + '?validation=' + Date.now());
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(
      Object.keys(entryExports).sort(),
      expectedExports.sort(),
      name + ' exports do not match the expected public API',
    );
    assert.deepEqual(
      [...registrations.keys()].sort(),
      expectedElements.sort(),
      name + ' custom element registrations do not match',
    );
  `;
  const blocked = blockedArtifacts.map((relativePath) => ({
    original: new URL(relativePath, cdnDirectory),
    temporary: new URL(`${relativePath}.blocked`, cdnDirectory),
  }));
  await Promise.all(blocked.map(({ original, temporary }) => rename(original, temporary)));
  try {
    await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        validationScript,
        entryUrl.href,
        JSON.stringify(expectedExports),
        JSON.stringify(expectedElements),
        name,
      ],
      { maxBuffer: 1024 * 1024 }
    );
  } catch (error) {
    const details = error.stderr || error.message;
    assert.fail(`${name} validation failed:\n${details}`);
  } finally {
    await Promise.all(blocked.map(({ original, temporary }) => rename(temporary, original)));
  }
}

const [packageJson, manifest, sourceArtifacts] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL(MANIFEST_NAME, distDirectory), 'utf8').then(JSON.parse),
  collectArtifacts(distDirectory),
]);
const artifactPaths = new Set(sourceArtifacts.map(({ relativePath }) => relativePath));
for (const requiredArtifact of [
  'main.d.ts',
  'search.d.ts',
  'chat.d.ts',
  LEGACY_BUNDLE_NAME,
  'search-snippet.umd.js',
  'search-snippet.search.es.js',
  'search-snippet.chat.es.js',
]) {
  assert.ok(artifactPaths.has(requiredArtifact), `Build output is missing ${requiredArtifact}`);
}
validateManifest(manifest, artifactPaths);

await rm(cdnDirectory, { recursive: true, force: true });
await cp(distDirectory, cdnDirectory, { recursive: true });

const modules = sourceArtifacts.filter(
  ({ relativePath }) => relativePath.endsWith('.js') && !relativePath.endsWith('.umd.js')
);
for (const { relativePath } of modules) {
  assert.ok(
    artifactPaths.has(`${relativePath}.map`),
    `JavaScript module ${relativePath} has no matching source map`
  );
}
const minifiedModules = await Promise.all(modules.map(minifyModule));
const sourceMaps = new Map(
  minifiedModules.map(({ relativePath, sourceMap }) => [relativePath, sourceMap])
);
const legacyModule = minifiedModules.find(
  ({ relativePath }) => relativePath === LEGACY_BUNDLE_NAME
);
assert.ok(legacyModule, `CDN output is missing ${LEGACY_BUNDLE_NAME}`);
assert.ok(
  legacyModule.code.includes(JSON.stringify(packageJson.version)),
  `CDN bundle does not contain package version ${packageJson.version}`
);
assert.deepEqual(
  relativeImportSpecifiers(legacyModule.code),
  [],
  'Legacy ESM bundle has an unresolved chunk dependency'
);
const legacyUmd = await readFile(new URL('search-snippet.umd.js', cdnDirectory), 'utf8');
assert.deepEqual(
  relativeImportSpecifiers(legacyUmd),
  [],
  'Legacy UMD bundle has an unresolved chunk dependency'
);

const allElements = [
  'chat-bubble-snippet',
  'chat-page-snippet',
  'search-bar-snippet',
  'search-modal-snippet',
];
await validateEntry(
  'legacy root',
  LEGACY_BUNDLE_NAME,
  [
    'AISearchClient',
    'ChatBubbleSnippet',
    'ChatPageSnippet',
    'DEFAULT_TRANSLATIONS',
    'SearchBarSnippet',
    'SearchModalSnippet',
    'StatsClient',
    'default',
    'mergeTranslations',
  ],
  allElements
);
await validateEntry(
  'search',
  'search-snippet.search.es.js',
  ['SearchBarSnippet', 'SearchModalSnippet'],
  ['search-bar-snippet', 'search-modal-snippet'],
  [manifestChunk(manifest, 'src/components/search-modal-implementation.ts').file]
);
await validateEntry(
  'chat',
  'search-snippet.chat.es.js',
  ['ChatBubbleSnippet', 'ChatPageSnippet'],
  ['chat-bubble-snippet', 'chat-page-snippet'],
  [manifestChunk(manifest, 'src/components/chat-view.ts').file]
);

const searchKeys = collectStaticManifestKeys(manifest, 'src/entries/search.ts');
const chatKeys = collectStaticManifestKeys(manifest, 'src/entries/chat.ts');
const searchDeferredKeys = collectDeferredManifestKeys(manifest, searchKeys);
const chatDeferredKeys = collectDeferredManifestKeys(manifest, chatKeys);
const [searchGraph, searchDeferredGraph, chatGraph, chatDeferredGraph] = await Promise.all([
  graphSizes(manifest, searchKeys),
  graphSizes(manifest, searchDeferredKeys),
  graphSizes(manifest, chatKeys),
  graphSizes(manifest, chatDeferredKeys),
]);
const searchSources = graphSources(manifest, searchKeys, sourceMaps);
const searchDeferredSources = graphSources(manifest, searchDeferredKeys, sourceMaps);
const chatSources = graphSources(manifest, chatKeys, sourceMaps);
const chatDeferredSources = graphSources(manifest, chatDeferredKeys, sourceMaps);

assertLazyBoundary({
  name: 'Search modal implementation',
  source: 'src/components/search-modal-implementation.ts',
  dynamicKey: 'src/components/search-modal-implementation.ts',
  initialKeys: searchKeys,
  deferredKeys: searchDeferredKeys,
  initialSources: searchSources,
  deferredSources: searchDeferredSources,
});
assertLazyBoundary({
  name: 'ChatView',
  source: 'src/components/chat-view.ts',
  dynamicKey: 'src/components/chat-view.ts',
  initialKeys: chatKeys,
  deferredKeys: chatDeferredKeys,
  initialSources: chatSources,
  deferredSources: chatDeferredSources,
});
assert.ok(
  !chatSources.has('src/utils/markdown.ts'),
  'Markdown rendering is present in the chat initial output'
);
assert.ok(
  chatDeferredSources.has('src/utils/markdown.ts'),
  'Markdown rendering is missing from the chat deferred output'
);
const legacySourceSizes = sizes(legacyModule.source);
const legacyCdnSizes = sizes(legacyModule.code);

assert.ok(legacyCdnSizes.raw < legacySourceSizes.raw, 'CDN minification did not reduce raw size');
assert.ok(
  legacyCdnSizes.brotli < legacySourceSizes.brotli,
  'CDN minification did not reduce Brotli size'
);
assert.ok(
  legacyCdnSizes.brotli <= MAX_LEGACY_BROTLI_BYTES,
  `Legacy root exceeds the ${MAX_LEGACY_BROTLI_BYTES}-byte Brotli budget`
);
for (const [name, graph] of [
  ['Search', searchGraph],
  ['Chat', chatGraph],
]) {
  assert.ok(
    graph.totals.raw <= legacyCdnSizes.raw * 0.8,
    `${name} initial graph is not at least 20% smaller than the legacy root`
  );
}
assert.ok(
  searchGraph.totals.brotli <= MAX_SEARCH_BROTLI_BYTES,
  `Search initial graph exceeds the ${MAX_SEARCH_BROTLI_BYTES}-byte Brotli budget`
);
assert.ok(
  chatGraph.totals.brotli <= MAX_CHAT_BROTLI_BYTES,
  `Chat initial graph exceeds the ${MAX_CHAT_BROTLI_BYTES}-byte Brotli budget`
);

const artifacts = await collectArtifacts(cdnDirectory);
const checksums = Object.fromEntries(
  await Promise.all(
    artifacts.map(async ({ relativePath, url }) => [
      relativePath,
      createHash('sha256')
        .update(await readFile(url))
        .digest('hex'),
    ])
  )
);
await writeFile(
  new URL('release-manifest.json', cdnDirectory),
  `${JSON.stringify({ version: packageJson.version, artifacts: checksums }, null, 2)}\n`
);

console.log('CDN bundles validated');
console.table({
  legacySource: legacySourceSizes,
  legacyRoot: legacyCdnSizes,
  searchInitial: searchGraph.totals,
  searchDeferred: searchDeferredGraph.totals,
  chatInitial: chatGraph.totals,
  chatDeferred: chatDeferredGraph.totals,
});
console.table({
  search: {
    initial: searchGraph.files.join(', '),
    deferred: searchDeferredGraph.files.join(', ') || '(none)',
  },
  chat: {
    initial: chatGraph.files.join(', '),
    deferred: chatDeferredGraph.files.join(', ') || '(none)',
  },
});
