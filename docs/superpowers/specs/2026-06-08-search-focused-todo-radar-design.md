# TODO Radar 0.1.0 Search-Focused Design

## Goal

Ship a `0.1.0` release of TODO Radar that helps users find existing task markers quickly inside large codebases. This version stays focused on discovery and navigation rather than becoming a full task management system.

The release should solve four user problems together:

1. Search task text globally.
2. Narrow results quickly with lightweight filters.
3. Reorganize the tree to match different lookup strategies.
4. Surface high-risk items first without requiring extra scanning steps.

## Non-Goals

- No task editing UI.
- No inline checkbox or completion workflow.
- No owner, due date, or full metadata system.
- No custom webview panel for filtering.
- No remote sync or export service.

## Product Direction

Use the current VS Code native tree view as the primary interface and add native commands, view state, and cached indexing around it.

This direction is preferred over adding a second panel because:

- the extension already has a working native tree foundation;
- native tree interactions are faster and more consistent with VS Code;
- search, filter, and grouping can be added without fragmenting the experience.

## User Experience

### Primary Tree View

The extension continues to expose one activity bar view: `任务信号`.

Users interact with one tree that can be reorganized in different modes:

- `path`: grouped by directory, then file, then task item;
- `keyword`: grouped by risk keyword, then file, then task item;
- `file`: grouped directly by file, then task item.

The tree remains fully native:

- folders and files are expanded by default;
- users can still collapse nodes manually;
- `Collapse All` remains available;
- clicking a leaf item opens the corresponding file and line.

### High-Frequency Actions

The view title bar should include these commands:

- `Search`
- `Filter`
- `Sort`
- `Clear`
- `Refresh`

These actions mutate view state only. They do not trigger a full scan unless the underlying files changed.

### Search

`todoRadar.search` opens an input box.

Rules:

- empty input clears the current query;
- search matches against `text`, `rawLine`, `fileName`, and `relativePath`;
- matching is case-insensitive;
- tree contents update immediately after confirmation.

The active query is displayed in the view message, for example:

`搜索: login · 共 9 项，涉及 4 个文件`

### Filters

`todoRadar.filter` opens a QuickPick that supports one active selection per filter category.

Supported filter categories:

- keyword: `ALL` plus every configured keyword
- scope: `workspace`, `currentFile`, `currentFolder`
- risk: `all`, `highRiskOnly`

Selection behavior:

- choosing a new value in the same category replaces the previous one;
- filters across different categories combine;
- `Clear` resets every category to default.

### Sort / View Mode

`todoRadar.sort` is treated as a view mode switch, not a simple within-list sort.

Modes:

- `path`
- `keyword`
- `file`

Each mode reuses the same filtered result set but groups the tree differently.

### Focused Risk Visibility

High-risk visibility is solved through two mechanisms:

- keyword view mode naturally puts risky categories first;
- a dedicated `highRiskOnly` filter hides non-risk tasks.

Risk mapping for `0.1.0`:

- high risk: `FIXME`, `HACK`
- normal risk: `TODO`, `XXX`

### Status Feedback

The tree view message should always reflect active state:

- scan status;
- active search query if present;
- active filters if present;
- result count;
- file count;
- high-risk count when relevant.

Recommended message format:

`搜索: auth · 范围: 当前文件 · 风险: 仅高风险 · 3 项 / 1 文件`

### Status Bar

When enabled, a status bar item should show a compact summary such as:

`TODO 18 | RISK 5`

Clicking the status bar item opens the filter command.

## Commands

Add these commands:

- `todoRadar.search`
- `todoRadar.filter`
- `todoRadar.sort`
- `todoRadar.clearFilters`
- `todoRadar.focusCurrentFile`
- `todoRadar.focusCurrentFolder`
- `todoRadar.toggleRiskOnly`
- `todoRadar.copyTodo`
- `todoRadar.copyTodoPath`

Retain existing commands:

- `todoRadar.refresh`
- `todoRadar.openTodo`

Menus:

- view/title: search, filter, sort, clear, refresh
- view/item/context on todo items: open, copy text, copy path
- view/item/context on file and folder nodes: focus this file/folder when applicable

## Configuration

Retain:

- `todoRadar.keywords`

Add:

- `todoRadar.defaultViewMode`: `path | keyword | file`
- `todoRadar.defaultRiskOnly`: boolean
- `todoRadar.followActiveEditor`: boolean
- `todoRadar.includeGlobs`: string array
- `todoRadar.excludeGlobs`: string array
- `todoRadar.maxFiles`: number
- `todoRadar.autoRefresh`: boolean
- `todoRadar.statusBarEnabled`: boolean

Configuration rules:

- temporary search/filter state is not persisted to settings;
- default startup preferences come from configuration;
- include/exclude settings merge with built-in defaults;
- `maxFiles` limits full scans only, not filtered rendering.

## Data Model

### Base Record

Replace the current minimal leaf model with a richer normalized record:

```ts
interface TodoRecord {
  id: string;
  filePath: string;
  relativePath: string;
  dirPath: string;
  fileName: string;
  keyword: string;
  severity: "high" | "normal";
  line: number;
  column: number;
  text: string;
  rawLine: string;
}
```

`id` should be stable for a file snapshot and can be composed from path, line, column, keyword, and raw line.

### View State

```ts
interface TodoViewState {
  query: string;
  keywordFilter: "ALL" | string;
  scopeFilter: "workspace" | "currentFile" | "currentFolder";
  riskFilter: "all" | "highRiskOnly";
  viewMode: "path" | "keyword" | "file";
}
```

### Scan Cache

Store scan results by file:

```ts
Map<string, TodoRecord[]>
```

This cache is the source of truth for all rendering.

### Derived Tree

Tree nodes are derived from:

`scanCache -> flattened records -> filtered records -> grouped records -> TreeItems`

The tree itself is not persisted as authoritative state.

## Scanning and Performance

### Full Scan

Run a full scan:

- on initial activation;
- when include/exclude/keyword configuration changes;
- when explicitly refreshed.

### Incremental Refresh

Update only affected files on:

- document save;
- file create;
- file delete;
- file rename.

Behavior:

- save: rescan the saved file only;
- create: scan the new file if it matches include/exclude rules;
- delete: remove cache entry;
- rename: remove old cache entry and scan new path if eligible.

### Active Editor Scope

When the user has selected `currentFile` or `currentFolder`, changing the active editor should recompute the visible tree without rescanning other files.

If `followActiveEditor` is disabled, scope-based filtering remains anchored to the last explicit scope command.

### File Limits

If the file count exceeds `todoRadar.maxFiles`, scanning should stop at the configured limit and show a warning in the view message.

The warning must be explicit, for example:

`已扫描前 2500 个文件，结果可能不完整`

## Parsing

`0.1.0` keeps parsing intentionally simple.

Supported syntax remains:

- `TODO: ...`
- `FIXME ...`
- `HACK - ...`
- `XXX：...`

This version should not introduce owner/date/priority parsing.

The parser should, however, expose `severity` based on keyword mapping.

## Tree Grouping Rules

### Path Mode

Top-level nodes:

- folders
- root files

Folder-first ordering remains valid.

### Keyword Mode

Top-level nodes are keywords ordered by risk and then label:

1. `FIXME`
2. `HACK`
3. `TODO`
4. `XXX`
5. custom keywords in alphabetical order

Children under keyword nodes group by file.

### File Mode

Top-level nodes are files sorted alphabetically by relative path.

Children are task items sorted by line and column.

### Leaf Ordering

Within a file, tasks sort by:

1. line
2. column
3. keyword

## Error Handling and Edge Cases

### Empty Workspace

Show a native message node and a tree message explaining that the user must open a workspace.

### No Results

Differentiate between:

- no scanned markers in workspace;
- no matches after active search/filter conditions.

The message should tell the user whether the workspace is empty of markers or whether the current filters are too narrow.

### Undecodable Files

Silently skip files VS Code cannot open as text.

### Huge Workspaces

If the scan is capped by `maxFiles`, make the limitation visible in the UI.

### Stale Scope

If `currentFile` or `currentFolder` is active and no editor is available, fall back to workspace scope and show that fallback in the message.

### Deleted Targets

If a task item is clicked after its file disappears, show a VS Code warning message instead of throwing.

### Custom Keywords

Unknown keywords are still parsed if configured. They default to normal severity unless explicitly mapped in a future release.

## Architecture Changes

Refactor `src/extension.ts` into smaller modules during implementation:

- scan service
- view state store
- tree builder(s)
- command registration
- status bar integration

This is a targeted refactor in service of the new feature set, not a general cleanup exercise.

Suggested file split:

- `src/extension.ts`
- `src/todoParser.ts`
- `src/todoScanner.ts`
- `src/todoRecords.ts`
- `src/todoViewState.ts`
- `src/todoTreeBuilders.ts`
- `src/todoCommands.ts`
- `src/todoStatusBar.ts`

## Testing Strategy

### Parser Tests

Keep existing parser tests and add:

- severity mapping
- custom keyword handling
- text matching edge cases relevant to search normalization

### Cache / Scan Tests

Add tests for:

- full scan result normalization
- incremental file update behavior
- delete and rename cache behavior
- include/exclude filtering

### View State Tests

Add tests for:

- query filtering
- keyword filtering
- risk-only filtering
- current file and current folder scoping
- fallback when no active editor exists

### Tree Builder Tests

Add tests for:

- path mode grouping
- keyword mode grouping order
- file mode grouping
- filtered result counts
- custom keyword ordering

### Presentation Tests

Keep the default expansion tests and add:

- view message formatting
- no-result vs filtered-out messaging
- status bar summary formatting

## Rollout Plan

Implement in this order:

1. normalize records and severity mapping
2. introduce scan cache and incremental refresh
3. introduce view state and filtering pipeline
4. add alternate tree grouping modes
5. add commands and title bar actions
6. add status bar summary
7. finish message/error handling polish
8. expand tests and run full verification

## Success Criteria

`0.1.0` is successful when:

- users can search task content from the tree workflow;
- users can filter by keyword, scope, and risk without rescanning;
- users can switch between path, keyword, and file views;
- risky items can be surfaced quickly;
- scanning remains responsive on ongoing file changes;
- the extension still feels native to VS Code.
