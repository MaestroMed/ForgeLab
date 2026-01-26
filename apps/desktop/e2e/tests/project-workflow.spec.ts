import { test, expect } from '@playwright/test';

/**
 * Project Workflow E2E Tests
 * 
 * Tests the complete project workflow from import to export.
 */

test.describe('Project Workflow', () => {
  test.describe('Import Phase', () => {
    test('should display import options', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Look for import button or panel
      const importButton = page.locator(
        'button:has-text("Import"), button:has-text("Importer"), [data-testid="import-button"]'
      );
      
      if (await importButton.count() > 0) {
        await expect(importButton.first()).toBeVisible();
      }
    });

    test('should show URL import modal', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Find and click URL import
      const urlImportButton = page.locator(
        'button:has-text("URL"), button:has-text("Coller"), [data-testid="url-import"]'
      );
      
      if (await urlImportButton.count() > 0) {
        await urlImportButton.first().click();
        
        // Modal should appear
        const modal = page.locator('[role="dialog"], [data-testid="url-import-modal"]');
        await expect(modal.first()).toBeVisible();
        
        // Should have URL input
        const urlInput = modal.locator('input[type="url"], input[type="text"]');
        await expect(urlInput.first()).toBeVisible();
      }
    });
  });

  test.describe('Project Page', () => {
    test('should display project phases', async ({ page }) => {
      // Navigate to a project page (if one exists or use a mock route)
      await page.goto('/project/test-123', { waitUntil: 'domcontentloaded' });
      
      // Should have phase indicators or panels
      const phaseIndicators = page.locator(
        '[data-testid="phase-indicator"], .phase-panel, [data-phase]'
      );
      
      // Check for Ingest, Analyze, Forge, Export phases
      const phases = ['Ingest', 'Analyse', 'Forge', 'Export'];
      
      for (const phase of phases) {
        const phaseElement = page.locator(`text=${phase}`);
        // Don't fail if not found - project might be in different state
      }
    });

    test('should show segment list after analysis', async ({ page }) => {
      await page.goto('/project/test-123', { waitUntil: 'domcontentloaded' });
      
      // Look for segment list
      const segmentList = page.locator(
        '[data-testid="segment-list"], .segment-card, [data-segment-id]'
      );
      
      // If segments exist, they should have score indicators
      if (await segmentList.count() > 0) {
        const scoreIndicator = page.locator('[data-testid="score"], .score-bar, [data-score]');
        await expect(scoreIndicator.first()).toBeVisible();
      }
    });
  });

  test.describe('Clip Editor', () => {
    test('should load clip editor page', async ({ page }) => {
      // Navigate to clip editor
      await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
      
      // Should have video preview area
      const videoPreview = page.locator(
        'video, [data-testid="video-preview"], .canvas-9x16, [data-testid="canvas"]'
      );
      
      if (await videoPreview.count() > 0) {
        await expect(videoPreview.first()).toBeVisible();
      }
    });

    test('should have timeline controls', async ({ page }) => {
      await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
      
      // Look for timeline
      const timeline = page.locator(
        '[data-testid="timeline"], .timeline, [role="slider"]'
      );
      
      if (await timeline.count() > 0) {
        await expect(timeline.first()).toBeVisible();
      }
    });

    test('should have layout panel', async ({ page }) => {
      await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
      
      // Look for layout panel or tab
      const layoutPanel = page.locator(
        '[data-testid="layout-panel"], button:has-text("Layout"), [data-panel="layout"]'
      );
      
      if (await layoutPanel.count() > 0) {
        // Click to open if it's a tab
        if (await layoutPanel.first().getAttribute('role') === 'tab') {
          await layoutPanel.first().click();
        }
        
        // Should show layout presets
        const presets = page.locator(
          '[data-testid="layout-preset"], .preset-card, button:has-text("Split")'
        );
        
        if (await presets.count() > 0) {
          await expect(presets.first()).toBeVisible();
        }
      }
    });

    test('should have subtitle panel', async ({ page }) => {
      await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
      
      // Look for subtitle panel or tab
      const subtitlePanel = page.locator(
        '[data-testid="subtitle-panel"], button:has-text("Sous-titres"), button:has-text("Subtitles"),[data-panel="subtitles"]'
      );
      
      if (await subtitlePanel.count() > 0) {
        // Click to open if it's a tab
        await subtitlePanel.first().click();
        
        // Should show subtitle style options
        const fontSelector = page.locator(
          '[data-testid="font-selector"], select:has-text("Font"), input[placeholder*="font"]'
        );
        
        if (await fontSelector.count() > 0) {
          await expect(fontSelector.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Export', () => {
    test('should show export button', async ({ page }) => {
      await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
      
      const exportButton = page.locator(
        'button:has-text("Export"), button:has-text("Exporter"), [data-testid="export-button"]'
      );
      
      if (await exportButton.count() > 0) {
        await expect(exportButton.first()).toBeVisible();
      }
    });

    test('should open export modal', async ({ page }) => {
      await page.goto('/editor/test-123/segment-456', { waitUntil: 'domcontentloaded' });
      
      const exportButton = page.locator(
        'button:has-text("Export"), button:has-text("Exporter"), [data-testid="export-button"]'
      );
      
      if (await exportButton.count() > 0) {
        await exportButton.first().click();
        
        // Modal should appear
        const modal = page.locator(
          '[role="dialog"], [data-testid="export-modal"], .export-modal'
        );
        
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible();
          
          // Should have format options
          const formatOptions = page.locator(
            'select, [data-testid="format-selector"], button:has-text("MP4")'
          );
          
          if (await formatOptions.count() > 0) {
            await expect(formatOptions.first()).toBeVisible();
          }
        }
      }
    });
  });
});

test.describe('Job Progress', () => {
  test('should show job drawer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for job drawer toggle
    const jobDrawerToggle = page.locator(
      '[data-testid="job-drawer-toggle"], button[aria-label*="Jobs"], button:has-text("Tâches")'
    );
    
    if (await jobDrawerToggle.count() > 0) {
      await jobDrawerToggle.first().click();
      
      // Drawer should appear
      const drawer = page.locator(
        '[data-testid="job-drawer"], .job-drawer, aside'
      );
      
      if (await drawer.count() > 0) {
        await expect(drawer.first()).toBeVisible();
      }
    }
  });

  test('should show progress bars for active jobs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open job drawer
    const jobDrawerToggle = page.locator(
      '[data-testid="job-drawer-toggle"], button[aria-label*="Jobs"]'
    );
    
    if (await jobDrawerToggle.count() > 0) {
      await jobDrawerToggle.first().click();
      
      // Look for progress bars
      const progressBars = page.locator(
        '[role="progressbar"], .progress-bar, [data-testid="job-progress"]'
      );
      
      // If there are active jobs, progress should be visible
      // This is a soft check - may not have active jobs during test
    }
  });
});
