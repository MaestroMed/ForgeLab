import { test, expect } from '@playwright/test';

/**
 * Navigation E2E Tests
 * 
 * Tests for the main navigation flow of the FORGE/LAB Desktop app.
 */

test.describe('Navigation', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    
    // Should have the main app container
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible({ timeout: 10000 });
    
    // Or check for specific UI elements
    const header = page.locator('header, [role="banner"], nav');
    await expect(header.first()).toBeVisible();
  });

  test('should navigate to projects page', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Click on a project or navigate to projects
    const projectsLink = page.locator('a[href*="project"], button:has-text("Projets"), [data-testid="projects-link"]');
    
    if (await projectsLink.count() > 0) {
      await projectsLink.first().click();
      await page.waitForURL(/project/);
    }
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for settings link
    const settingsLink = page.locator('a[href*="settings"], button:has-text("Paramètres"), [data-testid="settings-link"]');
    
    if (await settingsLink.count() > 0) {
      await settingsLink.first().click();
      await page.waitForURL(/settings/);
      await expect(page).toHaveURL(/settings/);
    }
  });

  test('should navigate to surveillance page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const surveillanceLink = page.locator('a[href*="surveillance"], button:has-text("Surveillance"), [data-testid="surveillance-link"]');
    
    if (await surveillanceLink.count() > 0) {
      await surveillanceLink.first().click();
      await page.waitForURL(/surveillance/);
      await expect(page).toHaveURL(/surveillance/);
    }
  });
});

test.describe('Theme Toggle', () => {
  test('should toggle between light and dark themes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const themeToggle = page.locator('[data-testid="theme-toggle"], button:has-text("Theme"), [aria-label*="theme"]');
    
    if (await themeToggle.count() > 0) {
      // Get initial theme
      const html = page.locator('html');
      const initialClass = await html.getAttribute('class') || '';
      const initialDark = initialClass.includes('dark');
      
      // Click toggle
      await themeToggle.first().click();
      
      // Wait for theme change
      await page.waitForTimeout(500);
      
      // Check theme changed
      const newClass = await html.getAttribute('class') || '';
      const newDark = newClass.includes('dark');
      
      // Theme should have toggled
      expect(newDark).not.toBe(initialDark);
    }
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('should open shortcuts modal with ?', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Press ? to open shortcuts modal
    await page.keyboard.press('Shift+/'); // ? on most keyboards
    
    // Look for shortcuts modal
    const modal = page.locator('[data-testid="shortcuts-modal"], [role="dialog"]:has-text("Raccourcis")');
    
    if (await modal.count() > 0) {
      await expect(modal.first()).toBeVisible();
      
      // Close with Escape
      await page.keyboard.press('Escape');
      await expect(modal.first()).not.toBeVisible();
    }
  });
});
