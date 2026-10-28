import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const previousDocument=globalThis.document;
globalThis.document={ documentElement: { lang: 'en' } };
const { PAVUREL_ICON_NAMES,pavurelFunctionalIcon }=await import('../src/core/pavurel-functional-icon.js');
if (previousDocument===undefined) delete globalThis.document; else globalThis.document=previousDocument;

const source=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('functional icon names, immutable geometries and all variants match the canonical manifest and both sealed Platform inventories',async()=>{
  const manifest=JSON.parse(await source('docs/brand-reference/pavurel-icons/v0.1/manifest.json'));
  assert.deepEqual([...PAVUREL_ICON_NAMES].sort(),manifest.icons.map(icon=>icon.name).sort());
  const paths=[];
  for (const icon of manifest.icons) for (const variant of ['light','mono','inverse']) {
    const expected=icon.files[variant],path=`assets/brand/pavurel-icons/v0.1/${variant}/${icon.name}.svg`;
    assert.equal(expected.path,`${variant}/${icon.name}.svg`);
    const svg=await source(path);paths.push(path);
    assert.equal(createHash('sha256').update(svg).digest('hex'),expected.sha256);
    assert.match(svg,/viewBox="0 0 24 24"/);
    assert.doesNotMatch(svg,/<(?:script|foreignObject|style)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|url\s*\(/i);
  }
  assert.equal(paths.length,96);
  for (const profile of ['production','demo']) {
    const inventory=JSON.parse(await source(`deployment/platform-admin-${profile}.json`));
    for (const path of paths) assert.ok(inventory.files.includes(path),path);
    assert.ok(inventory.files.includes('src/core/pavurel-functional-icon.js'));
  }
});

test('decorative icon boundary rejects unknown names, traversal, external origins and variants before DOM use',()=>{
  for (const name of ['../system','https://example.test/icon','SYSTEM','',null,{},'__proto__']) {
    assert.throws(()=>pavurelFunctionalIcon(name),/PAVUREL_ICON_INVALID/);
  }
  for (const variant of ['../light','currentColor','https://example.test',null,{}]) {
    assert.throws(()=>pavurelFunctionalIcon('system',{ variant }),/PAVUREL_ICON_INVALID/);
  }
});
