import { describe, expect, it } from 'vitest';
import { getDefaultExpansionState } from './treePresentation';

describe('getDefaultExpansionState', () => {
  it('expands folder and file nodes by default', () => {
    expect(getDefaultExpansionState('folder')).toBe('expanded');
    expect(getDefaultExpansionState('file')).toBe('expanded');
  });

  it('does not make leaf nodes collapsible', () => {
    expect(getDefaultExpansionState('todo')).toBe('none');
    expect(getDefaultExpansionState('message')).toBe('none');
  });
});
