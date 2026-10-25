import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";
import { Analysis } from "../model";
import { createExplorerHtml } from "../webview";

test("renders branded, CSP-protected HTML with a safely embedded analysis payload", () => {
  const analysis: Analysis = {
    objects: [
      {
        key: "app:table:1",
        id: "1",
        name: "</script><script>alert(1)</script>",
        kind: "table",
        packageName: "Current",
        sourcePath: "C:\\workspace\\Customer.al",
        sourceType: "workspace",
        line: 1,
        fields: [],
        controls: [],
        dataItems: [],
        procedures: [],
        integrationEvents: [],
        integrationEventLines: {},
        properties: {},
        sourceText: "private AL source",
      },
    ],
    relationships: [],
    usages: [],
    packages: [],
    packageDependencies: [],
    diagnostics: [],
    analyzedAt: "2026-01-01T00:00:00.000Z",
  };
  const html = createExplorerHtml(
    "vscode-webview://resource",
    "vscode-webview://resource/aardvark-labs-logo.jpg",
    analysis,
    "overview",
    { message: "Indexing where-used references", phase: "usages", completed: 42, total: 100 },
    "0.2.10",
  );
  const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)];

  assert.equal(scripts.length, 1);
  assert.match(html, /Aardvark Labs/);
  assert.match(html, /aardvark-labs-logo\.jpg/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /id="loading"/);
  assert.match(html, /id="loading-log" class="loading-log" role="log" aria-label="Analysis system log"/);
  assert.match(html, /\.loading-log \{ max-height: 180px; overflow: auto;/);
  assert.match(html, /const maxLoadingLogEntries = 300/);
  assert.match(html, /new Date\(\)\.toISOString\(\)/);
  assert.match(html, /loadingLogEntries\.push\(/);
  assert.match(html, /loadingLogEntries\.shift\(\)/);
  assert.match(html, /progress\.phase \?\? "general"/);
  assert.match(html, /Indexing where-used references/);
  assert.match(html, /"completed":42/);
  assert.match(html, /type === "progress"/);
  assert.match(html, /\["finalizing", "Finalize analysis"\]/);
  assert.match(html, /const extensionVersion = "0\.2\.10"/);
  assert.match(html, /"Version " \+ extensionVersion/);
  assert.match(html, /item\.name \+ " " \+ item\.id/);
  assert.match(html, /const definitionCaption = kind === "page" \|\| kind === "table"/);
  assert.match(html, /const objectName = object\.name\.trim\(\) \|\| "Table " \+ object\.id/);
  assert.match(html, /const displayTitle = kind === "table"/);
  assert.match(html, /summaryIdentity\.append\(node\("span", "definition-title", displayTitle\)\)/);
  assert.match(html, /"Caption: " \+ definitionCaption/);
  assert.match(html, /"AL object: " \+ object\.name/);
  assert.match(html, /"Data sources"/);
  assert.match(html, /"Source table"/);
  assert.match(html, /"Filters"/);
  assert.match(html, /"Data item links"/);
  assert.match(html, /"Sort \/ view"/);
  assert.match(html, /"Other"/);
  assert.match(html, /"Filter heading: " \+ item\.properties\.RequestFilterHeading/);
  assert.match(html, /"Print only if detail: " \+ item\.properties\.PrintOnlyIfDetail/);
  assert.match(html, /"Request page fields"/);
  assert.match(html, /"Report properties"/);
  assert.match(html, /if \(kind === "table" \|\| kind === "page"\)/);
  assert.match(html, /usage\.symbolKey === symbolKey/);
  assert.match(html, /Show all references/);
  assert.match(html, /\.edge\.conditional \{ stroke-dasharray: 5 4; \}/);
  assert.match(html, /relation\.conditional \? " conditional" : ""/);
  assert.match(html, /node\("details", "panel object-card"\)/);
  assert.match(html, /"ID " \+ object\.id/);
  assert.match(html, /openWhereUsed\(object, field\.name\)/);
  assert.match(html, /Table-to-table relationships/);
  assert.match(html, /const startTables = analysis\.objects/);
  assert.match(html, /tableSelect\.value = startTables\[0\]\?\.key \?\? ""/);
  const tableRelationshipRenderer = html.slice(
    html.indexOf("function drawUniqueTableRelationships"),
    html.indexOf("function drawObjectGraph"),
  );
  assert.doesNotMatch(tableRelationshipRenderer, /\bclustered\b/);
  assert.match(tableRelationshipRenderer, /if \(!center\)/);
  assert.doesNotMatch(tableRelationshipRenderer, /if \(!filtered\.length\)/);
  assert.match(html, /if \(clustered\) container\.append\(svg, magnifier\)/);
  assert.match(html, /aria-label", "Starting table"/);
  assert.match(html, /aria-label", "Filter related table"/);
  assert.match(html, /relatedFilter\.addEventListener\("input", redraw\)/);
  assert.match(html, /drawUniqueTableRelationships\(tableDiagram, tableRelations, tableSelect\.value, relatedFilter\.value\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(html, /target\.name \+ " " \+ target\.id/);
  assert.match(html, /relation\.type\.startsWith\("TableRelation · "\)/);
  assert.match(html, /objects\.find\(\(object\) => object\.key === centerKey\) \?\? objects\[0\]/);
  assert.match(html, /item\.addEventListener\("dblclick", \(event\) =>/);
  assert.match(html, /openObjectDetails\(object\)/);
  assert.match(html, /function renderObjectDetails\(\)/);
  assert.doesNotMatch(html, /Object relationship graph/);
  assert.match(html, /const sides = \{ left: new Map\(\), right: new Map\(\) \}/);
  assert.match(html, /const centerX = 475/);
  assert.match(html, /table-relationship-svg/);
  assert.match(html, /preserveAspectRatio", "xMidYMid meet"/);
  assert.match(html, /addTableGraphNode\(world, object, x, y - nodeHeight \/ 2, nodeWidth, nodeHeight, false, fieldNames\)/);
  assert.match(html, /relation-field-label/);
  assert.match(html, /fieldLabel\.setAttribute\("y", String\(y \+ 63\)\)/);
  assert.doesNotMatch(html, /const fieldLabel = document\.createElementNS\(svg\.namespaceURI, "text"\)/);
  assert.match(html, /addRelatedColumn\(left, "left"\)/);
  assert.match(html, /addRelatedColumn\(right, "right"\)/);
  assert.match(html, /function addTableGraphNode/);
  assert.match(html, /Open details for center table/);
  assert.match(html, /function renderWhereUsedSummary/);
  assert.match(html, /function sameFieldName\(left, right\)/);
  assert.match(html, /sameFieldName\(field\.name, member\)/);
  assert.match(html, /sameFieldName\(usage\.member, member\)/);
  assert.match(html, /Selected field/);
  assert.match(html, /TableRelation/);
  assert.match(html, /Referencing object/);
  assert.match(html, /Reference details/);
  assert.match(html, /details\.append\(node\("summary", "", symbol\.name/);
  assert.match(html, /function addViewSourceAction\(parent, object, line\)/);
  assert.match(html, /function createSourceButton\(label, object, line\)/);
  assert.match(html, /View Call Site/);
  assert.match(html, /View Definition/);
  assert.match(html, /usage-actions/);
  assert.match(html, /usage-table th:last-child, \.usage-table td:last-child/);
  assert.match(html, /"Navigation"/);
  assert.match(html, /kind === "table" \? "definition-head table-definition-head" : "definition-head"/);
  assert.match(html, /sourceColumn\.append\(node\("span", "definition-action-label", "Source"\)\)/);
  assert.match(html, /table-definition-head \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 112px 112px/);
  assert.match(html, /createSourceButton\("View Call Site", object, usage\.line\)/);
  assert.match(html, /createSourceButton\("View Definition", symbol,/);
  const drawUsages = html.slice(html.indexOf("function drawUsages"), html.indexOf("function associatedTableObjects"));
  assert.doesNotMatch(drawUsages, /associatedTableObjects/);
  assert.doesNotMatch(drawUsages, /Table: /);
  assert.match(html, /function openObjectSource\(object, line\)/);
  assert.match(html, /type: "openSourceDocument"/);
  assert.match(html, /objectKey: object\.key/);
  assert.match(html, /function preserveCurrentView\(\)/);
  assert.match(html, /content\.append\(\.\.\.main\.childNodes\)/);
  assert.match(html, /function restorePreviousView\(fallbackView\)/);
  assert.match(html, /main\.replaceChildren\(previous\.content\)/);
  assert.match(html, /requestAnimationFrame\(\(\) => window\.scrollTo\(0, previous\.scrollY\)\)/);
  assert.match(html, /Back to " \+ titleFor\(whereUsedReturnView\)/);
  assert.match(html, /restorePreviousView\(detailsReturnView\)/);
  assert.match(html, /fieldLabel\.textContent = relationFields\.join\(", "\)/);
  assert.match(html, /fieldLabel\.setAttribute\("aria-label", "Related field: "/);
  assert.match(html, /associatedTableObjects\(object\)/);
  assert.match(html, /Filter by associated table/);
  assert.match(html, /Filter by containing object/);
  assert.match(html, /Filter by integration event source object type/);
  assert.match(html, /const typeLabels = \{/);
  assert.match(html, /typeLabels\[object\.kind\]/);
  assert.match(html, /All source object types/);
  assert.match(html, /"Code Unit"/);
  assert.match(html, /\.event-filters \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /\.event-filter \.search, \.event-filter \.select \{ width: 100%; min-width: 0; max-width: none; \}/);
  assert.match(html, /function renderIntegrationEvents\(\)/);
  const integrationEventRenderer = html.slice(
    html.indexOf("function renderIntegrationEvents"),
    html.indexOf("function drawEvents"),
  );
  assert.match(integrationEventRenderer, /const populateObjectOptions = \(preserveSelection\) =>/);
  assert.match(integrationEventRenderer, /object\.kind === typeSelect\.value/);
  assert.match(integrationEventRenderer, /typeSelect\.addEventListener\("change", \(\) => \{/);
  assert.match(integrationEventRenderer, /populateObjectOptions\(true\);\s*redraw\(\);/);
  assert.match(integrationEventRenderer, /objectSelect\.replaceChildren\(\)/);
  assert.match(integrationEventRenderer, /addEventFilter\("Search events", search\)/);
  assert.match(integrationEventRenderer, /addEventFilter\("Source object type", typeSelect\)/);
  assert.match(html, /object\.kind === objectType/);
  assert.match(html, /detail\.comment/);
  assert.match(html, /detail\.definition/);
  assert.match(html, /event-documentation/);
  assert.match(html, /event-definition/);
  assert.match(html, /object\.name \+ " \(ID "/);
  assert.match(html, /"Event contract"/);
  assert.match(html, /"Parameter"/);
  assert.match(html, /"Publisher capabilities"/);
  assert.match(html, /"Triggered from"/);
  assert.match(html, /"Subscribers"/);
  assert.match(html, /eventKey: object\.key \+ "::" \+ name/);
  assert.match(html, /card\.dataset\.eventKey = eventKey/);
  assert.match(html, /"Indexed source references that may invoke this event/);
  assert.match(html, /EventSubscriber/);
  assert.match(html, /function openObjectSource\(object, line\)/);
  assert.match(html, /object\.controlGroups\?\.length/);
  assert.match(html, /relation\.type === "extends"/);
  assert.match(html, /analysisTasks = \[/);
  assert.match(html, /loading-task-fill/);
  assert.match(html, /progress\.phase/);
  assert.match(html, /Galaxy View/);
  assert.match(html, /\["galaxy", "Galaxy View", "✦"\]/);
  assert.match(html, /\["documentation", "Documentation", "▧"\]/);
  assert.match(html, /function renderDocumentation\(\)/);
  assert.match(html, /type: "exportDocumentation"/);
  assert.match(html, /scopeKind: scopeKind\.value/);
  assert.match(html, /scopeName: scopeName\.value/);
  assert.match(html, /Documentation scope type/);
  assert.match(html, /Select project or AL package/);
  assert.match(html, /type: "generateDocumentation"/);
  assert.match(html, /type === "documentationGenerated"/);
  assert.match(html, /const documentationMarkdown = ""/);
  assert.doesNotMatch(html, /# Business Central Extension Reference/);
  assert.match(html, /documentation-preview/);
  assert.match(html, /else if \(activeView === "galaxy"\) renderGalaxyView\(\)/);
  assert.match(html, /else if \(activeView === "documentation"\) renderDocumentation\(\)/);
  assert.match(html, /const typeNames = \[/);
  assert.match(html, /const selectedTypes = new Set\(\["table", "tableextension"\]\)/);
  assert.match(html, /\["table", "Tables"\]/);
  assert.match(html, /\["page", "Pages"\]/);
  assert.match(html, /\["report", "Reports"\]/);
  assert.match(html, /selectedTypes\.has\(object\.kind\)/);
  assert.match(html, /checkbox\.checked = selectedTypes\.has\(kind\)/);
  assert.match(html, /galaxy-svg/);
  assert.match(html, /const marker = document\.createElementNS\(svg\.namespaceURI, clustered \? "circle" : "rect"\)/);
  assert.match(html, /marker\.setAttribute\("r", "9"\)/);
  assert.match(html, /\.galaxy-point:hover \.galaxy-dot/);
  assert.match(html, /galaxy-magnifier/);
  assert.match(html, /galaxy-magnifier-name/);
  assert.doesNotMatch(html, /\["whereUsed", "Where Used", "⌕"\]/);
  assert.match(html, /positionGalaxyMagnifier\(magnifier, container, event\)/);
  assert.match(html, /selectGalaxyObject\(world, object\.key\)/);
  assert.match(html, /edge\.dataset\.sourceKey = relation\.sourceKey/);
  assert.match(html, /edge\.dataset\.targetKey = relation\.targetKey/);
  assert.match(html, /edge\.classList\.toggle\("is-related", connectedEdges\.includes\(edge\)\)/);
  assert.match(html, /point\.classList\.toggle\("is-related-endpoint", endpoint\)/);
  assert.match(html, /point\.classList\.contains\("is-selected"\)/);
  assert.match(html, /object\.name \+ " " \+ object\.packageName \+ " " \+ object\.id/);
  assert.match(html, /galaxy-cluster/);
  assert.match(html, /galaxy-object-label/);
  assert.match(html, /label\.classList\.toggle\("visible", visible\)/);
  assert.match(html, /container\.addEventListener\("pointerdown"/);
  assert.match(html, /container\.addEventListener\("pointermove"/);
  assert.match(html, /container\.addEventListener\("wheel"/);
  assert.match(html, /enableGraphNavigation\(container, svg, world, false, false\)/);
  assert.match(html, /\\u003c\/script>/);
  assert.doesNotMatch(html, /private AL source/);
  assert.doesNotMatch(html, /relatedSelect/);
  assert.doesNotMatch(html, /Open report source/);
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
  assert.doesNotThrow(() => new Script(scripts[0][1]));
});

test("keeps dependency AL source out of the webview payload and requests it on demand", () => {
  const analysis: Analysis = {
    objects: [
      {
        key: "dependency:table:2",
        id: "2",
        name: "Customer",
        kind: "table",
        packageName: "Base Application",
        sourcePath: "Base Application/Customer.al",
        sourceType: "package",
        line: 1,
        fields: [],
        controls: [],
        dataItems: [],
        procedures: [],
        integrationEvents: [],
        integrationEventLines: {},
        properties: {},
        sourceText: "table 2 Customer { }",
      },
    ],
    relationships: [],
    usages: [],
    packages: [],
    packageDependencies: [],
    diagnostics: [],
    analyzedAt: "2026-01-01T00:00:00.000Z",
  };

  const html = createExplorerHtml("vscode-webview://resource", "logo.jpg", analysis, "tables");
  assert.doesNotMatch(html, /table 2 Customer \{ \}/);
  assert.match(html, /"sourceText":""/);
  assert.match(html, /"hasSourceText":true/);
  assert.match(html, /type: "openSourceDocument"/);
  assert.match(html, /objectKey: object\.key/);
  assert.match(html, /object\.hasSourceText/);
});
