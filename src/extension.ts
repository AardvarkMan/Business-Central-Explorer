import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AnalysisProgress,
  analyzeFiles,
  discoverAppPackages,
  parseAppManifest,
} from "./analyzer";
import {
  Analysis,
  DiagnosticInfo,
  PackageMetadata,
  SourceInput,
} from "./model";
import { createExplorerHtml, ExplorerProgress, ExplorerView } from "./webview";

const viewCommands: Array<{ id: string; label: string; view: ExplorerView; icon: string }> = [
  { id: "overview", label: "Overview", view: "overview", icon: "home" },
  { id: "relationships", label: "Relationships", view: "relationships", icon: "references" },
  { id: "galaxy", label: "Galaxy View", view: "galaxy", icon: "symbol-misc" },
  { id: "tables", label: "Tables", view: "tables", icon: "table" },
  { id: "whereUsed", label: "Where Used", view: "whereUsed", icon: "search" },
  { id: "pages", label: "Pages", view: "pages", icon: "browser" },
  { id: "reports", label: "Reports", view: "reports", icon: "graph" },
  { id: "integrationEvents", label: "Integration Events", view: "integrationEvents", icon: "zap" },
];

class ExplorerTreeProvider implements vscode.TreeDataProvider<ExplorerTreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private getAnalysis: () => Analysis | undefined) {}

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(item: ExplorerTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): ExplorerTreeItem[] {
    const analysis = this.getAnalysis();
    return viewCommands.map((item) => {
      const count = analysis ? viewCount(analysis, item.view) : undefined;
      const treeItem = new ExplorerTreeItem(
        count === undefined ? item.label : `${item.label} · ${count}`,
        vscode.TreeItemCollapsibleState.None,
      );
      treeItem.iconPath = new vscode.ThemeIcon(item.icon);
      treeItem.command = {
        command: `businessCentralExplorer.${item.id}`,
        title: item.label,
      };
      return treeItem;
    });
  }
}

class ExplorerTreeItem extends vscode.TreeItem {}

let analysis: Analysis | undefined;
let currentPanel: vscode.WebviewPanel | undefined;
let currentView: ExplorerView = "overview";
let extensionUri: vscode.Uri;
let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
let refreshInProgress: Promise<void> | undefined;
let refreshAgain = false;
let explorerProgress: ExplorerProgress | undefined;
const disposables: vscode.Disposable[] = [];
let treeProvider: ExplorerTreeProvider;
let sourceDocumentSequence = 0;
const embeddedSourceDocuments = new Map<string, string>();

class EmbeddedSourceProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const content = embeddedSourceDocuments.get(uri.toString());
    if (content === undefined) {
      throw new Error(`No embedded source is registered for ${uri.path}.`);
    }
    return content;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  extensionUri = context.extensionUri;
  treeProvider = new ExplorerTreeProvider(() => analysis);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("businessCentralExplorer.explorer", treeProvider),
    vscode.workspace.registerTextDocumentContentProvider(
      "business-central-explorer-source",
      new EmbeddedSourceProvider(),
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.uri.scheme === "business-central-explorer-source") {
        embeddedSourceDocuments.delete(document.uri.toString());
      }
    }),
  );

  for (const command of viewCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`businessCentralExplorer.${command.id}`, () =>
        openExplorer(command.view),
      ),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("businessCentralExplorer.open", () => openExplorer("overview")),
    vscode.commands.registerCommand("businessCentralExplorer.refresh", () => refreshAnalysis()),
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.al");
  disposables.push(
    watcher,
    watcher.onDidChange(scheduleRefresh),
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
  );
  const packageWatcher = vscode.workspace.createFileSystemWatcher("**/.alpackages/*.app");
  disposables.push(
    packageWatcher,
    packageWatcher.onDidChange(scheduleRefresh),
    packageWatcher.onDidCreate(scheduleRefresh),
    packageWatcher.onDidDelete(scheduleRefresh),
  );
  const manifestWatcher = vscode.workspace.createFileSystemWatcher("**/app.json");
  disposables.push(
    manifestWatcher,
    manifestWatcher.onDidChange(scheduleRefresh),
    manifestWatcher.onDidCreate(scheduleRefresh),
    manifestWatcher.onDidDelete(scheduleRefresh),
  );
  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "al") {
        scheduleRefresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh),
    vscode.workspace.onDidCreateFiles(scheduleRefresh),
    vscode.workspace.onDidDeleteFiles(scheduleRefresh),
    vscode.workspace.onDidRenameFiles(scheduleRefresh),
  );

  context.subscriptions.push(...disposables);
  if (vscode.workspace.workspaceFolders?.length) {
    void refreshAnalysis();
  }
}

export function deactivate(): void {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
  for (const disposable of disposables) {
    disposable.dispose();
  }
}

async function openExplorer(view: ExplorerView): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showInformationMessage(
      "Open a Business Central AL workspace to use Business Central Explorer.",
    );
    return;
  }
  currentView = view;
  let createdPanel = false;
  let panelToInitialize: vscode.WebviewPanel | undefined;
  if (!currentPanel) {
    createdPanel = true;
    currentPanel = vscode.window.createWebviewPanel(
      "businessCentralExplorer",
      "Business Central Explorer",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "resources")],
      },
    );
    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });
    panelToInitialize = currentPanel;
    currentPanel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (isReadyMessage(message)) {
        void currentPanel?.webview.postMessage({
          type: "progress",
          progress: explorerProgress,
        });
        return;
      }
      if (isSetViewMessage(message)) {
        currentView = message.view;
        return;
      }
      if (isOpenSourceDocumentMessage(message)) {
        const fileName = path.posix.basename(message.fileName.replace(/\\/g, "/"));
        const extension = path.extname(fileName).toLowerCase();
        const safeExtension = extension === ".dal" ? ".dal" : ".al";
        const safeName = extension === ".al" || extension === ".dal"
          ? fileName
          : `${path.basename(fileName, extension) || "source"}${safeExtension}`;
        const uri = vscode.Uri.from({
          scheme: "business-central-explorer-source",
          path: `/${++sourceDocumentSequence}/${safeName}`,
        });
        embeddedSourceDocuments.set(uri.toString(), message.sourceText);
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          await vscode.languages.setTextDocumentLanguage(document, "al");
          const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preview: false,
          });
          const line = Math.min(Math.max(0, message.line - 1), document.lineCount - 1);
          const position = new vscode.Position(line, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        } catch (error) {
          embeddedSourceDocuments.delete(uri.toString());
          void vscode.window.showWarningMessage(
            `Could not open the embedded AL source: ${errorMessage(error)}`,
          );
        }
        return;
      }
      if (!isOpenLocationMessage(message)) {
        return;
      }
      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(message.path));
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preview: false,
        });
        const line = Math.min(Math.max(0, message.line - 1), document.lineCount - 1);
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      } catch (error) {
        void vscode.window.showWarningMessage(
          `Could not open the AL source location: ${errorMessage(error)}`,
        );
      }
    });
  } else {
    currentPanel.reveal(vscode.ViewColumn.One);
    void currentPanel.webview.postMessage({ type: "setView", view });
  }
  if (createdPanel) {
    setPanelHtml(emptyAnalysis(), explorerProgress ?? {
      message: "Opening explorer…",
    });
    setTimeout(() => {
      if (currentPanel && currentPanel === panelToInitialize) {
        updatePanel();
      }
    }, 0);
  }
  if (!analysis && !refreshInProgress) {
    void refreshAnalysis();
  } else if (refreshInProgress) {
    postProgress();
  }
}

async function refreshAnalysis(): Promise<void> {
  if (refreshInProgress) {
    refreshAgain = true;
    return refreshInProgress;
  }
  setProgress({ message: "Starting workspace analysis…", phase: "manifests" });
  refreshInProgress = (async () => {
    do {
      refreshAgain = false;
      try {
        await doRefreshAnalysis();
      } catch (error) {
        const message = `Could not scan the current workspace: ${errorMessage(error)}`;
        analysis = {
          objects: [],
          relationships: [],
          usages: [],
          packages: [],
          packageDependencies: [],
          diagnostics: [{ severity: "error", message }],
          analyzedAt: new Date().toISOString(),
        };
        treeProvider.refresh();
        updatePanel();
        void vscode.window.showErrorMessage(message);
      }
    } while (refreshAgain);
  })().finally(() => {
    refreshInProgress = undefined;
    explorerProgress = undefined;
    updatePanel();
  });
  return refreshInProgress;
}

async function doRefreshAnalysis(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (!folders.length) {
    analysis = {
      objects: [],
      relationships: [],
      usages: [],
      packages: [],
      packageDependencies: [],
      diagnostics: [{
        severity: "warning",
        message: "Open a Business Central AL workspace to begin analysis.",
      }],
      analyzedAt: new Date().toISOString(),
    };
    treeProvider.refresh();
    updatePanel();
    return;
  }

  const diagnostics: DiagnosticInfo[] = [];
  setProgress({ message: "Reading AL workspace manifests…", phase: "manifests", completed: 0, total: folders.length });
  const workspaces: PackageMetadata[] = [];
  const rootByPath = new Map<string, PackageMetadata>();
  for (const folder of folders) {
    const manifestPath = path.join(folder.uri.fsPath, "app.json");
    let metadata: PackageMetadata = {
      name: folder.name,
      path: manifestPath,
    };
    try {
      const contents = await fs.readFile(manifestPath, "utf8");
      metadata = parseAppManifest(contents, manifestPath, folder.name);
      try {
        JSON.parse(contents);
      } catch (error) {
        diagnostics.push({
          severity: "warning",
          sourcePath: manifestPath,
          message: `Unable to parse app.json: ${errorMessage(error)}`,
        });
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        diagnostics.push({
          severity: "warning",
          sourcePath: manifestPath,
          message: `Unable to read app.json: ${errorMessage(error)}`,
        });
      }
    }
    workspaces.push(metadata);
    rootByPath.set(normalizePath(folder.uri.fsPath), metadata);
    setProgress({
      message: `Read workspace manifest (${workspaces.length} of ${folders.length})`,
      phase: "manifests",
      completed: workspaces.length,
      total: folders.length,
    });
  }

  const sourceInputs: SourceInput[] = [];
  setProgress({ message: "Finding AL source files…", phase: "sources", completed: 0, total: 1 });
  const sourceUris = await vscode.workspace.findFiles(
    "**/*.al",
    "**/{.alpackages,node_modules,.git}/**",
  );
  for (const [index, uri] of sourceUris.entries()) {
    const root = rootForPath(uri.fsPath, rootByPath);
    if (!root) {
      continue;
    }
    try {
      sourceInputs.push({
        path: uri.fsPath,
        content: await fs.readFile(uri.fsPath, "utf8"),
        sourceType: "workspace",
        packageName: root.name,
      });
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        sourcePath: uri.fsPath,
        message: `Unable to read AL source: ${errorMessage(error)}`,
      });
    }
    setProgress({
      message: `Reading AL sources (${index + 1} of ${sourceUris.length})`,
      phase: "sources",
      completed: index + 1,
      total: sourceUris.length,
    });
  }
  setProgress({
    message: `Loaded ${sourceInputs.length} AL source file${sourceInputs.length === 1 ? "" : "s"}`,
    phase: "sources",
    completed: sourceUris.length,
    total: sourceUris.length,
  });

  setProgress({ message: "Scanning .alpackages directories…", phase: "packages", completed: 0, total: 1 });
  const discoveredPackages = await discoverAppPackages(
    folders.map((folder) => folder.uri.fsPath),
  );
  diagnostics.push(...discoveredPackages.diagnostics);
  const packagePaths = discoveredPackages.paths;
  setProgress({
    message: `Preparing ${packagePaths.length} dependency package${packagePaths.length === 1 ? "" : "s"}…`,
    phase: "packages",
    completed: 0,
    total: Math.max(1, packagePaths.length),
  });
  try {
    analysis = await analyzeFiles(
      sourceInputs,
      packagePaths,
      workspaces,
      (progress) => setProgress(progress),
    );
    analysis.diagnostics.unshift(...diagnostics);
    if (sourceInputs.length === 0) {
      analysis.diagnostics.unshift({
        severity: "warning",
        message: "No AL source files were found in the current workspace.",
      });
    }
  } catch (error) {
    analysis = {
      objects: [],
      relationships: [],
      usages: [],
      packages: workspaces.map((item) => ({
        ...item,
        objectCount: 0,
        dependencies: item.dependencies ?? [],
      })),
      packageDependencies: [],
      diagnostics: [
        ...diagnostics,
        {
          severity: "error",
          message: `Analysis failed: ${errorMessage(error)}`,
        },
      ],
      analyzedAt: new Date().toISOString(),
    };
    void vscode.window.showErrorMessage(`Business Central Explorer analysis failed: ${errorMessage(error)}`);
  }
  treeProvider.refresh();
}

function scheduleRefresh(): void {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
  refreshTimeout = setTimeout(() => {
    refreshTimeout = undefined;
    void refreshAnalysis();
  }, 450);
}

function updatePanel(): void {
  if (currentPanel) {
    setPanelHtml(
      analysis ?? emptyAnalysis(),
      explorerProgress ?? {
        message: "Preparing workspace analysis…",
      },
    );
  }
}

function setPanelHtml(snapshot: Analysis, progress?: ExplorerProgress): void {
  if (currentPanel) {
    const logo = currentPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "resources", "aardvarklabs-logo.jpg"),
    );
    currentPanel.webview.html = createExplorerHtml(
      currentPanel.webview.cspSource,
      logo.toString(),
      snapshot,
      currentView,
      progress,
    );
  }
}

function emptyAnalysis(): Analysis {
  return {
    objects: [],
    relationships: [],
    usages: [],
    packages: [],
    packageDependencies: [],
    diagnostics: [],
    analyzedAt: new Date().toISOString(),
  };
}

function setProgress(progress: AnalysisProgress): void {
  explorerProgress = progress;
  postProgress();
}

function postProgress(): void {
  if (currentPanel) {
    void currentPanel.webview.postMessage({
      type: "progress",
      progress: explorerProgress,
    });
  }
}

function viewCount(snapshot: Analysis, view: ExplorerView): number {
  switch (view) {
    case "overview":
      return snapshot.objects.length;
    case "relationships":
      return snapshot.relationships.length;
    case "galaxy":
      return snapshot.objects.length;
    case "tables":
      return snapshot.objects.filter((item) => item.kind === "table" || item.kind === "tableextension").length;
    case "whereUsed":
      return snapshot.usages.length;
    case "pages":
      return snapshot.objects.filter((item) => item.kind === "page" || item.kind === "pageextension").length;
    case "reports":
      return snapshot.objects.filter((item) => item.kind === "report" || item.kind === "reportextension").length;
    case "integrationEvents":
      return snapshot.objects.reduce((sum, item) => sum + item.integrationEvents.length, 0);
  }
}

function rootForPath(
  filePath: string,
  roots: Map<string, PackageMetadata>,
): PackageMetadata | undefined {
  const normalized = normalizePath(filePath);
  let bestMatch: string | undefined;
  for (const root of roots.keys()) {
    if (
      (normalized === root || normalized.startsWith(`${root}${path.sep}`)) &&
      (!bestMatch || root.length > bestMatch.length)
    ) {
      bestMatch = root;
    }
  }
  return bestMatch ? roots.get(bestMatch) : undefined;
}

function normalizePath(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function isOpenLocationMessage(
  value: unknown,
): value is { type: "openLocation"; path: string; line: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    message.type === "openLocation" &&
    typeof message.path === "string" &&
    path.isAbsolute(message.path) &&
    typeof message.line === "number" &&
    Number.isFinite(message.line)
  );
}

function isOpenSourceDocumentMessage(
  value: unknown,
): value is { type: "openSourceDocument"; fileName: string; sourceText: string; line: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    message.type === "openSourceDocument" &&
    typeof message.fileName === "string" &&
    typeof message.sourceText === "string" &&
    typeof message.line === "number" &&
    Number.isFinite(message.line)
  );
}

function isSetViewMessage(value: unknown): value is { type: "setView"; view: ExplorerView } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    message.type === "setView" &&
    viewCommands.some((item) => item.view === message.view)
  );
}

function isReadyMessage(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).type === "ready";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
