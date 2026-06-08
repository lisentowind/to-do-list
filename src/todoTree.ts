export interface TodoTreeItem {
  filePath: string;
  fileName: string;
  relativePath: string;
  line: number;
  column: number;
  keyword: string;
  severity: 'high' | 'normal';
  text: string;
  rawLine: string;
}

export interface TodoFolderNode {
  type: 'folder';
  name: string;
  path: string;
  count: number;
  children: TodoTreeNode[];
}

export interface TodoFileNode {
  type: 'file';
  name: string;
  path: string;
  count: number;
  todos: TodoTreeItem[];
}

export type TodoTreeNode = TodoFolderNode | TodoFileNode;

interface MutableFolderNode extends TodoFolderNode {
  childrenByName: Map<string, MutableFolderNode>;
  filesByName: Map<string, TodoFileNode>;
}

export function buildTodoTree(todos: TodoTreeItem[]): TodoTreeNode[] {
  const root = createFolderNode('', '');

  for (const todo of todos) {
    const normalizedPath = normalizePath(todo.relativePath || todo.fileName);
    const segments = normalizedPath.split('/').filter(Boolean);
    const fileName = segments.pop() ?? todo.fileName;

    let currentFolder = root;
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let nextFolder = currentFolder.childrenByName.get(segment);
      if (!nextFolder) {
        nextFolder = createFolderNode(segment, currentPath);
        currentFolder.childrenByName.set(segment, nextFolder);
      }
      currentFolder = nextFolder;
    }

    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    let fileNode = currentFolder.filesByName.get(fileName);
    if (!fileNode) {
      fileNode = {
        type: 'file',
        name: fileName,
        path: filePath,
        count: 0,
        todos: []
      };
      currentFolder.filesByName.set(fileName, fileNode);
    }

    fileNode.todos.push({
      ...todo,
      relativePath: filePath,
      fileName
    });
    fileNode.count += 1;
  }

  return finalizeChildren(root);
}

function finalizeChildren(folder: MutableFolderNode): TodoTreeNode[] {
  const folderChildren = Array.from(folder.childrenByName.values())
    .map((childFolder) => {
      const children = finalizeChildren(childFolder);
      const count = children.reduce((total, child) => total + child.count, 0);

      return {
        type: 'folder' as const,
        name: childFolder.name,
        path: childFolder.path,
        count,
        children
      };
    })
    .sort(compareNodes);

  const fileChildren = Array.from(folder.filesByName.values())
    .map((fileNode) => ({
      ...fileNode,
      todos: [...fileNode.todos].sort((left, right) => left.line - right.line || left.column - right.column)
    }))
    .sort(compareNodes);

  return [...folderChildren, ...fileChildren];
}

function compareNodes(left: TodoTreeNode, right: TodoTreeNode): number {
  if (left.type !== right.type) {
    return left.type === 'folder' ? -1 : 1;
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN');
}

function createFolderNode(name: string, path: string): MutableFolderNode {
  return {
    type: 'folder',
    name,
    path,
    count: 0,
    children: [],
    childrenByName: new Map(),
    filesByName: new Map()
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '');
}
