import type { WindowCategory, ActivityScoreRow } from './types';

const CODE_WM: RegExp[] = [
  /gnome-terminal/i, /kitty/i, /alacritty/i, /konsole/i, /xterm/i,
  /code/i, /jetbrains/i, /vim/i, /neovim/i, /emacs/i, /cursor/i,
];
const CODE_TITLE: RegExp[] = [
  /\.tsx?\b/, /\.py\b/, /\.sql\b/, /\.jsx?\b/, /\.rs\b/, /\.go\b/,
  /visual studio code/i, /\bIDE\b/,
];

const BROWSER_WM: RegExp[] = [
  /google-chrome/i, /firefox/i, /chromium/i, /brave/i, /vivaldi/i,
];

const COMM_WM: RegExp[] = [
  /thunderbird/i, /telegram/i, /slack/i, /discord/i, /zoom/i, /teams/i,
];
const COMM_TITLE: RegExp[] = [
  /\bmail\b/i, /\binbox\b/i, /\bchat\b/i, /\bcall\b/i, /\bmessag/i,
];

const DOC_WM: RegExp[] = [
  /obsidian/i, /notion/i, /libreoffice/i, /soffice/i, /typora/i, /marktext/i,
];
const DOC_TITLE: RegExp[] = [
  /\.md\b/, /\bnotion\b/i, /docs\.google/i,
];

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value));
}

export function classifyWindow(wmClass: string, windowTitle: string): WindowCategory {
  if (matchesAny(wmClass, CODE_WM) || matchesAny(windowTitle, CODE_TITLE)) {
    return 'code_editing';
  }
  if (matchesAny(wmClass, COMM_WM) || matchesAny(windowTitle, COMM_TITLE)) {
    return 'communication';
  }
  if (matchesAny(wmClass, DOC_WM) || matchesAny(windowTitle, DOC_TITLE)) {
    return 'documentation';
  }
  if (matchesAny(wmClass, BROWSER_WM)) {
    return 'research';
  }
  return 'unrelated';
}

export function countResearchSwitches(rows: ActivityScoreRow[]): number {
  let switches = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevBrowser = matchesAny(rows[i - 1].wm_class, BROWSER_WM);
    const currBrowser = matchesAny(rows[i].wm_class, BROWSER_WM);
    if (prevBrowser !== currBrowser) switches++;
  }
  return switches;
}
