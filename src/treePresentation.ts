export type PresentationNodeType = 'folder' | 'file' | 'todo' | 'message';
export type DefaultExpansionState = 'expanded' | 'none';

export function getDefaultExpansionState(nodeType: PresentationNodeType): DefaultExpansionState {
  if (nodeType === 'folder' || nodeType === 'file') {
    return 'expanded';
  }

  return 'none';
}
