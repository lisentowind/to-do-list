import { describe, expect, it } from 'vitest';
import { formatStatusBarText, formatTreeMessage } from './todoMessages';

describe('formatTreeMessage', () => {
  it('includes query, filters, and result counts', () => {
    expect(
      formatTreeMessage(
        {
          status: 'ready',
          limited: false,
          visibleCount: 3,
          fileCount: 1,
          highRiskCount: 2,
        },
        {
          query: 'auth',
          keywordFilter: 'FIXME',
          scopeFilter: 'currentFile',
          riskFilter: 'highRiskOnly',
          viewMode: 'keyword',
        },
      ),
    ).toContain('搜索: auth');
  });

  it('shows the selected folder scope in the summary', () => {
    expect(
      formatTreeMessage(
        {
          status: 'ready',
          limited: false,
          visibleCount: 2,
          fileCount: 1,
          highRiskCount: 1,
        },
        {
          query: '',
          keywordFilter: 'ALL',
          scopeFilter: 'selectedFolder',
          selectedFolderPath: 'src/auth',
          riskFilter: 'all',
          viewMode: 'path',
        },
      ),
    ).toContain('范围: src/auth');
  });

  it('distinguishes empty workspace from filtered empty results', () => {
    expect(
      formatTreeMessage(
        {
          status: 'emptyWorkspace',
          limited: false,
          visibleCount: 0,
          fileCount: 0,
          highRiskCount: 0,
        },
        null,
      ),
    ).toContain('打开一个工作区');

    expect(
      formatTreeMessage(
        {
          status: 'ready',
          limited: false,
          visibleCount: 0,
          fileCount: 0,
          highRiskCount: 0,
        },
        {
          query: 'missing',
          keywordFilter: 'ALL',
          scopeFilter: 'workspace',
          riskFilter: 'all',
          viewMode: 'path',
        },
      ),
    ).toContain('当前筛选');
  });
});

describe('formatStatusBarText', () => {
  it('shows total and high-risk counts', () => {
    expect(formatStatusBarText(18, 5)).toBe('TODO 18 | RISK 5');
  });
});
