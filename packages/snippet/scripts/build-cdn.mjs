import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { minify } from 'terser';

const BUNDLE_NAME = 'search-snippet.es.js';
const MAX_BROTLI_BYTES = 24 * 1024;
const distDirectory = new URL('../dist/', import.meta.url);
const cdnDirectory = new URL('../dist-cdn/', import.meta.url);
const sourceBundle = new URL(BUNDLE_NAME, distDirectory);
const sourceMap = new URL(`${BUNDLE_NAME}.map`, distDirectory);
const cdnBundle = new URL(BUNDLE_NAME, cdnDirectory);
const cdnSourceMap = new URL(`${BUNDLE_NAME}.map`, cdnDirectory);

const [source, map, packageJson] = await Promise.all([
  readFile(sourceBundle, 'utf8'),
  readFile(sourceMap, 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const result = await minify(
  { [BUNDLE_NAME]: source },
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
      content: map,
      filename: BUNDLE_NAME,
      url: `${BUNDLE_NAME}.map`,
    },
  }
);

assert.ok(result.code, 'Terser did not produce a CDN bundle');
assert.equal(typeof result.map, 'string', 'Terser did not produce a CDN source map');
const parsedSourceMap = JSON.parse(result.map);
assert.equal(parsedSourceMap.version, 3, 'Terser produced an invalid CDN source map');
assert.equal(parsedSourceMap.file, BUNDLE_NAME, 'CDN source map points to the wrong bundle');
assert.ok(parsedSourceMap.sources.length > 0, 'CDN source map has no sources');
assert.equal(
  parsedSourceMap.sourcesContent.length,
  parsedSourceMap.sources.length,
  'CDN source map is missing source content'
);
assert.ok(
  result.code.includes(JSON.stringify(packageJson.version)),
  `CDN bundle does not contain package version ${packageJson.version}`
);

await rm(cdnDirectory, { recursive: true, force: true });
await cp(distDirectory, cdnDirectory, { recursive: true });
await Promise.all([writeFile(cdnBundle, result.code), writeFile(cdnSourceMap, result.map)]);

const registrations = new Map();
globalThis.HTMLElement = class HTMLElement {};
globalThis.customElements = {
  define(name, elementClass) {
    assert.ok(!registrations.has(name), `Custom element ${name} was registered twice`);
    registrations.set(name, elementClass);
  },
  get(name) {
    return registrations.get(name);
  },
};

const bundleExports = await import(`${cdnBundle.href}?validation=${Date.now()}`);
const expectedExports = [
  'AISearchClient',
  'ChatBubbleSnippet',
  'ChatPageSnippet',
  'DEFAULT_TRANSLATIONS',
  'SearchBarSnippet',
  'SearchModalSnippet',
  'StatsClient',
  'default',
  'mergeTranslations',
];
const expectedElements = [
  'chat-bubble-snippet',
  'chat-page-snippet',
  'search-bar-snippet',
  'search-modal-snippet',
];

for (const exportName of expectedExports) {
  assert.ok(exportName in bundleExports, `CDN bundle is missing export ${exportName}`);
}
for (const elementName of expectedElements) {
  assert.ok(registrations.has(elementName), `CDN bundle did not register ${elementName}`);
}

function sizes(value) {
  const buffer = Buffer.from(value);
  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer).byteLength,
    brotli: brotliCompressSync(buffer).byteLength,
  };
}

const sourceSizes = sizes(source);
const cdnSizes = sizes(result.code);

assert.ok(cdnSizes.raw < sourceSizes.raw, 'CDN minification did not reduce raw bundle size');
assert.ok(
  cdnSizes.brotli < sourceSizes.brotli,
  'CDN minification did not reduce Brotli bundle size'
);
assert.ok(
  cdnSizes.brotli <= MAX_BROTLI_BYTES,
  `CDN bundle exceeds the ${MAX_BROTLI_BYTES}-byte Brotli budget`
);

async function collectArtifacts(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
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

console.log('CDN bundle validated');
console.table({ source: sourceSizes, cdn: cdnSizes });
