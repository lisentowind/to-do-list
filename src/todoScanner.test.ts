import { describe, expect, it } from 'vitest';
import { createTodoScanner } from './todoScanner';

describe('createTodoScanner', () => {
  it('stores normalized records by file after a full scan', async () => {
    const scanner = createTodoScanner({
      maxFiles: 10,
      readWorkspaceFiles: async () => [
        {
          filePath: '/workspace/src/app.ts',
          text: '// TODO: 接入接口',
        },
      ],
    });

    await scanner.fullScan(['TODO']);

    expect(scanner.getAllRecords().map((record) => record.fileName)).toEqual([
      'app.ts',
    ]);
  });

  it('rescans only the changed file on save and removes deleted files', async () => {
    const documents = new Map([
      ['/workspace/src/app.ts', '// TODO: 接入接口'],
      ['/workspace/src/old.ts', '// FIXME: 旧逻辑'],
    ]);

    const scanner = createTodoScanner({
      maxFiles: 10,
      readWorkspaceFiles: async () =>
        Array.from(documents.entries()).map(([filePath, text]) => ({
          filePath,
          text,
        })),
      readFile: async (filePath) => documents.get(filePath) ?? '',
    });

    await scanner.fullScan(['TODO', 'FIXME']);
    documents.set('/workspace/src/app.ts', '// FIXME: 改成高风险');
    documents.delete('/workspace/src/old.ts');

    await scanner.updateFile('/workspace/src/app.ts', ['TODO', 'FIXME']);
    scanner.removeFile('/workspace/src/old.ts');

    expect(
      scanner.getAllRecords().map((record) => [record.fileName, record.keyword]),
    ).toEqual([['app.ts', 'FIXME']]);
  });

  it('uses workspace-relative paths when a mapper is provided', async () => {
    const scanner = createTodoScanner({
      maxFiles: 10,
      readWorkspaceFiles: async () => [
        {
          filePath: '/workspace/src/views/explore.constants.ts',
          text: '// TODO: 从项目根开始展示',
        },
      ],
      toRelativePath: (filePath) => filePath.replace('/workspace/', ''),
    });

    await scanner.fullScan(['TODO']);

    expect(scanner.getAllRecords()).toMatchObject([
      {
        relativePath: 'src/views/explore.constants.ts',
        dirPath: 'src/views',
        fileName: 'explore.constants.ts',
      },
    ]);
  });
});
