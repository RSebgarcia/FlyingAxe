import { expect, test } from '@playwright/test';

test('loads the scene and renders it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', /webgpu|webgl2/, { timeout: 45_000 });
  await expect(page.locator('#score')).toHaveText('cortes: 0');

  // The scene graph is what step 1 promises: ground and stump from Blender, the axe, a log.
  const names = await page.evaluate(() => {
    const { world } = (window as unknown as { flyingAxe: { world: Record<string, { name: string }> } }).flyingAxe;
    return [world.ground.name, world.stump.name, world.axe.name, world.log.name];
  });
  expect(names).toEqual(['Piso-col', 'Tocon-col', 'Axe', 'Log']);

  // Give it a few frames, then make sure the canvas is not a flat color.
  await page.waitForTimeout(1500);
  const shot = await page.locator('#game').screenshot({ path: test.info().outputPath('scene.png') });
  expect(shot.byteLength).toBeGreaterThan(30_000);
  expect(errors).toEqual([]);
});
