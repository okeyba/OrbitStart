import { test, expect } from '@playwright/test';

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://127.0.0.1:1420',
        localStorage: [
          {
            name: 'orbitstart_onboarding_v1',
            value: JSON.stringify({ completed: true })
          }
        ]
      }
    ]
  }
});

test.describe('OrbitStart E2E Basic Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-shell', { timeout: 10000 });
  });

  test('should load the workspace and display core branding', async ({ page }) => {
    const brandTitle = page.locator('.brand-mark strong');
    await expect(brandTitle).toBeVisible();
    await expect(brandTitle).toHaveText('OrbitStart');

    await expect(page.locator('.rail-button')).not.toHaveCount(0);
  });

  test('should read computed CSS variables on document root', async ({ page }) => {
    const styles = await page.evaluate(() => {
      const el = document.documentElement;
      const computed = window.getComputedStyle(el);
      return {
        bg: computed.getPropertyValue('--bg').trim(),
        accent: computed.getPropertyValue('--accent').trim(),
        fontUi: computed.getPropertyValue('--font-ui').trim(),
      };
    });

    expect(styles.bg).not.toBe('');
    expect(styles.accent).not.toBe('');
    expect(styles.fontUi).not.toBe('');
  });

  test('should render nested subdirectories and collapse them from aligned buttons', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify([
        {
          id: 'root-app',
          title: 'Root App',
          subtitle: 'Stored directly under apps',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Test\\root.exe',
          aliases: [],
          tags: ['manual'],
          subTag: '',
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        },
        {
          id: 'media-app',
          title: 'Media App',
          subtitle: 'Stored under media tools',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Test\\media.exe',
          aliases: [],
          tags: ['manual'],
          subTag: '影音工具',
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        },
        {
          id: 'player-app',
          title: 'Player App',
          subtitle: 'Stored under media players',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Test\\player.exe',
          aliases: [],
          tags: ['manual'],
          subTag: '影音工具/播放器',
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        }
      ]));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.locator('[data-group-id="apps"] .group-tab-btn').click();

    await expect(page.locator('.resource-row[data-resource-id="root-app"]')).toBeVisible();
    await expect(page.locator('.subtag-resource-block')).toBeVisible();
    await expect(page.locator('.subtag-resource-title', { hasText: '影音工具' })).toBeVisible();
    await expect(page.locator('.subtag-resource-title', { hasText: '播放器' })).toBeVisible();
    await expect(page.locator('.resource-row[data-resource-id="media-app"]')).toBeVisible();
    await expect(page.locator('.resource-row[data-resource-id="player-app"]')).toBeVisible();

    const alignment = await page.locator('.subtag-collapse-button').first().evaluate((button) => {
      const icon = button.querySelector('svg');
      if (!icon) return { dx: 99, dy: 99 };
      const buttonBox = button.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      return {
        dx: Math.abs((buttonBox.left + buttonBox.width / 2) - (iconBox.left + iconBox.width / 2)),
        dy: Math.abs((buttonBox.top + buttonBox.height / 2) - (iconBox.top + iconBox.height / 2))
      };
    });
    expect(alignment.dx).toBeLessThan(1.5);
    expect(alignment.dy).toBeLessThan(1.5);

    await page.locator('.subtag-collapse-button').first().click();
    await expect(page.locator('.resource-row[data-resource-id="media-app"]')).toHaveCount(0);
    await expect(page.locator('.resource-row[data-resource-id="player-app"]')).toHaveCount(0);

    await page.locator('.subtag-collapse-button').first().click();
    await expect(page.locator('.resource-row[data-resource-id="media-app"]')).toBeVisible();
    await expect(page.locator('.resource-row[data-resource-id="player-app"]')).toBeVisible();
  });

  test('should expose the reveal-location action from resource context menu', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify([
        {
          id: 'context-menu-test',
          title: 'Context Menu Test',
          subtitle: 'C:\\Windows\\System32\\notepad.exe',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Windows\\System32\\notepad.exe',
          aliases: [],
          tags: ['manual'],
          subTag: '',
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        }
      ]));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.locator('[data-group-id="apps"] .group-tab-btn').click();

    const resource = page.locator('.resource-row[data-resource-id="context-menu-test"]').first();
    await expect(resource).toBeVisible();
    const box = await resource.boundingBox();
    expect(box).not.toBeNull();
    await resource.dispatchEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: Math.round(box!.x + 12),
      clientY: Math.round(box!.y + 12)
    });

    await expect(page.locator('.context-menu')).toContainText('打开所在位置');
  });

  test('should show version 0.7.4 on the about page', async ({ page }) => {
    await page.goto('/?panel=about');
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await expect(page.locator('.about-card')).toContainText('0.7.4');
  });
});
