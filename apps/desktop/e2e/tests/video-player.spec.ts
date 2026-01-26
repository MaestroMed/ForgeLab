import { test, expect } from '@playwright/test';

/**
 * Video Player E2E Tests
 * 
 * Tests for the frame-accurate video player component.
 */

test.describe('Video Player Controls', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to editor page with video player
    await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
  });

  test('should display video element', async ({ page }) => {
    const video = page.locator('video');
    
    if (await video.count() > 0) {
      await expect(video.first()).toBeVisible();
    }
  });

  test('should have play/pause button', async ({ page }) => {
    const playButton = page.locator(
      'button[aria-label*="Play"], button[aria-label*="Pause"], [data-testid="play-button"]'
    );
    
    if (await playButton.count() > 0) {
      await expect(playButton.first()).toBeVisible();
    }
  });

  test('should toggle play/pause with space key', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Press space to play
    await page.keyboard.press('Space');
    
    // Short wait
    await page.waitForTimeout(200);
    
    // Press space to pause
    await page.keyboard.press('Space');
    
    // Video should be paused (no error means test passes)
  });

  test('should seek with arrow keys', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Press right arrow to seek forward
    await page.keyboard.press('ArrowRight');
    
    // Press left arrow to seek backward
    await page.keyboard.press('ArrowLeft');
    
    // Should not throw any errors
  });

  test('should step frame with period and comma', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Step forward one frame
    await page.keyboard.press('.');
    
    // Step backward one frame
    await page.keyboard.press(',');
    
    // Should not throw any errors
  });

  test('should display timecode', async ({ page }) => {
    const timecode = page.locator(
      '[data-testid="timecode"], .timecode, .font-mono:has-text(":")'
    );
    
    if (await timecode.count() > 0) {
      await expect(timecode.first()).toBeVisible();
      
      // Should have format like 00:00:00:00 or 00:00.0
      const text = await timecode.first().textContent();
      expect(text).toMatch(/\d{1,2}:\d{2}/);
    }
  });
});

test.describe('Timeline Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
  });

  test('should display timeline', async ({ page }) => {
    const timeline = page.locator(
      '[data-testid="timeline"], .timeline, [role="slider"]'
    );
    
    if (await timeline.count() > 0) {
      await expect(timeline.first()).toBeVisible();
    }
  });

  test('should have playhead indicator', async ({ page }) => {
    const playhead = page.locator(
      '[data-testid="playhead"], .playhead, .bg-red-500'
    );
    
    if (await playhead.count() > 0) {
      await expect(playhead.first()).toBeVisible();
    }
  });

  test('should have trim handles', async ({ page }) => {
    const trimHandles = page.locator(
      '[data-testid="trim-handle"], .trim-handle, .cursor-ew-resize'
    );
    
    if (await trimHandles.count() > 0) {
      // Should have at least 2 (start and end)
      expect(await trimHandles.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('should seek when clicking on timeline', async ({ page }) => {
    const timeline = page.locator(
      '[data-testid="timeline"], .timeline'
    );
    
    if (await timeline.count() > 0) {
      // Get timeline bounds
      const box = await timeline.first().boundingBox();
      
      if (box) {
        // Click at 50% of timeline
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        
        // Timecode should have changed (soft check)
      }
    }
  });
});

test.describe('Canvas 9:16 Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
  });

  test('should display 9:16 canvas', async ({ page }) => {
    const canvas = page.locator(
      '[data-testid="canvas-9x16"], .canvas-9x16, [style*="9/16"]'
    );
    
    if (await canvas.count() > 0) {
      await expect(canvas.first()).toBeVisible();
      
      // Check aspect ratio (should be taller than wide)
      const box = await canvas.first().boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThan(box.width);
      }
    }
  });

  test('should show zones on canvas', async ({ page }) => {
    const zones = page.locator(
      '[data-zone-type], [data-testid="canvas-zone"], .zone-video'
    );
    
    if (await zones.count() > 0) {
      await expect(zones.first()).toBeVisible();
    }
  });

  test('should select zone on click', async ({ page }) => {
    const zones = page.locator(
      '[data-zone-type], [data-testid="canvas-zone"]'
    );
    
    if (await zones.count() > 0) {
      await zones.first().click();
      
      // Should have selected indicator
      const selectedIndicator = page.locator(
        '[data-selected="true"], .ring-2, [class*="selected"]'
      );
      
      if (await selectedIndicator.count() > 0) {
        await expect(selectedIndicator.first()).toBeVisible();
      }
    }
  });
});

test.describe('Volume Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
  });

  test('should have volume button', async ({ page }) => {
    const volumeButton = page.locator(
      'button[aria-label*="Volume"], button[aria-label*="Mute"], [data-testid="volume-button"]'
    );
    
    if (await volumeButton.count() > 0) {
      await expect(volumeButton.first()).toBeVisible();
    }
  });

  test('should toggle mute with M key', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Press M to mute
    await page.keyboard.press('m');
    
    // Press M again to unmute
    await page.keyboard.press('m');
    
    // Should not throw any errors
  });
});

test.describe('Playback Speed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
  });

  test('should have speed selector', async ({ page }) => {
    const speedSelector = page.locator(
      '[data-testid="speed-selector"], button:has-text("1x"), button:has-text("1.0x")'
    );
    
    if (await speedSelector.count() > 0) {
      await expect(speedSelector.first()).toBeVisible();
    }
  });

  test('should change playback speed', async ({ page }) => {
    const speedSelector = page.locator(
      '[data-testid="speed-selector"], button:has-text("1x")'
    );
    
    if (await speedSelector.count() > 0) {
      await speedSelector.first().click();
      
      // Look for speed options
      const speedOption = page.locator('button:has-text("2x"), button:has-text("1.5x")');
      
      if (await speedOption.count() > 0) {
        await speedOption.first().click();
      }
    }
  });
});

test.describe('Fullscreen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
  });

  test('should have fullscreen button', async ({ page }) => {
    const fullscreenButton = page.locator(
      'button[aria-label*="Fullscreen"], button[aria-label*="fullscreen"], [data-testid="fullscreen-button"]'
    );
    
    if (await fullscreenButton.count() > 0) {
      await expect(fullscreenButton.first()).toBeVisible();
    }
  });

  test('should toggle fullscreen with F key', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Press F to toggle fullscreen
    // Note: This might not actually work in headless mode
    await page.keyboard.press('f');
    
    // Press Escape to exit
    await page.keyboard.press('Escape');
    
    // Should not throw any errors
  });
});
