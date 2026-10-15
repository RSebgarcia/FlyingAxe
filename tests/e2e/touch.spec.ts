import { expect, test } from '@playwright/test';

type Game = {
  pointer: { down: boolean; type: string | null; world: { x: number; y: number; z: number } };
};

test.beforeEach(async ({ page }) => {
  await page.goto('./?perf');
  await expect(page.locator('html')).toHaveAttribute('data-ready', /webgpu|webgl2/, { timeout: 45_000 });
});

test('a drag grabs and lets go, on mouse or finger', async ({ page, isMobile }) => {
  const box = (await page.locator('#game').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const state = () => page.evaluate(() => {
    const g = (window as unknown as { flyingAxe: Game }).flyingAxe;
    return { down: g.pointer.down, type: g.pointer.type, ...g.pointer.world };
  });

  if (isMobile) {
    // Playwright has no touch drag, so drive the canvas with real touch pointer events.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', cx, cy);
    await touch('touchMove', cx, cy - 80);
    const held = await state();
    expect(held).toMatchObject({ down: true, type: 'touch' });
    expect(held.x).toBeCloseTo(0, 5);
    await touch('touchEnd', cx, cy - 80);
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 80);
    expect(await state()).toMatchObject({ down: true, type: 'mouse' });
    await page.mouse.up();
  }
  expect((await state()).down).toBe(false);
});

test('the stump stays in frame on this screen', async ({ page }) => {
  const ndc = await page.evaluate(() => {
    type V3 = { project: (camera: unknown) => { x: number; y: number } };
    const { world } = (window as unknown as {
      flyingAxe: { world: { camera: { position: { clone: () => V3 } }; stump: { getWorldPosition: (v: V3) => V3 } } };
    }).flyingAxe;
    // Reuse three's Vector3 through the camera instead of importing three here.
    return world.stump.getWorldPosition(world.camera.position.clone()).project(world.camera);
  });
  expect(Math.abs(ndc.x)).toBeLessThan(0.9);
  expect(Math.abs(ndc.y)).toBeLessThan(0.9);
});

test('the perf meter shows up with ?perf', async ({ page }) => {
  await expect(page.locator('#perf')).toBeVisible();
  await expect(page.locator('#perf')).toContainText('fps');
});
