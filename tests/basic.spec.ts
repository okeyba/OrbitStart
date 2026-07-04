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
    // Navigate to the local Vite dev server
    await page.goto('/');
    // Wait for the app shell to render
    await page.waitForSelector('.app-shell', { timeout: 10000 });
  });

  test('should load the workspace and display core branding', async ({ page }) => {
    // Verify application title in the sidebar
    const brandTitle = page.locator('.brand-mark strong');
    await expect(brandTitle).toBeVisible();
    await expect(brandTitle).toHaveText('OrbitStart');

    // Verify presence of primary navigation buttons
    const railButtons = page.locator('.rail-button');
    await expect(railButtons).not.toHaveCount(0);
  });

  test('should read computed CSS variables on document root', async ({ page }) => {
    // Get computed style properties of the document element
    const styles = await page.evaluate(() => {
      const el = document.documentElement;
      const computed = window.getComputedStyle(el);
      return {
        bg: computed.getPropertyValue('--bg').trim(),
        accent: computed.getPropertyValue('--accent').trim(),
        fontUi: computed.getPropertyValue('--font-ui').trim(),
      };
    });

    console.log('Detected theme CSS variables:', styles);

    // Verify standard tokens are defined (not empty)
    expect(styles.bg).not.toBe('');
    expect(styles.accent).not.toBe('');
    expect(styles.fontUi).not.toBe('');
  });

  test('should navigate folders and filter tags inside the current folder', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify([
        {
          id: 'folder-tag-test',
          title: 'Folder Tag Test',
          subtitle: 'Stored under apps with cross-folder tags',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Test\\folder-tag.exe',
          aliases: ['folder-tag'],
          tags: ['workflow-a', 'workflow-b', 'scan', 'shortcut', 'bookmark', 'browser', 'exe'],
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        }
      ]));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    await page.locator('.resource-tree-item', { hasText: '应用' }).click();
    await expect(page.locator('.resource-row').filter({ hasText: 'Folder Tag Test' })).toBeVisible();
    await expect(page.locator('.section-head.slim', { hasText: '标签筛选' })).toBeVisible();
    await expect(page.locator('.section-head.slim', { hasText: '跨类别' })).toHaveCount(0);
    for (const autoTag of ['scan', 'shortcut', 'bookmark', 'browser', 'exe']) {
      await expect(page.locator('.tag-filter-pill', { hasText: autoTag })).toHaveCount(0);
    }

    await page.locator('.tag-filter-pill', { hasText: 'workflow-a' }).click();
    await expect(page.locator('.resource-row').filter({ hasText: 'Folder Tag Test' })).toBeVisible();

    await page.locator('.resource-tree-item', { hasText: '文件' }).click();
    await expect(page.locator('.resource-row').filter({ hasText: 'Folder Tag Test' })).toHaveCount(0);
  });

  test('should move a resource by dragging onto a folder and expose folder context menus', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify([
        {
          id: 'drag-move-test',
          title: 'Drag Move Test',
          subtitle: 'Stored under apps before drag move',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Test\\drag-move.exe',
          aliases: ['drag-move'],
          tags: ['drag-drop'],
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        }
      ]));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    await page.locator('.resource-tree-item[data-folder-id="apps"]').click();
    const stableResourceSelector = '.resource-row[data-resource-id="drag-move-test"]:not(.dragging)';
    const resource = page.locator(stableResourceSelector).first();
    await expect(resource).toBeVisible();
    await page.waitForTimeout(150);

    const resourceMenuBox = await resource.boundingBox();
    expect(resourceMenuBox).not.toBeNull();
    await resource.dispatchEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: Math.round(resourceMenuBox!.x + 12),
      clientY: Math.round(resourceMenuBox!.y + 12)
    });
    await expect(page.locator('.context-menu')).toContainText('移动到目录');
    await expect(page.locator('.context-menu')).toContainText('文件');
    await page.mouse.click(8, 8);
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await page.waitForTimeout(100);

    const targetFolder = page.locator('.resource-tree-item[data-folder-id="work"]').first();
    await expect(targetFolder).toBeVisible();
    await targetFolder.scrollIntoViewIfNeeded();
    await resource.scrollIntoViewIfNeeded();
    const sourceBox = await resource.boundingBox();
    const targetBox = await targetFolder.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 18, sourceBox!.y + sourceBox!.height / 2 + 18, { steps: 4 });
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('orbitstart.browser.items');
          const items = raw ? JSON.parse(raw) : [];
          return items.find((item: any) => item.id === 'drag-move-test')?.group ?? '';
        })
      )
      .toContain('work');

    await expect(page.locator('.resource-tree-item[data-folder-id="work"]')).toContainText('1');
    await page.locator('.resource-tree-item[data-folder-id="work"]').click();
    await expect(page.locator('.resource-breadcrumb')).toContainText('文件');
    await expect(page.locator(stableResourceSelector)).toBeVisible();
    await page.locator('.resource-tree-item[data-folder-id="apps"]').click();
    await expect(page.locator(stableResourceSelector)).toHaveCount(0);

    const folderMenuBox = await targetFolder.boundingBox();
    expect(folderMenuBox).not.toBeNull();
    await targetFolder.dispatchEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: Math.round(folderMenuBox!.x + 12),
      clientY: Math.round(folderMenuBox!.y + 12)
    });
    await expect(page.locator('.context-menu')).toContainText('打开此目录');
    await expect(page.locator('.context-menu')).toContainText('新建子目录');
    await expect(page.locator('.context-menu')).toContainText('系统目录不可重命名或删除');
  });

  test('should move selected resources to a folder from batch management', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify([
        {
          id: 'batch-folder-move-test',
          title: 'Batch Folder Move Test',
          subtitle: 'Stored under apps before batch move',
          kind: 'app',
          group: 'apps',
          target: 'C:\\Test\\batch-folder-move.exe',
          aliases: ['batch-folder-move'],
          tags: ['manual-review'],
          icon: 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: 0
        }
      ]));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.locator('.resource-tree-item[data-folder-id="apps"]').click();
    await expect(page.locator('.resource-row[data-resource-id="batch-folder-move-test"]')).toBeVisible();

    await page.getByRole('button', { name: '批量管理' }).click();
    await page.locator('.resource-row[data-resource-id="batch-folder-move-test"] input[type="checkbox"]').check();
    await page.getByRole('button', { name: '移动到目录' }).click();
    await expect(page.locator('.dialog-panel', { hasText: '移动到目录' })).toBeVisible();
    await page.locator('.dialog-panel select').selectOption('work');
    await page.locator('.dialog-panel').getByRole('button', { name: '移动' }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('orbitstart.browser.items');
          const items = raw ? JSON.parse(raw) : [];
          return items.find((item: any) => item.id === 'batch-folder-move-test')?.group ?? '';
        })
      )
      .toContain('work');
  });

  test('should move a folder by dragging it onto another folder', async ({ page }) => {
    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    const sourceFolder = page.locator('.resource-tree-item[data-folder-id="scripts"]').first();
    const targetFolder = page.locator('.resource-tree-item[data-folder-id="web"]').first();
    await expect(sourceFolder).toBeVisible();
    await expect(targetFolder).toBeVisible();
    await sourceFolder.scrollIntoViewIfNeeded();
    await targetFolder.scrollIntoViewIfNeeded();

    const sourceBox = await sourceFolder.boundingBox();
    const targetBox = await targetFolder.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 18, sourceBox!.y + sourceBox!.height / 2 + 18, { steps: 4 });
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('orbitstart.resource.folders.v1');
          const folders = raw ? JSON.parse(raw) : [];
          return folders.find((folder: any) => folder.id === 'scripts')?.parentId ?? null;
        })
      )
      .toBe('web');
  });

  test('should keep Local Galaxy header and batch cards stable with many resources', async ({ page }) => {
    await page.setViewportSize({ width: 811, height: 500 });
    await page.evaluate(() => {
      const items = Array.from({ length: 72 }, (_, index) => {
        const group = index < 32 ? 'apps' : index < 56 ? 'work' : index < 66 ? 'web' : 'scripts';
        return {
          id: `layout-regression-${index}`,
          title: `Layout Regression ${index}`,
          subtitle: 'C:\\Program Files\\OrbitStart\\Long Resource Path\\resource.exe',
          kind: group === 'web' ? 'website' : 'app',
          group,
          target: `C:\\Test\\layout-regression-${index}.exe`,
          aliases: [],
          tags: [group],
          icon: group === 'web' ? 'Globe' : 'AppWindow',
          accent: '#5cc8ff',
          favorite: false,
          launchCount: index % 7
        };
      });
      window.localStorage.setItem('orbitstart.browser.items', JSON.stringify(items));
      const raw = window.localStorage.getItem('orbitstart.browser.snapshot');
      const snapshot = raw ? JSON.parse(raw) : {};
      snapshot.settings = { ...(snapshot.settings || {}), activeThemeId: 'local-galaxy', density: 'comfortable' };
      window.localStorage.setItem('orbitstart.browser.snapshot', JSON.stringify(snapshot));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    const resourceCenterLayout = await page.evaluate(() => {
      const tree = document.querySelector('.resource-tree-sidebar')?.getBoundingClientRect();
      const treeHead = document.querySelector('.resource-tree-head')?.getBoundingClientRect();
      const detail = document.querySelector('.resource-detail-panel')?.getBoundingClientRect();
      const detailHead = document.querySelector('.resource-workbench-head')?.getBoundingClientRect();
      const shellColumns = document.querySelector('.resource-manager-shell')
        ? window.getComputedStyle(document.querySelector('.resource-manager-shell')!).gridTemplateColumns.split(' ').length
        : 0;
      const workspace = document.querySelector('.workspace');
      const treeGap = tree && treeHead ? treeHead.top - tree.top : Number.POSITIVE_INFINITY;
      const detailGap = detail && detailHead ? detailHead.top - detail.top : 0;
      return {
        sidePanelsStartAtTop: treeGap >= 0 && treeGap < 24 && detailGap >= 0 && detailGap < 24,
        hasTopStats: Boolean(document.querySelector('.resource-center-page > .kpi-grid')),
        hasWorkbenchStats: Boolean(document.querySelector('.resource-detail-stats, .resource-tag-stats, .resource-detail-card')),
        gridColumns: shellColumns,
        workspaceCanScroll: workspace ? workspace.scrollHeight > workspace.clientHeight : false
      };
    });
    expect(resourceCenterLayout.sidePanelsStartAtTop).toBe(true);
    expect(resourceCenterLayout.hasTopStats).toBe(false);
    expect(resourceCenterLayout.hasWorkbenchStats).toBe(false);
    expect(resourceCenterLayout.gridColumns).toBeGreaterThanOrEqual(1);
    expect(resourceCenterLayout.gridColumns).toBeLessThanOrEqual(2);
    expect(resourceCenterLayout.workspaceCanScroll).toBe(true);
    for (const removedDefaultFolder of ['apps-dev', 'apps-office', 'apps-system', 'academic-sites', 'project-files', 'course-files', 'orbitstart-dev', 'biochem-course']) {
      await expect(page.locator(`.resource-tree-item[data-folder-id="${removedDefaultFolder}"]`)).toHaveCount(0);
    }
    await expect(page.locator('.resource-sidebar-toggle-bar')).toHaveCount(0);
    await expect(page.locator('.window-resource-toggle')).toHaveCount(1);

    await page.locator('.window-resource-toggle').click();
    await expect(page.locator('.resource-tree-sidebar')).toHaveCount(0);
    await expect(page.locator('.resource-detail-panel')).toHaveCount(0);
    const collapsedSide = await page.evaluate(() => {
      const shell = document.querySelector('.resource-manager-shell');
      const left = document.querySelector('.resource-left-column')?.getBoundingClientRect();
      const directory = document.querySelector('.resource-directory-panel')?.getBoundingClientRect();
      const columns = shell ? window.getComputedStyle(shell).gridTemplateColumns.split(' ').length : 0;
      return {
        sideCollapsed: Boolean(shell?.classList.contains('side-collapsed')),
        leftIsCompact: left ? left.width < 80 : true,
        directoryStartsNearShell: Boolean(shell && directory && directory.left - shell.getBoundingClientRect().left < 8),
        columns
      };
    });
    expect(collapsedSide.sideCollapsed).toBe(true);
    expect(collapsedSide.leftIsCompact).toBe(true);
    expect(collapsedSide.directoryStartsNearShell).toBe(true);
    expect(collapsedSide.columns).toBe(1);

    await page.locator('.window-resource-toggle').click();
    await expect(page.locator('.resource-tree-list')).toBeVisible();
    await expect(page.locator('.resource-detail-panel')).toBeVisible();
    await expect(page.locator('.resource-detail-card')).toHaveCount(0);

    for (const folderName of ['全部资源', '应用', '文件', '网站']) {
      await page.locator('.resource-tree-item', { hasText: folderName }).first().click();
      const titleFits = await page.evaluate(() => {
        const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
        const title = document.querySelector('.topbar > div:first-child')?.getBoundingClientRect();
        return Boolean(topbar && title && title.bottom <= topbar.bottom - 8);
      });
      expect(titleFits).toBe(true);
    }

    await page.locator('.section-actions button').click();
    const firstRowHeight = await page.locator('.resource-row').first().evaluate((element) => element.getBoundingClientRect().height);
    expect(firstRowHeight).toBeLessThan(180);
  });

  test('should navigate to Settings and inspect settings view', async ({ page }) => {
    const settingsButton = page.locator('.sidebar-cosmic-settings-btn').first();
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await expect(page.locator('.settings-shell')).toBeVisible();
    await expect(page.locator('label', { hasText: '资源管理模式' }).locator('select')).toBeVisible();
  });

  test('should switch to single-level resource mode and hide folder navigation', async ({ page }) => {
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('orbitstart.browser.snapshot');
      const snapshot = raw ? JSON.parse(raw) : {};
      snapshot.settings = { ...(snapshot.settings || {}), resourceMode: 'single' };
      window.localStorage.setItem('orbitstart.browser.snapshot', JSON.stringify(snapshot));
    });

    await page.reload();
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    await expect(page.locator('.resource-tree-sidebar')).toHaveCount(0);
    await expect(page.locator('.resource-detail-panel')).toHaveCount(0);
    await expect(page.locator('.window-resource-toggle')).toHaveCount(0);
    await expect(page.locator('.resource-single-tabs')).toBeVisible();
    await expect(page.locator('.section-head.slim', { hasText: '标签筛选' })).toHaveCount(0);
    await expect(page.locator('.resource-folder-header', { hasText: '单级标签' })).toBeVisible();
  });

  test('should verify hotkey behavior settings options', async ({ page }) => {
    const settingsButton = page.locator('.sidebar-cosmic-settings-btn').first();
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await expect(page.locator('.settings-shell')).toBeVisible();

    // Verify presence of hotkey behavior dropdown
    const select = page.locator('label:has-text("热键功能选择") select');
    await expect(select).toBeVisible();

    // The default should be "command_bar"
    await expect(select).toHaveValue('command_bar');

    // Change value to "open_only"
    await select.selectOption('open_only');
    await expect(select).toHaveValue('open_only');

    // Verify setting is stored in local storage
    const hotkeyBehavior = await page.evaluate(() => {
      const raw = window.localStorage.getItem('orbitstart.browser.snapshot');
      if (!raw) return null;
      return JSON.parse(raw).settings?.hotkeyBehavior;
    });
    expect(hotkeyBehavior).toBe('open_only');
  });

  test('should create developer custom groups and items when developer template is selected in onboarding', async ({ page }) => {
    // Navigate and clear onboarding state to force it to show
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('orbitstart_onboarding_v1');
      window.localStorage.removeItem('orbitstart.browser.snapshot');
      window.localStorage.removeItem('orbitstart.browser.items');
    });
    await page.reload();

    // Verify Onboarding Wizard overlay is visible
    const wizard = page.locator('.onboarding-wizard');
    await expect(wizard).toBeVisible();

    // Find and click the developer template card
    const devCard = page.locator('.template-card:has-text("我是开发者")');
    await expect(devCard).toBeVisible();
    await devCard.click();

    // Now it should advance to "tags-created" screen showing the scan steps
    await expect(page.locator('.success-badge:has-text("资源目录已创建")')).toBeVisible();

    // Verify if the custom groups and items were created in localStorage
    const snapshot = await page.evaluate(() => {
      const raw = window.localStorage.getItem('orbitstart.browser.snapshot');
      return raw ? JSON.parse(raw) : null;
    });

    expect(snapshot).not.toBeNull();
    const groupTitles = snapshot.groups.map((g: any) => g.title);
    expect(groupTitles).toContain('开发工具');
    expect(groupTitles).toContain('技术社区');
    expect(groupTitles).toContain('开发工作区');

    const items = await page.evaluate(() => {
      const raw = window.localStorage.getItem('orbitstart.browser.items');
      return raw ? JSON.parse(raw) : [];
    });
    expect(items.length).toBeGreaterThan(0);
    const vsCodeItem = items.find((i: any) => i.title === 'Visual Studio Code');
    expect(vsCodeItem).toBeDefined();
    expect(vsCodeItem.group).toBe('dev_tools');
    expect(vsCodeItem.tags).not.toContain('template');
    expect(vsCodeItem.tags).not.toContain('automation');

    await expect(page.locator('.resource-tree-item[data-folder-id="dev_tools"]')).toHaveCount(1);
  });

  test('should verify Atelier Zero theme variables if active', async ({ page }) => {
    // Get the dataset theme ID of document.documentElement
    const themeId = await page.evaluate(() => document.documentElement.dataset.theme);
    console.log('Currently active theme ID:', themeId);

    if (themeId === 'atelier-zero') {
      const styles = await page.evaluate(() => {
        const computed = window.getComputedStyle(document.documentElement);
        return {
          bg: computed.getPropertyValue('--bg').trim(),
          accent: computed.getPropertyValue('--accent').trim(),
          fontTitle: computed.getPropertyValue('--font-title').trim(),
        };
      });

      console.log('Atelier Zero theme verified with tokens:', styles);

      // Verify they match THEME_SPEC.md specification
      expect(styles.bg.toLowerCase()).toBe('#fbf6ee');
      expect(styles.accent.toLowerCase()).toBe('#9b5b32');
      expect(styles.fontTitle).toContain('Georgia');
    } else {
      console.log('Atelier Zero is not currently the active theme; skipping active token validation.');
    }
  });
});
