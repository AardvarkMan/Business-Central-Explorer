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
    "vscode-webview://resource/aardvarklabs-logo.jpg",
    analysis,
    "overview",
    { message: "Indexing where-used references", phase: "usages", completed: 42, total: 100 },
  );
  const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)];

  assert.equal(scripts.length, 1);
  assert.match(html, /Aardvark Labs/);
  assert.match(html, /aardvarklabs-logo\.jpg/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /id="loading"/);
  assert.match(html, /Indexing where-used references/);
  assert.match(html, /"completed":42/);
  assert.match(html, /type === "progress"/);
  assert.match(html, /item\.name \+ " " \+ item\.id/);
  assert.match(html, /if \(kind === "table" \|\| kind === "page"\)/);
  assert.match(html, /usage\.symbolKey === symbolKey/);
  assert.match(html, /Show all references/);
  assert.match(html, /\.edge\.conditional \{ stroke-dasharray: 5 4; \}/);
  assert.match(html, /relation\.conditional \? " conditional" : ""/);
  assert.match(html, /node\("details", "panel object-card"\)/);
  assert.match(html, /"ID " \+ object\.id/);
  assert.match(html, /openWhereUsed\(object, field\.name\)/);
  assert.match(html, /Table-to-table relationships/);
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
  assert.match(html, /Selected field/);
  assert.match(html, /TableRelation/);
  assert.match(html, /Referencing object/);
  assert.match(html, /Reference details/);
  assert.match(html, /details\.append\(node\("summary", "", symbol\.name/);
  assert.match(html, /function addViewSourceAction\(parent, object, line\)/);
  assert.match(html, /kind === "table" \? "definition-head table-definition-head" : "definition-head"/);
  assert.match(html, /sourceColumn\.append\(node\("span", "definition-action-label", "Source"\)\)/);
  assert.match(html, /table-definition-head \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 112px 112px/);
  assert.match(html, /makeButton\("View Source", "open-button"/);
  assert.match(html, /function openObjectSource\(object, line\)/);
  assert.match(html, /type: "openSourceDocument"/);
  assert.match(html, /fileName: extension \? fileName : object\.name \+ "\.al"/);
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
  assert.match(html, /object\.name \+ " \(ID "/);
  assert.match(html, /object\.controlGroups\?\.length/);
  assert.match(html, /relation\.type === "extends"/);
  assert.match(html, /analysisTasks = \[/);
  assert.match(html, /loading-task-fill/);
  assert.match(html, /progress\.phase/);
  assert.match(html, /Galaxy View/);
  assert.match(html, /\["galaxy", "Galaxy View", "✦"\]/);
  assert.match(html, /else if \(activeView === "galaxy"\) renderGalaxyView\(\)/);
  assert.match(html, /const typeNames = \[/);
  assert.match(html, /const selectedTypes = new Set\(\["table", "tableextension"\]\)/);
  assert.match(html, /\["table", "Tables"\]/);
  assert.match(html, /\["page", "Pages"\]/);
  assert.match(html, /\["report", "Reports"\]/);
  assert.match(html, /selectedTypes\.has\(object\.kind\)/);
  assert.match(html, /checkbox\.checked = selectedTypes\.has\(kind\)/);
  assert.match(html, /galaxy-svg/);
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

test("includes dependency AL source for the webview source viewer", () => {
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
  assert.match(html, /table 2 Customer \{ \}/);
  assert.match(html, /"sourceText":"table 2 Customer \{ \}"/);
  assert.match(html, /type: "openSourceDocument"/);
  assert.match(html, /button\.disabled = true/);
});
