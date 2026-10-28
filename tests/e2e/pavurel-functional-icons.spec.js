import { expect,test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('../../docs/brand-reference/pavurel-icons/v0.1/manifest.json',import.meta.url),'utf8'));
for (const language of ['de','en']) test(`canonical functional icons decode in every variant and retain visible names and keyboard semantics in ${language}`,async({ page },testInfo)=>{
  await page.route('**/platform-admin/',route=>route.fulfill({ contentType: 'text/html',body:
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canonical icon fixture</title>'
    + '<link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css"><main id="iconFixture"></main></html>' }));
  await page.goto('/platform-admin/');
  await page.addStyleTag({ content: '#iconFixture section { padding: var(--space-3); display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:var(--space-2); }'
    + '#iconFixture h2 { grid-column:1/-1; } #iconFixture .inverse { background:var(--color-sidebar); color:var(--color-on-dark); }'
    + '#iconFixture button { text-align:start; white-space:normal; } #iconFixture .inverse button { background:var(--color-sidebar); color:var(--color-on-dark); border-color:var(--color-on-dark); }' });
  await page.evaluate(async({ icons,language })=>{
    const { pavurelFunctionalIcon }=await import('/src/core/pavurel-functional-icon.js');
    const { el,button }=await import('/src/core/ui.js');
    document.documentElement.lang=language;window.iconFixtureActivations=0;
    for (const variant of ['light','mono','inverse']) {
      const section=el('section',{ className: variant },[el('h2',{ text: variant })]);
      for (const icon of icons) {
        const control=button('',{ className: 'secondary pavurel-icon-label' });
        control.append(pavurelFunctionalIcon(icon.name,{ variant }),el('span',{ text: icon.meaning[language] }));
        control.addEventListener('click',()=>window.iconFixtureActivations+=1);section.append(control);
      }
      document.querySelector('#iconFixture').append(section);
    }
    await Promise.all([...document.querySelectorAll('#iconFixture img')].map(image=>image.decode()));
  },{ icons: manifest.icons,language });
  const images=page.locator('#iconFixture img');await expect(images).toHaveCount(96);
  expect(await images.evaluateAll(nodes=>nodes.every(node=>node.naturalWidth===24 && node.naturalHeight===24
    && node.alt==='' && node.getAttribute('aria-hidden')==='true'))).toBe(true);
  await expect(page.getByRole('img')).toHaveCount(0);
  const inverse=page.locator('#iconFixture .inverse');
  const inverseBackground=await inverse.evaluate(node=>getComputedStyle(node).backgroundColor);
  await expect(inverse.getByRole('button').first()).toHaveCSS('background-color',inverseBackground);
  await expect(inverse.getByRole('button').first()).not.toHaveCSS('color',inverseBackground);
  const first=page.locator('#iconFixture button').first();
  await expect(first).toHaveAccessibleName(manifest.icons[0].meaning[language]);
  await first.focus();await page.keyboard.press('Enter');expect(await page.evaluate(()=>window.iconFixtureActivations)).toBe(1);
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await testInfo.attach(`pavurel-icons-${language}-${width}`,{ body: await page.screenshot({ fullPage: true }),contentType: 'image/png' });
  }
});
