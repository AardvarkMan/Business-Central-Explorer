import { randomBytes } from "node:crypto";
import { Analysis, AnalysisPhase } from "./model";

export type ExplorerView =
  | "overview"
  | "relationships"
  | "galaxy"
  | "tables"
  | "whereUsed"
  | "pages"
  | "reports"
  | "integrationEvents"
  | "documentation";

export interface ExplorerProgress {
  message: string;
  phase?: AnalysisPhase;
  completed?: number;
  total?: number;
}

export function createExplorerHtml(
  cspSource: string,
  logo: string,
  analysis: Analysis,
  selectedView: ExplorerView,
  progress?: ExplorerProgress,
  extensionVersion = "unknown",
): string {
  const nonce = createNonce();
  const webviewAnalysis = {
    ...analysis,
    objects: analysis.objects.map((object) => ({
      ...object,
      sourceText: "",
      hasSourceText: !!object.sourceText,
    })),
  };
  const serializedAnalysis = JSON.stringify(webviewAnalysis)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const projectNames = [...new Set(
    analysis.objects.filter((object) => object.sourceType === "workspace").map((object) => object.packageName),
  )].sort((left, right) => left.localeCompare(right));
  const packageNames = [...new Set([
    ...analysis.packages.map((pkg) => pkg.name),
    ...analysis.objects.filter((object) => object.sourceType === "package").map((object) => object.packageName),
  ])].sort((left, right) => left.localeCompare(right));
  const initialDocumentationScope = projectNames.length
    ? { kind: "project", name: projectNames[0] }
    : packageNames.length
      ? { kind: "package", name: packageNames[0] }
      : undefined;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Business Central Explorer</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; --brand-ink: #102f43; --brand-gold: #d9b65b; --panel: var(--vscode-editor-background); --line: var(--vscode-panel-border); --soft: var(--vscode-editor-inactiveSelectionBackground); }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.55 var(--vscode-font-family); }
    button, input { font: inherit; }
    button { color: inherit; }
    .shell { min-height: 100vh; }
    .masthead { display: flex; align-items: center; gap: 14px; padding: 16px 24px; border-bottom: 1px solid var(--line); background: linear-gradient(105deg, color-mix(in srgb, var(--brand-ink) 94%, transparent), color-mix(in srgb, var(--brand-ink) 74%, var(--vscode-editor-background))); }
    .logo { width: 52px; height: 52px; object-fit: cover; border-radius: 50%; border: 2px solid #f4edce; box-shadow: 0 2px 12px #0005; }
    .brand-lockup { min-width: 0; }
    .brand-name { margin: 0; color: #fff8e1; font-size: 12px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; }
    .product-name { margin: 2px 0 0; color: #fff; font-size: 19px; font-weight: 650; letter-spacing: -.02em; }
    .scope { margin-left: auto; color: #f4edce; font-size: 12px; text-align: right; }
    .layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: calc(100vh - 85px); }
    nav { padding: 20px 12px; border-right: 1px solid var(--line); }
    .nav-label { margin: 0 10px 10px; color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .nav-button { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-radius: 5px; padding: 9px 10px; margin: 2px 0; text-align: left; color: var(--vscode-foreground); background: transparent; cursor: pointer; }
    .nav-button:hover { background: var(--soft); }
    .nav-button[aria-current="page"] { background: color-mix(in srgb, var(--vscode-button-background) 20%, transparent); color: var(--vscode-foreground); font-weight: 650; }
    .nav-icon { width: 18px; text-align: center; color: var(--brand-gold); }
    main { width: 100%; max-width: 1500px; padding: 27px clamp(18px, 4vw, 54px) 60px; }
    .eyebrow { margin: 0 0 5px; color: var(--brand-gold); font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
    h1 { margin: 0 0 7px; font-size: 25px; line-height: 1.2; }
    .lede { max-width: 820px; margin: 0 0 24px; color: var(--vscode-descriptionForeground); }
    .loading { padding: 15px 17px; margin-bottom: 18px; border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(135deg, color-mix(in srgb, var(--brand-ink) 24%, var(--vscode-editor-background)), var(--soft)); box-shadow: 0 8px 26px #0002; }
    .loading-title { margin: 0 0 10px; color: var(--brand-gold); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .loading-tasks { display: grid; gap: 8px; margin-top: 13px; }
    .loading-task { display: grid; grid-template-columns: minmax(145px, 220px) minmax(90px, 1fr) 38px; align-items: center; gap: 10px; }
    .loading-task-label { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .loading-task.current .loading-task-label, .loading-task.complete .loading-task-label { color: var(--vscode-foreground); }
    .loading-task.complete .loading-task-label::before { content: "✓ "; color: var(--brand-gold); }
    .loading-task-bar { height: 5px; overflow: hidden; border-radius: 5px; background: color-mix(in srgb, var(--line) 80%, transparent); }
    .loading-task-fill { height: 100%; width: 0; background: var(--brand-gold); transition: width .25s ease; }
    .loading-task.current .loading-task-fill { background: linear-gradient(90deg, var(--brand-gold), #fff2b8, var(--brand-gold)); background-size: 200% 100%; animation: task-shimmer 1.3s linear infinite; }
    .loading-task-percent { color: var(--vscode-descriptionForeground); font-size: 10px; text-align: right; }
    .loading-log { max-height: 180px; overflow: auto; padding: 9px 10px; margin: 12px 0 0; border: 1px solid var(--line); border-radius: 5px; color: var(--vscode-terminal-foreground, var(--vscode-foreground)); background: var(--vscode-terminal-background, var(--vscode-editor-background)); white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; font: 10px/1.45 var(--vscode-editor-font-family, monospace); }
    @keyframes task-shimmer { to { background-position: -200% 0; } }
    .loading[hidden] { display: none; }
    .loading-label { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
    .loading-spinner { width: 13px; height: 13px; border: 2px solid var(--line); border-top-color: var(--brand-gold); border-radius: 50%; animation: spin .8s linear infinite; }
    .progress-track { height: 4px; overflow: hidden; border-radius: 4px; background: var(--line); }
    .progress-fill { width: 100%; height: 100%; background: var(--brand-gold); transition: width .2s ease; }
    .progress-fill.indeterminate { width: 35%; animation: progress 1.1s ease-in-out infinite alternate; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes progress { from { transform: translateX(-20%); } to { transform: translateX(210%); } }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin: 0 0 18px; }
    .search { width: min(100%, 380px); border: 1px solid var(--vscode-input-border, var(--line)); border-radius: 4px; padding: 7px 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); }
    .select { min-width: min(100%, 320px); border: 1px solid var(--vscode-input-border, var(--line)); border-radius: 4px; padding: 7px 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); }
    .event-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 18px; }
    .event-filter { display: grid; min-width: 0; gap: 5px; }
    .event-filter-label { color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; }
    .event-filter .search, .event-filter .select { width: 100%; min-width: 0; max-width: none; }
    .badge { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 12px; margin: 17px 0 25px; }
    .card, .panel { border: 1px solid var(--line); border-radius: 7px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background)); }
    .card { padding: 15px 16px; }
    .card-label { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .card-value { margin-top: 2px; font-size: 25px; font-weight: 650; }
    .panel { padding: 16px 18px; margin: 14px 0; }
    .documentation-preview { max-height: 72vh; overflow: auto; padding: 20px; border: 1px solid var(--line); border-radius: 7px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background)); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.65 var(--vscode-editor-font-family, monospace); }
    .documentation-note { padding: 12px 14px; margin: 0 0 16px; border-left: 3px solid var(--brand-gold); background: var(--soft); color: var(--vscode-descriptionForeground); }
    .object-card { padding: 0; overflow: hidden; }
    .object-card > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; cursor: pointer; list-style-position: inside; }
    .object-card > summary:hover { background: var(--soft); }
    .object-summary { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 5px 14px; }
    .object-caption { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .object-body { padding: 0 18px 16px; }
    .panel h2 { margin: 0 0 11px; font-size: 15px; }
    .panel h3 { margin: 0 0 7px; font-size: 13px; }
    .page-control-group { padding: 9px 11px; margin: 9px 0; border-left: 2px solid var(--brand-gold); background: var(--soft); }
    .muted { color: var(--vscode-descriptionForeground); }
    .empty { border: 1px dashed var(--line); border-radius: 7px; padding: 25px; color: var(--vscode-descriptionForeground); text-align: center; }
    .diagnostic { padding: 10px 12px; margin: 8px 0; border-left: 3px solid var(--vscode-editorWarning-foreground); background: var(--soft); overflow-wrap: anywhere; }
    .diagnostic.error { border-color: var(--vscode-editorError-foreground); }
    .package { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding: 10px 0; border-top: 1px solid var(--line); }
    .package:first-of-type { border-top: 0; }
    .package-name { font-weight: 600; }
    .definition { border-top: 1px solid var(--line); padding: 13px 0; }
    .definition:first-of-type { border-top: 0; }
    .definition-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .table-definition-head { display: grid; grid-template-columns: minmax(0, 1fr) 112px 112px; gap: 12px; align-items: start; }
    .definition-action-column { display: grid; justify-items: stretch; gap: 4px; }
    .definition-action-column .open-button { width: 100%; }
    .definition-action-label { color: var(--vscode-descriptionForeground); font-size: 10px; }
    .relation-field-label { font-size: 9px; }
    .definition-title { font-weight: 650; }
    .definition-meta { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .property-list { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
    .field-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .field-table th, .field-table td { padding: 6px 8px; border-top: 1px solid var(--line); text-align: left; vertical-align: top; }
    .field-table th { color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; }
    .report-section { margin-top: 18px; }
    .report-section h3 { margin: 0 0 7px; font-size: 13px; }
    .report-data-table { min-width: 940px; }
    .report-data-table td { white-space: pre-line; overflow-wrap: anywhere; }
    .report-field-list { margin-top: 5px; color: var(--vscode-descriptionForeground); }
    .event-contract { padding-top: 14px; margin-top: 14px; border-top: 1px solid var(--line); }
    .event-contract h3 { margin: 0 0 8px; font-size: 13px; }
    .event-documentation { padding: 10px 12px; margin: 0 0 9px; border-left: 2px solid var(--brand-gold); background: var(--soft); white-space: pre-wrap; }
    .event-definition { display: block; margin: 8px 0 12px; padding: 9px 11px; background: var(--vscode-textCodeBlock-background); white-space: pre-wrap; overflow-wrap: anywhere; }
    .event-parameter-table { max-width: 760px; margin-bottom: 12px; }
    .event-reference { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
    .event-excerpt { display: block; margin-top: 5px; color: var(--vscode-textPreformat-foreground); white-space: pre-wrap; overflow-wrap: anywhere; }
    .usage-table { min-width: 900px; table-layout: fixed; }
    .usage-table td { overflow-wrap: anywhere; }
    .usage-table th:nth-child(1), .usage-table td:nth-child(1) { width: 19%; }
    .usage-table th:nth-child(2), .usage-table td:nth-child(2) { width: 13%; }
    .usage-table th:nth-child(3), .usage-table td:nth-child(3) { width: 6%; }
    .usage-table th:nth-child(4), .usage-table td:nth-child(4) { width: 37%; }
    .usage-table th:last-child, .usage-table td:last-child { width: 25%; min-width: 155px; }
    .usage-actions { display: grid; gap: 6px; }
    .usage-actions .open-button { width: 100%; }
    .table-scroll { width: 100%; overflow-x: auto; }
    .usage-details summary { color: var(--vscode-textLink-foreground); cursor: pointer; font-weight: 600; }
    .usage-detail-body { max-width: 560px; margin: 7px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .source-view { max-height: 72vh; overflow: auto; padding: 16px; border: 1px solid var(--line); border-radius: 7px; background: var(--vscode-textCodeBlock-background); font: 12px/1.55 var(--vscode-editor-font-family); white-space: pre; tab-size: 4; }
    .tree-visual { position: relative; width: 100%; overflow: auto; border: 1px solid var(--line); border-radius: 7px; background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-sideBar-background)); cursor: grab; touch-action: none; }
    .tree-visual:active { cursor: grabbing; }
    .tree-visual svg { display: block; width: 100%; min-width: 760px; }
    .tree-visual svg.table-relationship-svg { height: min(70vh, 720px); min-width: 0; }
    .galaxy-cluster { fill: color-mix(in srgb, var(--cluster-color) 8%, var(--vscode-editor-background)); stroke: var(--cluster-color); stroke-width: 2; stroke-dasharray: 5 5; }
    .galaxy-node { stroke: var(--cluster-color); stroke-width: 2; }
    .galaxy-extension-label { fill: var(--cluster-color); font: 700 14px var(--vscode-font-family); }
    .galaxy-viewport { cursor: grab; touch-action: none; }
    .galaxy-viewport:active { cursor: grabbing; }
    .tree-visual svg.galaxy-svg { display: block; width: 100%; height: min(75vh, 850px); min-width: 0; min-height: 520px; }
    .type-key { display: flex; flex-wrap: wrap; gap: 6px 12px; min-width: min(100%, 380px); padding: 8px 12px; border: 1px solid var(--line); border-radius: 5px; }
    .type-key legend { padding: 0 5px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .type-choice { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .galaxy-dot { fill: var(--cluster-color); stroke: var(--vscode-editor-background); stroke-width: 2; }
    .galaxy-point:hover .galaxy-dot { stroke: var(--vscode-focusBorder); stroke-width: 3; }
    .galaxy-point.is-selected .galaxy-dot, .galaxy-point.is-related-endpoint .galaxy-dot { stroke: var(--vscode-focusBorder); stroke-width: 4; }
    .galaxy-point.is-selected .galaxy-dot { filter: drop-shadow(0 0 5px var(--vscode-focusBorder)); }
    .galaxy-point.is-dimmed, .edge.is-dimmed { opacity: .16; }
    .edge.is-related { stroke: var(--vscode-focusBorder); stroke-width: 4; filter: drop-shadow(0 0 3px var(--vscode-focusBorder)); }
    .galaxy-magnifier { position: absolute; z-index: 2; display: flex; align-items: center; gap: 10px; max-width: min(360px, calc(100% - 20px)); padding: 9px 13px 9px 9px; border: 2px solid var(--vscode-focusBorder); border-radius: 999px; color: var(--vscode-foreground); background: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent); box-shadow: 0 5px 18px #0008; pointer-events: none; transform: translate(14px, 14px); }
    .galaxy-magnifier[hidden] { display: none; }
    .galaxy-magnifier-lens { display: grid; flex: 0 0 44px; width: 44px; height: 44px; place-items: center; border: 2px solid var(--vscode-focusBorder); border-radius: 50%; background: var(--vscode-editor-background); }
    .galaxy-magnifier-dot { width: 18px; height: 18px; border: 2px solid var(--vscode-editor-background); border-radius: 50%; background: var(--cluster-color); box-shadow: 0 0 0 2px var(--cluster-color); }
    .galaxy-magnifier-name { overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .galaxy-object-label { visibility: hidden; fill: var(--vscode-foreground); font: 11px var(--vscode-font-family); paint-order: stroke; stroke: var(--vscode-editor-background); stroke-width: 4px; stroke-linejoin: round; pointer-events: none; }
    .galaxy-object-label.visible { visibility: visible; }
    .graph-world { transform-origin: 0 0; }
    .edge { stroke: color-mix(in srgb, var(--brand-gold) 78%, var(--vscode-descriptionForeground)); stroke-width: 1.6; }
    .edge.conditional { stroke-dasharray: 5 4; }
    .node { fill: var(--vscode-editor-background); stroke: color-mix(in srgb, var(--brand-gold) 72%, var(--line)); stroke-width: 1.2; }
    .node-interactive { cursor: pointer; }
    .node-interactive:hover .node, .node-interactive:focus .node { stroke: var(--vscode-focusBorder); stroke-width: 2.4; }
    .node-label { fill: var(--vscode-foreground); font: 12px var(--vscode-font-family); }
    .edge-label { fill: var(--vscode-descriptionForeground); font: 10px var(--vscode-font-family); }
    .open-button { border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    .open-button:hover { background: var(--vscode-button-hoverBackground); }
    .link-button { border: 0; padding: 0; color: var(--vscode-textLink-foreground); background: none; cursor: pointer; text-align: left; }
    .link-button:hover { text-decoration: underline; }
    .footer { padding-top: 18px; margin-top: 28px; border-top: 1px solid var(--line); color: var(--vscode-descriptionForeground); font-size: 11px; }
    @media (max-width: 720px) { .layout { grid-template-columns: 1fr; } nav { display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 8px; } .nav-label { display: none; } .nav-button { width: auto; white-space: nowrap; } main { padding: 20px 15px 45px; } .scope { display: none; } .event-filters { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <header class="masthead">
      <img class="logo" src="${logo}" alt="Aardvark Labs logo">
      <div class="brand-lockup">
        <p class="brand-name">Aardvark Labs</p>
        <p class="product-name">Business Central Explorer</p>
      </div>
      <div class="scope">AL workspace<br>Local package analysis</div>
    </header>
    <div class="layout">
      <nav aria-label="Explorer views">
        <p class="nav-label">Explore</p>
        <div id="navigation"></div>
      </nav>
      <main>
        <section id="loading" class="loading" role="status" aria-live="polite" hidden>
          <p class="loading-title">Aardvark Labs is mapping your extension</p>
          <div class="loading-label"><span class="loading-spinner" aria-hidden="true"></span><span id="loading-message">Preparing analysis…</span></div>
          <div class="progress-track"><div id="progress-fill" class="progress-fill indeterminate"></div></div>
          <div id="loading-tasks" class="loading-tasks"></div>
          <pre id="loading-log" class="loading-log" role="log" aria-label="Analysis system log" aria-live="off"></pre>
        </section>
        <div id="main" aria-live="polite"></div>
      </main>
    </div>
  </div>
  <script nonce="${nonce}">
    const analysis = ${serializedAnalysis};
    const initialView = ${JSON.stringify(selectedView)};
    const initialProgress = ${JSON.stringify(progress ?? null)};
    const extensionVersion = ${JSON.stringify(extensionVersion)};
    const projectNames = ${JSON.stringify(projectNames)};
    const packageNames = ${JSON.stringify(packageNames)};
    const initialDocumentationScope = ${JSON.stringify(initialDocumentationScope ?? null)};
    const documentationMarkdown = "";
    const vscode = acquireVsCodeApi();
    const viewItems = [
      ["overview", "Overview", "◆"],
      ["relationships", "Relationships", "↗"],
      ["galaxy", "Galaxy View", "✦"],
      ["tables", "Tables", "▤"],
      ["pages", "Pages", "▣"],
      ["reports", "Reports", "▥"],
      ["integrationEvents", "Integration Events", "⚡"],
      ["documentation", "Documentation", "▧"]
    ];
    const typeLabels = {
      table: "Table",
      tableextension: "Table Extension",
      page: "Page",
      pageextension: "Page Extension",
      report: "Report",
      reportextension: "Report Extension",
      codeunit: "Code Unit",
      enum: "Enum",
      interface: "Interface",
      query: "Query",
      xmlport: "XMLport",
      permissionset: "Permission Set",
      profile: "Profile",
      controladdin: "Control Add-in",
      unknown: "Other",
    };
    const objectsByKey = new Map(analysis.objects.map((item) => [item.key, item]));
    let activeView = initialView;
    let whereUsedObjectKey;
    let whereUsedMember;
    let selectedObjectKey;
    let detailsReturnView = "galaxy";
    let whereUsedReturnView = "tables";
    const viewHistory = [];
    const main = document.getElementById("main");
    const loading = document.getElementById("loading");
    const loadingMessage = document.getElementById("loading-message");
    const progressFill = document.getElementById("progress-fill");
    const loadingTasks = document.getElementById("loading-tasks");
    const loadingLog = document.getElementById("loading-log");
    const loadingLogEntries = [];
    const maxLoadingLogEntries = 300;
    let lastLoadingLogEntry;
    const analysisTasks = [
      ["manifests", "Read workspace manifests"],
      ["sources", "Load AL source files"],
      ["packages", "Explore .alpackages dependencies"],
      ["relationships", "Map object relationships"],
      ["usages", "Index where-used references"],
      ["finalizing", "Finalize analysis"],
    ];

    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function titleFor(kind) { return kind.charAt(0).toUpperCase() + kind.slice(1); }
    function sameFieldName(left, right) {
      return typeof left === "string" && typeof right === "string" &&
        left.trim().toLowerCase() === right.trim().toLowerCase();
    }
    function makeButton(text, className, action) {
      const button = node("button", className, text);
      button.type = "button";
      button.addEventListener("click", action);
      return button;
    }
    function goTo(view) {
      viewHistory.length = 0;
      if (view === "whereUsed" && activeView !== "whereUsed") whereUsedReturnView = activeView;
      activeView = view;
      if (view === "whereUsed") {
        whereUsedObjectKey = undefined;
        whereUsedMember = undefined;
      }
      vscode.postMessage({ type: "setView", view });
      render();
    }
    function preserveCurrentView() {
      const content = document.createDocumentFragment();
      content.append(...main.childNodes);
      viewHistory.push({
        view: activeView,
        content,
        scrollY: window.scrollY,
        whereUsedObjectKey,
        whereUsedMember,
        selectedObjectKey,
        detailsReturnView,
        whereUsedReturnView,
      });
    }
    function restorePreviousView(fallbackView) {
      const previous = viewHistory.pop();
      if (!previous) {
        goTo(fallbackView);
        return;
      }
      activeView = previous.view;
      whereUsedObjectKey = previous.whereUsedObjectKey;
      whereUsedMember = previous.whereUsedMember;
      selectedObjectKey = previous.selectedObjectKey;
      detailsReturnView = previous.detailsReturnView;
      whereUsedReturnView = previous.whereUsedReturnView;
      main.replaceChildren(previous.content);
      renderNavigation();
      vscode.postMessage({ type: "setView", view: activeView });
      requestAnimationFrame(() => window.scrollTo(0, previous.scrollY));
    }
    function openWhereUsed(object, member) {
      preserveCurrentView();
      whereUsedObjectKey = object.key;
      whereUsedMember = member;
      whereUsedReturnView = activeView;
      activeView = "whereUsed";
      vscode.postMessage({ type: "setView", view: activeView });
      render();
    }
    function openObjectDetails(object) {
      preserveCurrentView();
      selectedObjectKey = object.key;
      detailsReturnView = activeView === "objectDetails" ? detailsReturnView : activeView;
      activeView = "objectDetails";
      render();
    }
    function openObjectSource(object, line) {
      if (object.sourceType === "workspace") {
        openObject(object, line);
      } else if (object.hasSourceText) {
        vscode.postMessage({
          type: "openSourceDocument",
          objectKey: object.key,
          line: Math.max(1, line || object.line),
        });
      }
    }
    function setProgress(progress) {
      if (!progress) {
        loading.hidden = true;
        return;
      }
      loading.hidden = false;
      loadingMessage.textContent = progress.message || "Processing…";
      const total = Number(progress.total);
      const completed = Number(progress.completed);
      const hasCount = Number.isFinite(total) && total > 0 && Number.isFinite(completed);
      const entryKey = JSON.stringify([
        progress.phase ?? "general",
        progress.message ?? "Processing…",
        hasCount ? completed : null,
        hasCount ? total : null,
      ]);
      if (entryKey !== lastLoadingLogEntry) {
        lastLoadingLogEntry = entryKey;
        const timestamp = new Date().toISOString();
        const phase = progress.phase ?? "general";
        const count = hasCount ? " " + completed + "/" + total : "";
        loadingLogEntries.push("[" + timestamp + "] [" + phase + "]" + count + " " + (progress.message || "Processing…"));
        if (loadingLogEntries.length > maxLoadingLogEntries) loadingLogEntries.shift();
        loadingLog.textContent = loadingLogEntries.join("\\n");
        loadingLog.scrollTop = loadingLog.scrollHeight;
      }
      const phaseIndex = analysisTasks.findIndex(([phase]) => phase === progress.phase);
      loadingTasks.replaceChildren();
      for (const [index, [phase, label]] of analysisTasks.entries()) {
        const row = node("div", "loading-task" + (index < phaseIndex ? " complete" : index === phaseIndex ? " current" : ""));
        const taskLabel = node("span", "loading-task-label", label);
        const bar = node("div", "loading-task-bar");
        const fill = node("div", "loading-task-fill");
        const percent = node("span", "loading-task-percent");
        let value = index < phaseIndex ? 100 : 0;
        if (index === phaseIndex) {
          const total = Number(progress.total);
          const completed = Number(progress.completed);
          value = Number.isFinite(total) && total > 0 && Number.isFinite(completed)
            ? Math.min(100, Math.max(0, completed / total * 100))
            : 18;
        }
        fill.style.width = value + "%";
        percent.textContent = Math.round(value) + "%";
        bar.append(fill);
        row.append(taskLabel, bar, percent);
        loadingTasks.append(row);
      }
      if (hasCount) {
        progressFill.classList.remove("indeterminate");
        progressFill.style.width = Math.max(0, Math.min(100, completed / total * 100)) + "%";
      } else {
        progressFill.classList.add("indeterminate");
        progressFill.style.width = "";
      }
    }
    function renderNavigation() {
      const navigation = document.getElementById("navigation");
      navigation.replaceChildren();
      for (const [key, label, icon] of viewItems) {
        const button = node("button", "nav-button");
        button.type = "button";
        button.setAttribute("aria-current", activeView === key ? "page" : "false");
        const mark = node("span", "nav-icon", icon);
        mark.setAttribute("aria-hidden", "true");
        button.append(mark, node("span", "", label));
        button.addEventListener("click", () => goTo(key));
        navigation.append(button);
      }
    }
    function renderHeading(eyebrow, heading, description) {
      main.append(node("p", "eyebrow", eyebrow), node("h1", "", heading), node("p", "lede", description));
    }
    function appendEmpty(parent, text) { parent.append(node("div", "empty", text)); }
    function openObject(object, line) {
      if (object && object.sourceType === "workspace") {
        vscode.postMessage({ type: "openLocation", path: object.sourcePath, line: Math.max(1, line || object.line) });
      }
    }
    function addViewSourceAction(parent, object, line) {
      parent.append(createSourceButton("View Source", object, line));
    }
    function createSourceButton(label, object, line) {
      const button = makeButton(label, "open-button", () => openObjectSource(object, line));
      if (object.sourceType !== "workspace" && !object.hasSourceText) {
        button.disabled = true;
        button.title = "Source code is not included in this package's symbol reference.";
      }
      return button;
    }
    function renderOverview() {
      renderHeading("Aardvark Labs · AL project intelligence", "Extension overview", "A live index of AL objects in this workspace and the .app dependencies available in .alpackages.");
      const currentObjects = analysis.objects.filter((item) => item.sourceType === "workspace").length;
      const tables = analysis.objects.filter((item) => item.kind === "table").length;
      const cards = [
        ["AL objects", analysis.objects.length],
        ["Dependency packages", analysis.packages.filter((item) => item.path.toLowerCase().endsWith(".app")).length],
        ["Relationships", analysis.relationships.length],
        ["Integration events", analysis.objects.reduce((sum, item) => sum + item.integrationEvents.length, 0)]
      ];
      const cardGrid = node("div", "cards");
      for (const [label, value] of cards) {
        const card = node("div", "card");
        card.append(node("div", "card-label", label), node("div", "card-value", String(value)));
        cardGrid.append(card);
      }
      main.append(cardGrid);
      const packagePanel = node("section", "panel");
      packagePanel.append(node("h2", "", "Analyzed extensions"));
      if (!analysis.packages.length) appendEmpty(packagePanel, "No AL project manifest or dependency package was found.");
      for (const item of analysis.packages) {
        const row = node("div", "package");
        const details = node("div");
        details.append(node("div", "package-name", item.name));
        details.append(node("div", "definition-meta", [item.publisher, item.version].filter(Boolean).join(" · ") || item.path));
        row.append(details, node("span", "badge", item.objectCount + " objects"));
        packagePanel.append(row);
      }
      if (analysis.packageDependencies.length) {
        packagePanel.append(node("h3", "", "Declared dependency coverage"));
        for (const item of analysis.packageDependencies) {
          const row = node("div", "package");
          const details = node("div");
          details.append(node("div", "package-name", item.dependency.name));
          details.append(node("div", "definition-meta", item.sourcePackage + " · requires " + (item.dependency.version || "any version")));
          row.append(details, node("span", "badge", item.installedPackage ? "Available · " + (item.installedVersion || "version unknown") : "Missing"));
          packagePanel.append(row);
        }
      }
      main.append(packagePanel);
      const diagnosticPanel = node("section", "panel");
      diagnosticPanel.append(node("h2", "", "Analysis diagnostics"));
      if (!analysis.diagnostics.length) appendEmpty(diagnosticPanel, "No package or source diagnostics.");
      for (const diagnostic of analysis.diagnostics) {
        const row = node("div", "diagnostic" + (diagnostic.severity === "error" ? " error" : ""));
        row.append(node("strong", "", diagnostic.severity.toUpperCase() + " · "), node("span", "", diagnostic.message));
        if (diagnostic.sourcePath) row.append(node("div", "definition-meta", diagnostic.sourcePath));
        diagnosticPanel.append(row);
      }
      main.append(diagnosticPanel);
      const notes = node("p", "footer", "Version " + extensionVersion + " · " + currentObjects + " workspace objects · " + tables + " tables · Last indexed " + new Date(analysis.analyzedAt).toLocaleString());
      main.append(notes);
    }
    function makeSearch(placeholder, onChange) {
      const toolbar = node("div", "toolbar");
      const search = node("input", "search");
      search.type = "search";
      search.placeholder = placeholder;
      search.setAttribute("aria-label", placeholder);
      search.addEventListener("input", () => onChange(search.value.trim().toLowerCase()));
      toolbar.append(search);
      return toolbar;
    }
    function renderRelationships() {
      renderHeading("Relationship explorer", "Relationships", "Select a table to center its TableRelation links. Drag to pan and use the mouse wheel to zoom.");
      const tableRelations = analysis.relationships.map((relation) => ({
        relation,
        source: objectsByKey.get(relation.sourceKey),
        target: objectsByKey.get(relation.targetKey),
      })).filter(({ relation, source, target }) =>
        relation.type.startsWith("TableRelation · ") &&
        (source?.kind === "table" || source?.kind === "tableextension") &&
        target?.kind === "table",
      );
      const tablePanel = node("section", "panel");
      tablePanel.append(node("h2", "", "Table-to-table relationships"));
      tablePanel.append(node("p", "muted", "Solid links are deterministic; dotted links are conditional TableRelation clauses."));
      const controls = node("div", "toolbar");
      const tableSelect = node("select", "select");
      tableSelect.setAttribute("aria-label", "Starting table");
      const allTables = node("option", "", "Choose center table");
      allTables.value = "";
      tableSelect.append(allTables);
      const startTables = analysis.objects
        .filter((object) => object.kind === "table" || object.kind === "tableextension")
        .sort((a, b) => a.name.localeCompare(b.name) || a.packageName.localeCompare(b.packageName));
      for (const table of startTables) {
        const option = node("option", "", table.name + " (ID " + table.id + ") · " + table.packageName);
        option.value = table.key;
        tableSelect.append(option);
      }
      tableSelect.value = startTables[0]?.key ?? "";
      const relatedFilter = node("input", "search");
      relatedFilter.type = "search";
      relatedFilter.placeholder = "Filter related table names or IDs…";
      relatedFilter.setAttribute("aria-label", "Filter related table");
      const tableDiagram = node("div", "tree-visual");
      const redraw = () => drawUniqueTableRelationships(tableDiagram, tableRelations, tableSelect.value, relatedFilter.value.trim().toLowerCase());
      tableSelect.addEventListener("change", redraw);
      relatedFilter.addEventListener("input", redraw);
      controls.append(tableSelect, relatedFilter);
      tablePanel.append(controls, tableDiagram);
      main.append(tablePanel);
      redraw();

      if (analysis.packageDependencies.length) {
        const dependencyPanel = node("section", "panel");
        dependencyPanel.append(node("h2", "", "Declared package dependencies"));
        for (const item of analysis.packageDependencies) {
          const row = node("div", "package");
          const details = node("div");
          details.append(node("div", "package-name", item.sourcePackage + " → " + item.dependency.name));
          details.append(node("div", "definition-meta", "Required " + (item.dependency.version || "version not specified") + (item.installedVersion ? " · available " + item.installedVersion : "")));
          row.append(details, node("span", "badge", item.installedPackage ? "Resolved" : "Missing"));
          dependencyPanel.append(row);
        }
        main.append(dependencyPanel);
      }
    }
    function renderGalaxyView() {
      renderHeading("Extension constellation", "Galaxy View", "Explore analyzed objects grouped by extension. Filter by type or name, then zoom to reveal labels as objects have room to separate.");
      const panel = node("section", "panel");
      panel.append(node("h2", "", "Objects by extension"));
      const controls = node("div", "toolbar");
      const typeKey = node("fieldset", "type-key");
      typeKey.append(node("legend", "", "Object types"));
      const typeNames = [
        ["table", "Tables"], ["tableextension", "Table extensions"], ["page", "Pages"],
        ["pageextension", "Page extensions"], ["report", "Reports"], ["reportextension", "Report extensions"],
        ["codeunit", "Codeunits"], ["enum", "Enums"], ["interface", "Interfaces"], ["query", "Queries"],
        ["xmlport", "XMLports"], ["permissionset", "Permission sets"], ["profile", "Profiles"],
        ["controladdin", "Control add-ins"], ["unknown", "Other"],
      ];
      const selectedTypes = new Set(["table", "tableextension"]);
      const search = node("input", "search");
      search.type = "search";
      search.placeholder = "Filter object names or extensions…";
      search.setAttribute("aria-label", search.placeholder);
      const graph = node("div", "tree-visual galaxy-viewport");
      const drawGalaxy = () => {
        const query = search.value.trim().toLowerCase();
        const objects = analysis.objects.filter((object) =>
          selectedTypes.has(object.kind) &&
          (object.name + " " + object.packageName + " " + object.id).toLowerCase().includes(query),
        );
        const keys = new Set(objects.map((object) => object.key));
        const relations = analysis.relationships.filter((relation) =>
          relation.type === "extends" &&
          keys.has(relation.sourceKey) && keys.has(relation.targetKey),
        );
        drawObjectGraph(graph, objects, relations, true, "Galaxy View of selected object types grouped by extension", undefined, query.length > 0);
      };
      for (const [kind, label] of typeNames) {
        const choice = node("label", "type-choice");
        const checkbox = node("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedTypes.has(kind);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedTypes.add(kind);
          else selectedTypes.delete(kind);
          drawGalaxy();
        });
        choice.append(checkbox, node("span", "", label));
        typeKey.append(choice);
      }
      search.addEventListener("input", drawGalaxy);
      controls.append(typeKey, search);
      panel.append(controls, graph);
      main.append(panel);
      drawGalaxy();
    }
    function addTableGraphNode(parent, object, x, y, width, height, isCenter, relationFields = []) {
      const item = document.createElementNS(parent.namespaceURI, "g");
      item.setAttribute("class", "graph-object node-interactive" + (isCenter ? " center-node" : ""));
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-label", "Open details for table " + object.name);
      const rect = document.createElementNS(parent.namespaceURI, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.setAttribute("rx", "8");
      rect.setAttribute("class", "node");
      const label = document.createElementNS(parent.namespaceURI, "text");
      label.setAttribute("x", String(x + width / 2));
      label.setAttribute("y", String(y + (relationFields.length ? 22 : 30)));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "node-label");
      label.textContent = object.name + " · ID " + object.id;
      const meta = document.createElementNS(parent.namespaceURI, "text");
      meta.setAttribute("x", String(x + width / 2));
      meta.setAttribute("y", String(y + (relationFields.length ? 42 : 53)));
      meta.setAttribute("text-anchor", "middle");
      meta.setAttribute("class", "edge-label");
      meta.textContent = object.kind + " · " + object.packageName;
      item.append(rect, label, meta);
      if (relationFields.length) {
        const fieldLabel = document.createElementNS(parent.namespaceURI, "text");
        fieldLabel.setAttribute("x", String(x + width / 2));
        fieldLabel.setAttribute("y", String(y + 63));
        fieldLabel.setAttribute("text-anchor", "middle");
        fieldLabel.setAttribute("class", "edge-label relation-field-label");
        fieldLabel.textContent = relationFields.join(", ");
        if (relationFields.join(", ").length * 5.5 > 220) {
          fieldLabel.setAttribute("textLength", "220");
          fieldLabel.setAttribute("lengthAdjust", "spacingAndGlyphs");
        }
        fieldLabel.setAttribute("aria-label", "Related field: " + relationFields.join(", "));
        item.append(fieldLabel);
      }
      item.addEventListener("dblclick", (event) => {
        event.preventDefault();
        openObjectDetails(object);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openObjectDetails(object);
        }
      });
      parent.append(item);
      return item;
    }
    function drawUniqueTableRelationships(container, relationships, startingKey, relatedKey = "") {
      const selected = objectsByKey.get(startingKey);
      const center = selected ?? relationships[0]?.source;
      const filtered = relationships.filter(({ source, target }) =>
        !center || source.key === center.key || target.key === center.key,
      ).filter(({ source, target }) => !relatedKey ||
        (source.key === center?.key && (target.name + " " + target.id).toLowerCase().includes(relatedKey)) ||
        (target.key === center?.key && (source.name + " " + source.id).toLowerCase().includes(relatedKey)),
      );
      if (!center) {
        container.replaceChildren();
        appendEmpty(container, "No tables are available to display.");
        return;
      }
      const sides = { left: new Map(), right: new Map() };
      for (const item of filtered) {
        const side = item.source.key === center.key ? "right" : "left";
        const related = side === "right" ? item.target : item.source;
        const entries = sides[side];
        const existing = entries.get(related.key);
        if (existing) existing.relations.push(item.relation);
        else entries.set(related.key, { object: related, relations: [item.relation] });
      }
      const left = [...sides.left.values()];
      const right = [...sides.right.values()];
      const rowHeight = 86;
      const height = Math.max(360, Math.max(left.length, right.length) * rowHeight + 100);
      const centerX = 475;
      const centerY = height / 2;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 950 " + height);
      svg.setAttribute("class", "table-relationship-svg");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Table relationships centered on " + center.name);
      const world = document.createElementNS(svg.namespaceURI, "g");
      world.setAttribute("class", "graph-world");
      svg.append(world);
      const nodeWidth = 250;
      const nodeHeight = 76;
      const centerNode = addTableGraphNode(world, center, centerX - nodeWidth / 2, centerY - nodeHeight / 2, nodeWidth, nodeHeight, true);
      centerNode.setAttribute("aria-label", "Open details for center table " + center.name);
      const addRelatedColumn = (entries, side) => {
        const x = side === "left" ? 24 : 676;
        const startY = centerY - ((entries.length - 1) * rowHeight) / 2;
        entries.forEach(({ object, relations }, index) => {
          const y = startY + index * rowHeight;
          const fieldNames = [...new Set(relations.map((relation) => relation.type.replace("TableRelation · ", "")))];
          const objectNode = addTableGraphNode(world, object, x, y - nodeHeight / 2, nodeWidth, nodeHeight, false, fieldNames);
          const edge = document.createElementNS(svg.namespaceURI, "path");
          const fromX = side === "left" ? x + nodeWidth : centerX - nodeWidth / 2;
          const toX = side === "left" ? centerX - nodeWidth / 2 : x;
          edge.setAttribute("d", "M " + fromX + " " + y + " C " + (fromX + toX) / 2 + " " + y + ", " + (fromX + toX) / 2 + " " + centerY + ", " + toX + " " + centerY);
          edge.setAttribute("class", "edge" + (relations.some((relation) => relation.conditional) ? " conditional" : ""));
          const title = document.createElementNS(svg.namespaceURI, "title");
          title.textContent = fieldNames.join("; ");
          edge.append(title);
          world.insertBefore(edge, centerNode);
        });
      };
      addRelatedColumn(left, "left");
      addRelatedColumn(right, "right");
      container.replaceChildren(svg);
      enableGraphNavigation(container, svg, world, false, false);
    }
    function drawObjectGraph(container, objects, relationships, clustered, ariaLabel, centerKey, filtered = false) {
      container.replaceChildren();
      if (!objects.length) {
        appendEmpty(container, "No objects match this view.");
        return;
      }
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", ariaLabel);
      const groups = clustered
        ? [...new Set(objects.map((object) => object.packageName))].sort((a, b) => a.localeCompare(b))
        : [""];
      const groupedObjects = groups.map((name) => ({
        name,
        objects: clustered ? objects.filter((object) => object.packageName === name) : objects,
      }));
      const positions = new Map();
      const clusterInfo = new Map();
      let width = 1000;
      let height = 720;
      if (clustered) {
        const clusterColumns = Math.ceil(Math.sqrt(groupedObjects.length));
        const largestClusterRows = Math.max(...groupedObjects.map((group) =>
          Math.ceil(group.objects.length / Math.max(1, Math.ceil(Math.sqrt(group.objects.length)))),
        ));
        const clusterCell = Math.max(680, largestClusterRows * 30 + 200);
        groupedObjects.forEach((group, groupIndex) => {
          const columns = Math.max(1, Math.ceil(Math.sqrt(group.objects.length)));
          const rows = Math.ceil(group.objects.length / columns);
          const clusterWidth = columns * 30 + 90;
          const clusterHeight = rows * 30 + 110;
          const center = {
            x: (groupIndex % clusterColumns) * clusterCell + clusterCell / 2,
            y: Math.floor(groupIndex / clusterColumns) * clusterCell + clusterCell / 2,
          };
          clusterInfo.set(group.name, { center, width: clusterWidth, height: clusterHeight });
          group.objects.forEach((object, index) => {
            positions.set(object.key, {
              x: center.x + ((index % columns) - (columns - 1) / 2) * 30,
              y: center.y + Math.floor(index / columns) * 30 - (rows - 1) * 15,
            });
          });
        });
        width = clusterColumns * clusterCell;
        height = Math.ceil(groupedObjects.length / clusterColumns) * clusterCell;
      } else {
        const centerObject = objects.find((object) => object.key === centerKey) ?? objects[0];
        const center = { x: width / 2, y: height / 2 };
        positions.set(centerObject.key, center);
        const remaining = objects.filter((object) => object.key !== centerObject.key);
        remaining.forEach((object, index) => {
          const angle = 2 * Math.PI * index / Math.max(1, remaining.length) - Math.PI / 2;
          const radius = 230 + Math.floor(index / 12) * 105;
          positions.set(object.key, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
        });
        const radius = 230 + Math.ceil(remaining.length / 12) * 105 + 180;
        width = Math.max(1000, radius * 2);
        height = Math.max(720, radius * 2);
        const offsetX = (width - 1000) / 2;
        const offsetY = (height - 720) / 2;
        for (const place of positions.values()) {
          place.x += offsetX;
          place.y += offsetY;
        }
      }
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      if (clustered) {
        svg.setAttribute("class", "galaxy-svg");
      } else {
        svg.setAttribute("width", String(width));
        svg.setAttribute("height", String(height));
      }

      const colors = new Map(groups.map((name, index) => [name, "hsl(" + (index * 137.508 % 360) + " 62% 54%)"]));
      const world = document.createElementNS(svg.namespaceURI, "g");
      world.setAttribute("class", "graph-world");
      svg.append(world);
      let magnifier;
      if (clustered) {
        magnifier = node("div", "galaxy-magnifier");
        magnifier.hidden = true;
        const lens = node("span", "galaxy-magnifier-lens");
        lens.append(node("span", "galaxy-magnifier-dot"));
        magnifier.append(lens, node("span", "galaxy-magnifier-name"));
      }
      if (clustered) {
        for (const group of groupedObjects) {
          const info = clusterInfo.get(group.name);
          const cluster = document.createElementNS(svg.namespaceURI, "rect");
          cluster.setAttribute("x", String(info.center.x - info.width / 2));
          cluster.setAttribute("y", String(info.center.y - info.height / 2));
          cluster.setAttribute("width", String(info.width));
          cluster.setAttribute("height", String(info.height));
          cluster.setAttribute("rx", "24");
          cluster.setAttribute("class", "galaxy-cluster");
          cluster.style.setProperty("--cluster-color", colors.get(group.name));
          const title = document.createElementNS(svg.namespaceURI, "title");
          title.textContent = group.name + " · " + group.objects.length + " objects";
          cluster.append(title);
          world.append(cluster);
          const label = document.createElementNS(svg.namespaceURI, "text");
          label.setAttribute("x", String(info.center.x));
          label.setAttribute("y", String(info.center.y - info.height / 2 + 22));
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("class", "galaxy-extension-label");
          label.style.setProperty("--cluster-color", colors.get(group.name));
          label.textContent = group.name;
          world.append(label);
        }
      }
      for (const relation of relationships) {
        const source = positions.get(relation.sourceKey);
        const target = positions.get(relation.targetKey);
        if (!source || !target) continue;
        const edge = document.createElementNS(svg.namespaceURI, "path");
        edge.setAttribute("d", "M " + source.x + " " + source.y + " L " + target.x + " " + target.y);
        edge.setAttribute("class", "edge" + (relation.conditional ? " conditional" : ""));
        edge.dataset.sourceKey = relation.sourceKey;
        edge.dataset.targetKey = relation.targetKey;
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = relation.type;
        edge.append(title);
        world.append(edge);
      }
      for (const group of groupedObjects) {
        for (const object of group.objects) {
          const point = positions.get(object.key);
          const item = document.createElementNS(svg.namespaceURI, "g");
          item.setAttribute("class", clustered ? "galaxy-point" : "graph-object");
          item.dataset.objectKey = object.key;
          item.dataset.x = String(point.x);
          item.dataset.y = String(point.y);
          item.dataset.packageName = group.name;
          const marker = document.createElementNS(svg.namespaceURI, clustered ? "circle" : "rect");
          if (clustered) {
            marker.setAttribute("cx", String(point.x));
            marker.setAttribute("cy", String(point.y));
            marker.setAttribute("r", "9");
            marker.setAttribute("class", "galaxy-dot");
            marker.style.setProperty("--cluster-color", colors.get(group.name));
          } else {
            marker.setAttribute("x", String(point.x - 110));
            marker.setAttribute("y", String(point.y - 26));
            marker.setAttribute("width", "220");
            marker.setAttribute("height", "52");
            marker.setAttribute("rx", "8");
            marker.setAttribute("class", "node");
          }
          const label = document.createElementNS(svg.namespaceURI, "text");
          label.setAttribute("x", String(point.x));
          label.setAttribute("y", String(point.y + (clustered ? -12 : -3)));
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("class", clustered ? "galaxy-object-label" : "node-label");
          label.textContent = object.name + " · " + object.kind + " " + object.id;
          const title = document.createElementNS(svg.namespaceURI, "title");
          title.textContent = object.name + " · " + object.kind + " " + object.id + " · " + object.packageName;
          item.append(marker, label, title);
          item.addEventListener("dblclick", (event) => {
            event.preventDefault();
            openObjectDetails(object);
          });
          if (clustered) {
            item.addEventListener("pointerenter", (event) => {
              magnifier.hidden = false;
              magnifier.querySelector(".galaxy-magnifier-name").textContent =
                object.name + " · " + object.kind + " " + object.id;
              magnifier.querySelector(".galaxy-magnifier-dot").style.setProperty(
                "--cluster-color",
                colors.get(group.name),
              );
              positionGalaxyMagnifier(magnifier, container, event);
            });
            item.addEventListener("pointermove", (event) => positionGalaxyMagnifier(magnifier, container, event));
            item.addEventListener("pointerleave", () => {
              magnifier.hidden = true;
            });
            item.addEventListener("click", (event) => {
              event.stopPropagation();
              selectGalaxyObject(world, object.key);
            });
          }
          item.setAttribute("class", item.getAttribute("class") + " node-interactive");
          item.setAttribute("role", "button");
          item.setAttribute("tabindex", "0");
          item.setAttribute("aria-label", "Open details for " + object.kind + " " + object.name);
          item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openObjectDetails(object);
            }
          });
          world.append(item);
        }
      }
      if (clustered) container.append(svg, magnifier);
      else container.append(svg);
      enableGraphNavigation(container, svg, world, clustered, filtered);
    }
    function positionGalaxyMagnifier(magnifier, container, event) {
      const bounds = container.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, event.clientX - bounds.left + container.scrollLeft + 14),
        Math.max(8, container.scrollLeft + container.clientWidth - magnifier.offsetWidth - 8),
      );
      const top = Math.min(
        Math.max(8, event.clientY - bounds.top + container.scrollTop + 14),
        Math.max(8, container.scrollTop + container.clientHeight - magnifier.offsetHeight - 8),
      );
      magnifier.style.left = left + "px";
      magnifier.style.top = top + "px";
    }
    function selectGalaxyObject(world, objectKey) {
      const related = new Set([objectKey]);
      const edges = [...world.querySelectorAll(".edge[data-source-key][data-target-key]")];
      for (const edge of edges) {
        if (edge.dataset.sourceKey === objectKey) related.add(edge.dataset.targetKey);
        if (edge.dataset.targetKey === objectKey) related.add(edge.dataset.sourceKey);
      }
      const connectedEdges = edges.filter(
        (edge) => edge.dataset.sourceKey === objectKey || edge.dataset.targetKey === objectKey,
      );
      for (const edge of edges) {
        edge.classList.toggle("is-related", connectedEdges.includes(edge));
        edge.classList.toggle("is-dimmed", connectedEdges.length > 0 && !connectedEdges.includes(edge));
      }
      for (const point of world.querySelectorAll(".galaxy-point")) {
        const selected = point.dataset.objectKey === objectKey;
        const endpoint = !selected && related.has(point.dataset.objectKey);
        point.classList.toggle("is-selected", selected);
        point.classList.toggle("is-related-endpoint", endpoint);
        point.classList.toggle("is-dimmed", connectedEdges.length > 0 && !related.has(point.dataset.objectKey));
      }
    }
    function enableGraphNavigation(container, svg, world, galaxy, filtered) {
      let scale = galaxy && filtered ? 1.5 : 1;
      let translateX = 0;
      let translateY = 0;
      let pointer;
      let origin;
      const apply = () => {
        world.setAttribute("transform", "translate(" + translateX + " " + translateY + ") scale(" + scale + ")");
        if (galaxy) {
          const points = [...world.querySelectorAll(".galaxy-point")];
          const threshold = filtered && points.length <= 18 ? 1.25 : 2;
          const occupied = [];
          for (const point of points) {
            const x = (Number(point.dataset.x) * scale) + translateX;
            const y = (Number(point.dataset.y) * scale) + translateY;
            const label = point.querySelector(".galaxy-object-label");
            label.style.fontSize = (11 / scale) + "px";
            label.setAttribute("y", String(Number(point.dataset.y) - 12 / scale));
            const width = label.textContent.length * 7 + 20;
            const bounds = { left: x - width / 2, right: x + width / 2, top: y - 16, bottom: y };
            const overlaps = occupied.some((other) =>
              bounds.left < other.right + 8 && bounds.right + 8 > other.left &&
              bounds.top < other.bottom + 8 && bounds.bottom + 8 > other.top,
            );
            const visible = scale >= threshold && !overlaps ||
              point.classList.contains("is-selected") ||
              point.classList.contains("is-related-endpoint");
            label.classList.toggle("visible", visible);
            if (visible) occupied.push(bounds);
          }
        }
      };
      container.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest(".graph-object, .galaxy-point")) return;
        pointer = event.pointerId;
        origin = { x: event.clientX, y: event.clientY, translateX, translateY };
        container.setPointerCapture(pointer);
      });
      container.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointer || !origin) return;
        const rect = svg.getBoundingClientRect();
        translateX = origin.translateX + (event.clientX - origin.x) * (Number(svg.viewBox.baseVal.width) / rect.width);
        translateY = origin.translateY + (event.clientY - origin.y) * (Number(svg.viewBox.baseVal.height) / rect.height);
        apply();
      });
      const stopDrag = (event) => {
        if (event.pointerId === pointer) {
          pointer = undefined;
          origin = undefined;
        }
      };
      container.addEventListener("pointerup", stopDrag);
      container.addEventListener("pointercancel", stopDrag);
      container.addEventListener("wheel", (event) => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (Number(svg.viewBox.baseVal.width) / rect.width);
        const y = (event.clientY - rect.top) * (Number(svg.viewBox.baseVal.height) / rect.height);
        const nextScale = Math.max(0.2, Math.min(12, scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
        translateX = x - ((x - translateX) / scale) * nextScale;
        translateY = y - ((y - translateY) / scale) * nextScale;
        scale = nextScale;
        apply();
      }, { passive: false });
      apply();
    }
    function renderTables() {
      renderHeading("Schema browser", "Tables", "Review table and field definitions from the active extension and directly available dependency symbols.");
      const host = node("div");
      const filter = makeSearch("Search table names or IDs…", (query) => drawDefinitions(host, "table", query, true));
      main.append(filter, host);
      drawDefinitions(host, "table", "", true);
    }
    function renderPages() {
      renderHeading("UI object browser", "Pages", "Inspect pages and page extensions, their source tables, and exposed AL properties.");
      const host = node("div");
      const filter = makeSearch("Search page names or IDs…", (query) => drawDefinitions(host, "page", query, false));
      main.append(filter, host);
      drawDefinitions(host, "page", "", false);
    }
    function renderReports() {
      renderHeading("Output and processing review", "Reports", "Review report objects, data-item tables, layout and processing properties across the analyzed extension set.");
      const host = node("div");
      const filter = makeSearch("Search report names or IDs…", (query) => drawDefinitions(host, "report", query, false));
      main.append(filter, host);
      drawDefinitions(host, "report", "", false);
    }
    function drawDefinitions(host, kind, query, showFields) {
      host.replaceChildren();
      const kindSet = kind === "page" ? new Set(["page", "pageextension"]) : kind === "report" ? new Set(["report", "reportextension"]) : new Set(["table", "tableextension"]);
      const items = analysis.objects.filter((item) => kindSet.has(item.kind))
        .filter((item) => (item.name + " " + item.id).toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) {
        appendEmpty(host, "No matching " + (kind === "table" ? "table" : kind) + " objects found.");
        return;
      }
      for (const object of items) {
        const section = node("details", "panel object-card");
        const summary = node("summary");
        const summaryIdentity = node("span", "object-summary");
        const definitionCaption = kind === "page" || kind === "table"
          ? object.properties.Caption?.trim()
          : undefined;
        const objectName = object.name.trim() || "Table " + object.id;
        const displayTitle = kind === "table"
          ? objectName
          : definitionCaption || objectName;
        summaryIdentity.append(node("span", "definition-title", displayTitle));
        if (kind === "table" && definitionCaption) {
          summaryIdentity.append(node("span", "object-caption", "Caption: " + definitionCaption));
        } else if (definitionCaption) {
          summaryIdentity.append(node("span", "object-caption", "AL object: " + object.name));
        } else if (object.properties.Caption) {
          summaryIdentity.append(node("span", "object-caption", "Caption: " + object.properties.Caption));
        }
        summaryIdentity.append(node("span", "badge", "ID " + object.id));
        summary.append(summaryIdentity);
        const body = node("div", "object-body");
        const heading = node("div", kind === "table" ? "definition-head table-definition-head" : "definition-head");
        const meta = node("div", "definition-meta", object.kind + " · " + object.packageName + " · " + object.sourcePath + ":" + object.line);
        heading.append(meta);
        const sourceColumn = node("div", "definition-action-column");
        sourceColumn.append(node("span", "definition-action-label", "Source"));
        addViewSourceAction(sourceColumn, object, object.line);
        heading.append(sourceColumn);
        if (kind === "table" || kind === "page") {
          const whereUsedColumn = node("div", "definition-action-column");
          whereUsedColumn.append(node("span", "definition-action-label", "Impact"));
          whereUsedColumn.append(makeButton("Where used", "open-button", () => openWhereUsed(object)));
          heading.append(whereUsedColumn);
        }
        body.append(heading);
        const properties = Object.entries(object.properties);
        if (properties.length && kind !== "report") {
          const propertyList = node("div", "property-list");
          for (const [key, value] of properties) propertyList.append(node("span", "badge", key + ": " + value));
          body.append(propertyList);
        }
        if (kind === "page" && object.controls.length) {
          const groups = object.controlGroups?.length
            ? object.controlGroups
            : [{ group: "Page controls", controls: object.controls }];
          for (const group of groups) {
            const groupPanel = node("section", "page-control-group");
            groupPanel.append(node("h3", "", group.group));
            const controlList = node("div", "property-list");
            for (const control of group.controls) controlList.append(node("span", "badge", control));
            groupPanel.append(controlList);
            body.append(groupPanel);
          }
        }
        if (kind === "report") {
          const reportItems = object.reportDataItems?.length
            ? object.reportDataItems
            : object.dataItems.map((item) => {
                const [name, ...tableParts] = item.split(":");
                return {
                  name: name.trim(),
                  sourceTable: tableParts.join(":").trim(),
                  line: object.line,
                  properties: {},
                };
              });
          const sources = node("section", "report-section");
          sources.append(node("h3", "", "Data sources"));
          if (reportItems.length) {
            const sourceTable = node("div", "table-scroll");
            const table = node("table", "field-table report-data-table");
            const thead = node("thead");
            const header = node("tr");
            for (const label of ["Data item", "Source table", "Filters", "Data item links", "Sort / view", "Other"]) {
              header.append(node("th", "", label));
            }
            thead.append(header);
            const tbody = node("tbody");
            for (const item of reportItems) {
              const row = node("tr");
              const filters = [
                item.properties.RequestFilterFields && "Request fields: " + item.properties.RequestFilterFields,
                item.properties.DataItemTableFilter && "Table filter: " + item.properties.DataItemTableFilter,
                item.properties.RequestFilterHeading && "Filter heading: " + item.properties.RequestFilterHeading,
              ].filter(Boolean);
              const links = [
                item.properties.DataItemLink,
                item.properties.DataItemLinkReference && "Reference: " + item.properties.DataItemLinkReference,
              ].filter(Boolean);
              row.append(
                node("td", "", item.name),
                node("td", "", item.sourceTable || "Not available in symbols"),
                node("td", "", filters.join("\\n") || "—"),
                node("td", "", links.join("\\n") || "—"),
                node("td", "", item.properties.DataItemTableView || "—"),
                node("td", "", [
                  item.properties.PrintOnlyIfDetail && "Print only if detail: " + item.properties.PrintOnlyIfDetail,
                  item.properties.MaxIteration && "Maximum iterations: " + item.properties.MaxIteration,
                ].filter(Boolean).join("\\n") || "—"),
              );
              row.title = "AL source line " + item.line;
              tbody.append(row);
            }
            table.append(thead, tbody);
            sourceTable.append(table);
            sources.append(sourceTable);
          } else {
            sources.append(node("p", "muted", "No report data-item symbols are available."));
          }
          body.append(sources);
          const requestPageFields = object.reportRequestPageControls ?? [];
          if (requestPageFields.length) {
            const requestPage = node("section", "report-section");
            requestPage.append(node("h3", "", "Request page fields"));
            for (const group of requestPageFields) {
              const groupPanel = node("div", "page-control-group");
              groupPanel.append(node("strong", "", group.group));
              groupPanel.append(node("div", "report-field-list", group.controls.join(", ")));
              requestPage.append(groupPanel);
            }
            body.append(requestPage);
          }
          if (properties.length) {
            const reportOptions = node("section", "report-section");
            reportOptions.append(node("h3", "", "Report properties"));
            const optionList = node("div", "property-list");
            for (const [key, value] of properties) optionList.append(node("span", "badge", key + ": " + value));
            reportOptions.append(optionList);
            body.append(reportOptions);
          }
        }
        if (showFields && object.fields.length) {
          const table = node("table", "field-table");
          const thead = node("thead");
          const headerRow = node("tr");
          for (const label of ["ID", "Field", "Type", "Where used"]) headerRow.append(node("th", "", label));
          thead.append(headerRow);
          const tbody = node("tbody");
          for (const field of object.fields) {
            const row = node("tr");
            const fieldAction = node("td");
            fieldAction.append(makeButton("Where used", "link-button", () => openWhereUsed(object, field.name)));
            row.append(node("td", "", field.id), node("td", "", field.name), node("td", "", field.type), fieldAction);
            tbody.append(row);
          }
          table.append(thead, tbody);
          body.append(table);
        } else if (showFields) {
          body.append(node("p", "muted", "No field symbols are available for this object."));
        }
        section.append(summary, body);
        host.append(section);
      }
      host.prepend(node("p", "muted", items.length + " object" + (items.length === 1 ? "" : "s")));
    }
    function renderObjectDetails() {
      const object = objectsByKey.get(selectedObjectKey);
      if (!object) {
        renderHeading("Object details", "Object not found", "The selected object is no longer available in this analysis.");
        main.append(makeButton("Back to Galaxy View", "open-button", () => restorePreviousView(detailsReturnView)));
        return;
      }
      renderHeading(object.kind, object.name, object.properties.Caption ? "Caption: " + object.properties.Caption : "Object details and references.");
      const panel = node("section", "panel");
      panel.append(node("h2", "", object.kind + " " + object.id));
      panel.append(node("p", "definition-meta", object.packageName + " · " + object.sourcePath + ":" + object.line));
      const actions = node("div", "toolbar");
      actions.append(makeButton("Back to " + titleFor(detailsReturnView), "open-button", () => restorePreviousView(detailsReturnView)));
      addViewSourceAction(actions, object, object.line);
      actions.append(makeButton("Where used", "open-button", () => openWhereUsed(object)));
      panel.append(actions);
      const properties = Object.entries(object.properties);
      if (properties.length) {
        const propertyList = node("div", "property-list");
        for (const [key, value] of properties) propertyList.append(node("span", "badge", key + ": " + value));
        panel.append(propertyList);
      }
      if (object.fields.length) {
        panel.append(node("h3", "", "Fields"));
        const table = node("table", "field-table");
        const body = node("tbody");
        for (const field of object.fields) {
          const row = node("tr");
          const action = node("td");
          action.append(makeButton("Where used", "link-button", () => openWhereUsed(object, field.name)));
          row.append(node("td", "", field.id), node("td", "", field.name), node("td", "", field.type), action);
          body.append(row);
        }
        table.append(body);
        panel.append(table);
      }
      main.append(panel);
    }
    function renderWhereUsed() {
      renderHeading("Impact analysis", "Where Used", "Review the selected object and its fields, then inspect every indexed source location that references it.");
      const selectedObject = objectsByKey.get(whereUsedObjectKey);
      const actions = node("div", "toolbar");
      actions.append(makeButton("Back to " + titleFor(whereUsedReturnView), "open-button", () => restorePreviousView(whereUsedReturnView)));
      if (selectedObject) main.append(actions, renderWhereUsedSummary(selectedObject, whereUsedMember));
      else main.append(actions);
      const host = node("div");
      const filter = makeSearch("Search object names, IDs, fields, or source lines…", (query) => drawUsages(host, query, selectedObject?.key, whereUsedMember));
      if (selectedObject) {
        filter.append(makeButton("Show all references", "open-button", () => {
          whereUsedObjectKey = undefined;
          whereUsedMember = undefined;
          renderWhereUsed();
        }));
      }
      main.append(filter, host);
      drawUsages(host, "", selectedObject?.key, whereUsedMember);
    }
    function renderWhereUsedSummary(object, member) {
      const panel = node("section", "panel");
      panel.append(node("h2", "", object.name + (object.properties.Caption ? " · " + object.properties.Caption : "")));
      panel.append(node("p", "definition-meta", object.kind + " " + object.id + " · " + object.packageName + " · " + object.sourcePath));
      const actions = node("div", "toolbar");
      actions.append(makeButton("View details", "open-button", () => openObjectDetails(object)));
      addViewSourceAction(actions, object, object.line);
      panel.append(actions);
      const properties = Object.entries(object.properties);
      if (properties.length) {
        const propertyList = node("div", "property-list");
        for (const [key, value] of properties) propertyList.append(node("span", "badge", key + ": " + value));
        panel.append(propertyList);
      }
      const fields = member ? object.fields.filter((field) => sameFieldName(field.name, member)) : object.fields;
      if (fields.length) {
        panel.append(node("h3", "", member ? "Selected field" : "Fields"));
        const table = node("table", "field-table");
        const thead = node("thead");
        const header = node("tr");
        for (const label of ["ID", "Field", "Type", "TableRelation"]) header.append(node("th", "", label));
        thead.append(header);
        const body = node("tbody");
        for (const field of fields) {
          const row = node("tr");
          row.append(
            node("td", "", field.id),
            node("td", "", field.name),
            node("td", "", field.type),
            node("td", "", field.tableRelation || "—"),
          );
          body.append(row);
        }
        table.append(thead, body);
        panel.append(table);
      } else if (member) {
        panel.append(node("p", "muted", "Field details are not available for " + member + "."));
      }
      return panel;
    }
    function drawUsages(host, query, symbolKey, member) {
      host.replaceChildren();
      const matches = analysis.usages.map((usage) => ({
        usage,
        symbol: objectsByKey.get(usage.symbolKey),
        object: objectsByKey.get(usage.objectKey)
      })).filter((item) => item.symbol && item.object)
        .filter(({ usage }) => (!symbolKey || usage.symbolKey === symbolKey) && (!member || sameFieldName(usage.member, member)))
        .filter(({ usage, symbol, object }) => [symbol.name, symbol.id, usage.member, object.name, object.id, object.packageName, usage.line, usage.excerpt].join(" ").toLowerCase().includes(query))
        .slice(0, 500);
      if (!matches.length) {
        appendEmpty(host, analysis.objects.length ? "No indexed references match this search." : "No AL objects are available to search.");
        return;
      }
      host.append(node("p", "muted", matches.length + " reference" + (matches.length === 1 ? "" : "s") + (matches.length === 500 ? " · showing first 500" : "")));
      const table = node("table", "field-table usage-table");
      const thead = node("thead");
      const header = node("tr");
      for (const label of ["Referencing object", "Type / package", "Line", "Reference details", "Navigation"]) header.append(node("th", "", label));
      thead.append(header);
      const tbody = node("tbody");
      for (const { usage, symbol, object } of matches) {
        const row = node("tr");
        const objectCell = node("td");
        objectCell.append(node("strong", "", object.name));
        objectCell.append(node("div", "definition-meta", object.sourcePath));
        const typeCell = node("td", "", object.kind + " · " + object.packageName);
        const lineCell = node("td", "", String(usage.line));
        const referenceCell = node("td");
        const details = node("details", "usage-details");
        details.append(node("summary", "", symbol.name + (usage.member ? " · " + usage.member : "")));
        details.append(node("div", "usage-detail-body", usage.excerpt || "No source excerpt is available."));
        const sourceMeta = node("div", "definition-meta", symbol.kind + " " + symbol.name + (usage.member ? " · field " + usage.member : "") + " · " + symbol.packageName);
        details.append(sourceMeta);
        referenceCell.append(details);
        const actionCell = node("td");
        const actions = node("div", "usage-actions");
        actions.append(createSourceButton("View Call Site", object, usage.line));
        actions.append(createSourceButton("View Definition", symbol, usage.member ? symbol.fields.find((field) => field.name === usage.member)?.line ?? symbol.line : symbol.line));
        actionCell.append(actions);
        row.append(objectCell, typeCell, lineCell, referenceCell, actionCell);
        tbody.append(row);
      }
      table.append(thead, tbody);
      const tableScroll = node("div", "table-scroll");
      tableScroll.append(table);
      host.append(tableScroll);
    }
    function associatedTableObjects(object) {
      const found = new Map();
      const pending = [object.key];
      const visited = new Set();
      while (pending.length) {
        const currentKey = pending.shift();
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);
        const current = objectsByKey.get(currentKey);
        if (current?.kind === "table") found.set(current.key, current);
        for (const relation of analysis.relationships) {
          if (relation.sourceKey !== currentKey || relation.type.startsWith("TableRelation · ")) continue;
          const target = objectsByKey.get(relation.targetKey);
          if (!target) continue;
          if (target.kind === "table") found.set(target.key, target);
          else if (["tableextension", "page", "pageextension"].includes(target.kind)) pending.push(target.key);
        }
      }
      return [...found.values()];
    }
    function renderIntegrationEvents() {
      renderHeading("Event contract catalog", "Integration Events", "Investigate integration-event publishers and their exposed event procedures across the current extension and dependency symbols.");
      const events = analysis.objects.flatMap((object) => object.integrationEvents.map((name) => ({
        eventKey: object.key + "::" + name,
        object,
        name,
        detail: object.integrationEventDetails?.find((event) => event.name === name),
        tables: associatedTableObjects(object),
      })))
        .sort((a, b) => a.object.packageName.localeCompare(b.object.packageName) || a.object.name.localeCompare(b.object.name) || a.name.localeCompare(b.name));
      const controls = node("div", "event-filters");
      const search = node("input", "search");
      search.type = "search";
      search.placeholder = "Search event, object, table names or IDs…";
      search.setAttribute("aria-label", search.placeholder);
      const typeSelect = node("select", "select");
      typeSelect.setAttribute("aria-label", "Filter by integration event source object type");
      const allTypes = node("option", "", "All source object types");
      allTypes.value = "";
      typeSelect.append(allTypes);
      const eventTypes = [...new Set(events.map(({ object }) => object.kind))]
        .sort((left, right) => (typeLabels[left] ?? left).localeCompare(typeLabels[right] ?? right));
      for (const kind of eventTypes) {
        const option = node("option", "", typeLabels[kind] ?? titleFor(kind));
        option.value = kind;
        typeSelect.append(option);
      }
      const objectSelect = node("select", "select");
      objectSelect.setAttribute("aria-label", "Filter by containing object");
      const populateObjectOptions = (preserveSelection) => {
        const previousSelection = preserveSelection ? objectSelect.value : "";
        const availableObjects = [...new Map(
          events
            .filter(({ object }) => !typeSelect.value || object.kind === typeSelect.value)
            .map(({ object }) => [object.key, object]),
        ).values()].sort((a, b) => a.name.localeCompare(b.name));
        objectSelect.replaceChildren();
        const allObjects = node("option", "", "All containing objects");
        allObjects.value = "";
        objectSelect.append(allObjects);
        for (const object of availableObjects) {
          const option = node("option", "", object.name + " (ID " + object.id + ")");
          option.value = object.key;
          objectSelect.append(option);
        }
        objectSelect.value = availableObjects.some((object) => object.key === previousSelection)
          ? previousSelection
          : "";
      };
      populateObjectOptions(false);
      const tableSelect = node("select", "select");
      tableSelect.setAttribute("aria-label", "Filter by associated table");
      const allTables = node("option", "", "All associated tables");
      allTables.value = "";
      tableSelect.append(allTables);
      const eventTables = [...new Map(events.flatMap(({ tables }) => tables.map((table) => [table.key, table]))).values()]
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const table of eventTables) {
        const option = node("option", "", table.name + " (ID " + table.id + ")");
        option.value = table.key;
        tableSelect.append(option);
      }
      const host = node("div");
      const redraw = () => drawEvents(host, events, search.value.trim().toLowerCase(), typeSelect.value, objectSelect.value, tableSelect.value);
      search.addEventListener("input", redraw);
      typeSelect.addEventListener("change", () => {
        populateObjectOptions(true);
        redraw();
      });
      objectSelect.addEventListener("change", redraw);
      tableSelect.addEventListener("change", redraw);
      const addEventFilter = (label, control) => {
        const field = node("label", "event-filter");
        field.append(node("span", "event-filter-label", label), control);
        controls.append(field);
      };
      addEventFilter("Search events", search);
      addEventFilter("Source object type", typeSelect);
      addEventFilter("Source object", objectSelect);
      addEventFilter("Associated table", tableSelect);
      main.append(controls, host);
      drawEvents(host, events, "", "", "", "");
    }
    function drawEvents(host, events, query, objectType, objectKey, tableKey) {
      host.replaceChildren();
      const matches = events.filter(({ object, name, detail, tables }) =>
        (!objectType || object.kind === objectType) &&
        (!objectKey || object.key === objectKey) &&
        (!tableKey || tables.some((table) => table.key === tableKey)) &&
        [
          name, object.name, object.id, object.kind, object.packageName,
          ...(detail?.parameters.flatMap((parameter) => [parameter.name, parameter.type]) ?? []),
          ...(detail?.attributeArguments ?? []),
          ...tables.flatMap((table) => [table.name, table.id]),
        ].join(" ").toLowerCase().includes(query),
      );
      if (!matches.length) {
        appendEmpty(host, analysis.objects.length ? "No integration events match this search." : "No AL sources or event symbols were found.");
        return;
      }
      host.append(node("p", "muted", matches.length + " integration event" + (matches.length === 1 ? "" : "s")));
      for (const { eventKey, object, name, detail, tables } of matches) {
        const eventLine = detail?.line ?? object.integrationEventLines[name] ?? object.line;
        const card = node("section", "panel");
        card.dataset.eventKey = eventKey;
        const head = node("div", "definition-head");
        const details = node("div");
        details.append(node("div", "definition-title", name + " · " + object.name));
        details.append(node("div", "definition-meta", (typeLabels[object.kind] ?? titleFor(object.kind)) + " " + object.id + " · " + object.packageName + " · " + object.sourcePath + ":" + eventLine));
        head.append(details);
        head.append(createSourceButton("View Definition", object, eventLine));
        card.append(head);
        const contract = node("section", "event-contract");
        contract.append(node("h3", "", "Event contract"));
        if (detail?.comment) {
          const documentation = node("div", "event-documentation", detail.comment);
          contract.append(documentation);
        }
        if (detail?.definition) {
          const definition = node("code", "event-definition", detail.definition);
          contract.append(definition);
        }
        const parameterTable = node("table", "field-table event-parameter-table");
        const parameterHead = node("thead");
        const parameterHeader = node("tr");
        for (const label of ["Parameter", "Type", "Passing"]) parameterHeader.append(node("th", "", label));
        parameterHead.append(parameterHeader);
        const parameterBody = node("tbody");
        if (detail?.parameters.length) {
          for (const parameter of detail.parameters) {
            const row = node("tr");
            row.append(
              node("td", "", parameter.name),
              node("td", "", parameter.type),
              node("td", "", parameter.byReference ? "var (by reference)" : "value"),
            );
            parameterBody.append(row);
          }
        } else {
          const row = node("tr");
          row.append(node("td", "muted", "No parameter signature available in analyzed symbols."));
          parameterBody.append(row);
        }
        parameterTable.append(parameterHead, parameterBody);
        contract.append(parameterTable);
        const capabilities = node("div", "property-list");
        capabilities.append(node("span", "definition-meta", "Publisher capabilities"));
        if (detail?.attributeArguments.length) {
          const capabilityNames = ["IncludeSender", "GlobalVarAccess"];
          detail.attributeArguments.forEach((value, index) => {
            const capability = capabilityNames[index] ?? ("Attribute argument " + (index + 1));
            const meaning = index === 0
              ? value.toLowerCase() === "true" ? "sender is included" : value.toLowerCase() === "false" ? "sender is not included" : "value"
              : index === 1
                ? value.toLowerCase() === "true" ? "global variables are accessible" : value.toLowerCase() === "false" ? "global variables are not accessible" : "value"
                : "declared value";
            capabilities.append(node("span", "badge", capability + ": " + value + " (" + meaning + ")"));
          });
        } else {
          capabilities.append(node("span", "badge", "Attribute flags unavailable in analyzed symbols"));
        }
        contract.append(capabilities);
        if (!detail && object.sourceType === "package") {
          contract.append(node("p", "muted", "The dependency package exposes the event name, but its symbol metadata does not include the publisher signature or attribute flags."));
        }
        card.append(contract);
        if (tables.length) {
          const tableList = node("div", "property-list");
          tableList.append(node("span", "definition-meta", "Associated tables"));
          for (const table of tables) {
            tableList.append(makeButton(table.name + " (ID " + table.id + ")", "link-button", () => openObjectDetails(table)));
          }
          card.append(tableList);
        }
        const references = analysis.usages.filter((usage) => usage.symbolKey === object.key && usage.member === name);
        const triggerSites = references.filter((usage) => !/\\bEventSubscriber\\s*\\(/i.test(usage.excerpt));
        const subscribers = references.filter((usage) => /\\bEventSubscriber\\s*\\(/i.test(usage.excerpt));
        const triggerSection = node("section", "event-contract");
        triggerSection.append(node("h3", "", "Triggered from"));
        if (triggerSites.length) {
          triggerSection.append(node("p", "muted", "Indexed source references that may invoke this event. Confirm each call in source; token matches are not compiler-verified."));
          for (const usage of triggerSites) {
            const caller = objectsByKey.get(usage.objectKey);
            const reference = node("div", "event-reference");
            const referenceInfo = node("div");
            referenceInfo.append(
              node("strong", "", caller?.name ?? usage.objectKey),
              node("div", "definition-meta", (caller?.sourcePath ?? "") + ":" + usage.line + " · " + (caller?.packageName ?? "Unknown package")),
              node("code", "event-excerpt", usage.excerpt || "No source excerpt available."),
            );
            reference.append(referenceInfo);
            if (caller) reference.append(createSourceButton("View Call Site", caller, usage.line));
            triggerSection.append(reference);
          }
        } else {
          triggerSection.append(node("p", "muted", "No indexed trigger call sites were found in available source."));
        }
        card.append(triggerSection);
        if (subscribers.length) {
          const subscriberSection = node("section", "event-contract");
          subscriberSection.append(node("h3", "", "Subscribers"));
          for (const usage of subscribers) {
            const subscriber = objectsByKey.get(usage.objectKey);
            const reference = node("div", "event-reference");
            reference.append(node("div", "", (subscriber?.name ?? usage.objectKey) + " · " + (subscriber?.sourcePath ?? "") + ":" + usage.line));
            reference.append(node("code", "event-excerpt", usage.excerpt));
            if (subscriber) reference.append(createSourceButton("View Subscriber", subscriber, usage.line));
            subscriberSection.append(reference);
          }
          card.append(subscriberSection);
        }
        host.append(card);
      }
    }
    function render() {
      main.replaceChildren();
      renderNavigation();
      if (activeView === "relationships") renderRelationships();
      else if (activeView === "galaxy") renderGalaxyView();
      else if (activeView === "tables") renderTables();
      else if (activeView === "whereUsed") renderWhereUsed();
      else if (activeView === "pages") renderPages();
      else if (activeView === "reports") renderReports();
      else if (activeView === "integrationEvents") renderIntegrationEvents();
      else if (activeView === "documentation") renderDocumentation();
      else if (activeView === "objectDetails") renderObjectDetails();
      else renderOverview();
    }
    function renderDocumentation() {
      renderHeading("Learning and project handoff", "Documentation", "Generate a portable reference from the current analysis, including object definitions, relationships, field usage, event references, dependencies, and coverage notes.");
      const toolbar = node("div", "toolbar");
      const scopeKind = node("select", "select");
      scopeKind.setAttribute("aria-label", "Documentation scope type");
      for (const [value, label] of [["project", "Project"], ["package", "AL Package"]]) {
        const option = node("option", "", label);
        option.value = value;
        scopeKind.append(option);
      }
      const scopeName = node("select", "select");
      scopeName.setAttribute("aria-label", "Select project or AL package");
      const exportButton = makeButton("Export Markdown", "primary-button", () => {
        if (scopeName.value) {
          vscode.postMessage({
            type: "exportDocumentation",
            scopeKind: scopeKind.value,
            scopeName: scopeName.value,
          });
        }
      });
      const preview = node("pre", "documentation-preview", documentationMarkdown);
      preview.setAttribute("aria-label", "Generated extension reference preview");
      const optionsForScope = () => scopeKind.value === "project" ? projectNames : packageNames;
      const populateScopes = () => {
        const previousValue = scopeName.value;
        scopeName.replaceChildren();
        for (const name of optionsForScope()) {
          const option = node("option", "", name);
          option.value = name;
          scopeName.append(option);
        }
        if (optionsForScope().includes(previousValue)) {
          scopeName.value = previousValue;
        } else if (
          initialDocumentationScope &&
          initialDocumentationScope.kind === scopeKind.value &&
          optionsForScope().includes(initialDocumentationScope.name)
        ) {
          scopeName.value = initialDocumentationScope.name;
        }
        exportButton.disabled = !scopeName.value;
        preview.textContent = scopeName.value ? "Generating documentation preview…" : "No analyzed projects or AL packages are available.";
        requestPreview();
      };
      const requestPreview = () => {
        if (scopeName.value) {
          vscode.postMessage({
            type: "generateDocumentation",
            scopeKind: scopeKind.value,
            scopeName: scopeName.value,
          });
        }
      };
      scopeKind.value = initialDocumentationScope?.kind ?? "project";
      populateScopes();
      scopeKind.addEventListener("change", populateScopes);
      scopeName.addEventListener("change", requestPreview);
      toolbar.append(scopeKind, scopeName, exportButton);
      main.append(toolbar);
      main.append(node("p", "documentation-note", "Event subscriber references and where-used results are inferred from available symbols and source; review the limitations in the exported report before treating them as definitive."));
      main.append(preview);
    }
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message && message.type === "progress") {
        setProgress(message.progress);
        return;
      }
      if (message && message.type === "documentationGenerated") {
        const scopeKind = document.querySelector('[aria-label="Documentation scope type"]');
        const scopeName = document.querySelector('[aria-label="Select project or AL package"]');
        if (
          scopeKind &&
          scopeName &&
          message.scopeKind === scopeKind.value &&
          message.scopeName === scopeName.value
        ) {
          const preview = document.querySelector(".documentation-preview");
          if (preview) preview.textContent = message.markdown;
        }
        return;
      }
      if (message && message.type === "setView" && viewItems.some(([key]) => key === message.view)) {
        viewHistory.length = 0;
        activeView = message.view;
        render();
      }
    });
    render();
    setProgress(initialProgress);
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function createNonce(): string {
  return randomBytes(18).toString("base64");
}
