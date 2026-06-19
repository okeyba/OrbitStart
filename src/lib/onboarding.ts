/**
 * OrbitStart Onboarding / Scenario Template System
 *
 * First-launch wizard that guides users through:
 * 1. Scenario template selection (student, editor, developer, researcher, data analyst, general)
 * 2. Auto-creation of example tags/workspaces based on selection
 * 3. Two-step scan guide: shortcuts → bookmarks
 * 4. Skip option at any time
 *
 * State is persisted in localStorage so the wizard only shows once.
 */

// ---------------------------------------------------------------------------
// 1. Scenario Template Definitions
// ---------------------------------------------------------------------------

export interface ScenarioTag {
  id: string;
  title: string;
  kind: "app" | "file" | "folder" | "website" | "script" | "action_chain";
  target: string;
  icon: string;
  accent: string;
  favorite?: boolean;
}

export interface ScenarioTemplate {
  id: string;
  title: string;          // e.g., "我是学生"
  subtitle: string;       // e.g., "学习、笔记和课程管理"
  description: string;    // longer description
  icon: string;           // Lucide icon name
  accent: string;         // theme color
  tags: ScenarioTag[];     // pre-seeded items to create
  groups: string[];       // group ids to ensure exist
}

/** The 6 scenario templates matching the P3 spec image */
export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "student",
    title: "我是学生",
    subtitle: "学习、笔记和课程管理",
    description: "为学习者打造的高效工具集合，包含笔记、翻译、文献管理和在线课程平台。",
    icon: "NotebookText",
    accent: "#5cc8ff",
    groups: ["apps", "web", "work"],
    tags: [
      { id: "obsidian-student", title: "Obsidian 笔记", kind: "app", target: "obsidian://open", icon: "Gem", accent: "#9b87f5", favorite: true },
      { id: "notepad-student", title: "记事本", kind: "app", target: "C:\\Windows\\System32\\notepad.exe", icon: "NotebookText", accent: "#5cc8ff" },
      { id: "github-student", title: "GitHub", kind: "website", target: "https://github.com", icon: "Github", accent: "#ffffff" },
      { id: "baidu-student", title: "百度", kind: "website", target: "https://www.baidu.com", icon: "Globe", accent: "#2932e1" },
      { id: "course-workspace", title: "课程工作区", kind: "action_chain", target: "obsidian://open\nhttps://github.com", icon: "Workflow", accent: "#ff7a90" }
    ]
  },
  {
    id: "editor",
    title: "我是剪辑用户",
    subtitle: "视频剪辑与素材管理",
    description: "视频创作工作流，整合剪辑软件、素材库、音效资源和渲染输出目录。",
    icon: "Film",
    accent: "#f472b6",
    groups: ["apps", "work", "web"],
    tags: [
      { id: "premiere-editor", title: "Adobe Premiere Pro", kind: "app", target: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe", icon: "Clapperboard", accent: "#99f" },
      { id: "capcut-editor", title: "剪映专业版", kind: "app", target: "C:\\Users\\[user]\\AppData\\Local\\CapCut\\CapCut.exe", icon: "Scissors", accent: "#00d4aa" },
      { id: "shots-folder", title: "截图素材文件夹", kind: "folder", target: "C:\\Users\\[user]\\Pictures\\Screenshots", icon: "FolderOpen", accent: "#f6b95b" },
      { id: "pexels-editor", title: "Pexels 免费素材", kind: "website", target: "https://www.pexels.com", icon: "Image", accent: "#2ea043" },
      { id: "unsplash-editor", title: "Unsplash 高清图片", kind: "website", target: "https://unsplash.com", icon: "Image", accent: "#111" },
      { id: "editing-workspace", title: "剪辑工作区", kind: "action_chain", target: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe\nhttps://www.pexels.com", icon: "Workflow", accent: "#ff7a90" }
    ]
  },
  {
    id: "developer",
    title: "我是开发者",
    subtitle: "代码、终端和部署工具链",
    description: "开发者全栈工具箱，覆盖编辑器、版本控制、容器化、API 文档和云服务平台。",
    icon: "Code",
    accent: "#a78bfa",
    groups: ["apps", "web", "scripts"],
    tags: [
      { id: "vscode-dev", title: "Visual Studio Code", kind: "app", target: "C:\\Users\\[user]\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", icon: "FileCode2", accent: "#007acc", favorite: true },
      { id: "git-bash-dev", title: "Git Bash", kind: "app", target: "C:\\Program Files\\Git\\bin\\bash.exe", icon: "TerminalSquare", accent: "#f05032" },
      { id: "github-dev", title: "GitHub", kind: "website", target: "https://github.com", icon: "Github", accent: "#fff" },
      { id: "npm-dev", title: "NPM 包管理器", kind: "website", target: "https://www.npmjs.com", icon: "Package", accent: "#cb3837" },
      { id: "mdn-dev", title: "MDN Web 文档", kind: "website", target: "https://developer.mozilla.org", icon: "BookOpen", accent: "#000" },
      { id: "dev-workspace", title: "开发工作区", kind: "action_chain", target: "C:\\Users\\[user]\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe\nC:\\Program Files\\Git\\bin\\bash.exe\nhttps://github.com", icon: "Workflow", accent: "#ff7a90" }
    ]
  },
  {
    id: "researcher",
    title: "我做科研",
    subtitle: "论文、数据和文献管理",
    description: "科研工作者专用环境，包含学术搜索引擎、文献管理工具、数据可视化和协作平台。",
    icon: "Microscope",
    accent: "#c084fc",
    groups: ["apps", "web", "work"],
    tags: [
      { id: "zotero-research", title: "Zotero", kind: "app", target: "C:\\Program Files\\Zotero\\zotero.exe", icon: "Library", accent: "#cc9223" },
      { id: "obsidian-research", title: "Obsidian", kind: "app", target: "obsidian://open", icon: "Gem", accent: "#9b87f5", favorite: true },
      { id: "scholar-research", title: "Google Scholar", kind: "website", target: "https://scholar.google.com", icon: "GraduationCap", accent: "#4285f4" },
      { id: "arxiv-research", title: "arXiv 预印本", kind: "website", target: "https://arxiv.org", icon: "FileText", accent: "#b31b1b" },
      { id: "research-workspace", title: "科研工作区", kind: "action_chain", target: "obsidian://open\nhttps://scholar.google.com\nhttps://arxiv.org", icon: "Workflow", accent: "#ff7a90" }
    ]
  },
  {
    id: "data-analyst",
    title: "我做数据分析",
    subtitle: "数据处理、可视化与报表",
    description: "数据分析师的工作台，集成电子表格、数据库客户端、BI 可视化和 Python 数据科学环境。",
    icon: "BarChart3",
    accent: "#fb923c",
    groups: ["apps", "web", "scripts"],
    tags: [
      { id: "excel-data", title: "Microsoft Excel", kind: "app", target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE", icon: "Table", accent: "#217346" },
      { id: "dbeaver-data", title: "DBeaver 数据库工具", kind: "app", target: "C:\\Program Files\\DBeaver\\dbeaver.exe", icon: "Database", accent: "#376e93" },
      { id: "python-data", title: "Python 环境", kind: "script", target: "python --version", icon: "TerminalSquare", accent: "#41e0a8" },
      { id: "kaggle-data", title: "Kaggle 数据竞赛", kind: "website", target: "https://www.kaggle.com", icon: "Trophy", accent: "#20beff" },
      { id: "data-workspace", title: "数据分析工作区", kind: "action_chain", target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE\nC:\\Program Files\\DBeaver\\dbeaver.exe", icon: "Workflow", accent: "#ff7a90" }
    ]
  },
  {
    id: "general",
    title: "我只是想整理电脑",
    subtitle: "简洁高效，从零开始",
    description: "干净的起点：只保留最核心的入口，后续按需自行添加。适合追求极简的用户。",
    icon: "Sparkles",
    accent: "#94a3b8",
    groups: ["apps"],
    tags: [
      { id: "notepad-general", title: "记事本", kind: "app", target: "C:\\Windows\\System32\\notepad.exe", icon: "NotebookText", accent: "#5cc8ff" },
      { id: "explorer-general", title: "文件资源管理器", kind: "app", target: "C:\\Windows\\explorer.exe", icon: "FolderOpen", accent: "#fbbf24" },
      { id: "settings-general", title: "系统设置", kind: "app", target: "ms-settings:", icon: "Settings", accent: "#94a3b8" }
    ]
  }
];

// ---------------------------------------------------------------------------
// 2. Onboarding State Machine
// ---------------------------------------------------------------------------

export type OnboardingStep =
  | "template-select"   // Step 1: Choose a scenario
  | "tags-created";     // Step 2: Tags created, show scan guide

export interface OnboardingState {
  step: OnboardingStep;
  selectedTemplateId: string | null;
  shortcutScanDone: boolean;   // Step 3a: local program scan completed
  bookmarkScanDone: boolean;   // Step 3b: browser bookmark scan completed
  skipped: boolean;             // User chose to skip entirely
  completed: boolean;           // All steps done or skipped
}

const STORAGE_KEY = "orbitstart_onboarding_v1";

/** Default / initial onboarding state */
export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  step: "template-select",
  selectedTemplateId: null,
  shortcutScanDone: false,
  bookmarkScanDone: false,
  skipped: false,
  completed: false
};

// ---------------------------------------------------------------------------
// 3. Persistence
// ---------------------------------------------------------------------------

/** Load onboarding state from localStorage. Returns null if not found (first launch). */
export function loadOnboardingState(): OnboardingState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null; // first time — show wizard
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Merge with defaults to handle future schema additions
    return { ...DEFAULT_ONBOARDING_STATE, ...parsed };
  } catch {
    return null;
  }
}

/** Save onboarding state to localStorage. */
export function saveOnboardingState(state: OnboardingState): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail — non-critical
  }
}

/** Check if the onboarding wizard should be shown. */
export function shouldShowOnboarding(): boolean {
  const state = loadOnboardingState();
  if (!state) return true; // Never shown before → first launch
  return !state.completed && !state.skipped;
}

/** Mark onboarding as completed (all steps done). */
export function completeOnboarding(): void {
  saveOnboardingState({ ...DEFAULT_ONBOARDING_STATE, completed: true });
}

/** Skip onboarding entirely. */
export function skipOnboarding(): void {
  saveOnboardingState({ ...DEFAULT_ONBOARDING_STATE, skipped: true, completed: true });
}

// ---------------------------------------------------------------------------
// 4. State Transitions
// ---------------------------------------------------------------------------

/** Advance to next step after template selection. Returns items to inject into catalog. */
export function selectTemplate(templateId: string): OnboardingState & { newTags: ScenarioTag[] } {
  const template = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  const state: OnboardingState = {
    ...DEFAULT_ONBOARDING_STATE,
    step: "tags-created",
    selectedTemplateId: templateId,
    shortcutScanDone: false,
    bookmarkScanDone: false
  };
  saveOnboardingState(state);
  return { ...state, newTags: template?.tags ?? [] };
}

/** Mark shortcut scan as done. Returns updated state. */
export function markShortcutScanDone(): OnboardingState {
  const prev = loadOnboardingState() ?? DEFAULT_ONBOARDING_STATE;
  const state: OnboardingState = { ...prev, shortcutScanDone: true };
  saveOnboardingState(state);
  return state;
}

/** Mark bookmark scan as done. If both scans done, auto-complete. Returns updated state. */
export function markBookmarkScanDone(): OnboardingState {
  const prev = loadOnboardingState() ?? DEFAULT_ONBOARDING_STATE;
  const bothDone = prev.shortcutScanDone && true;
  const state: OnboardingState = {
    ...prev,
    bookmarkScanDone: true,
    completed: bothDone || prev.completed
  };
  saveOnboardingState(state);
  return state;
}

/** Check if both scan steps are completed (used for "finish" button enable). */
export function areBothScansDone(state: OnboardingState): boolean {
  return state.shortcutScanDone && state.bookmarkScanDone;
}
