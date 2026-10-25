import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentationMarkdown } from "../documentation";
import { Analysis } from "../model";

test("generates a portable project reference with relationships, lineage, events, and coverage metadata", () => {
  const analysis: Analysis = {
    objects: [
      {
        key: "current:table:1",
        id: "1",
        name: "Acme Customer",
        kind: "table",
        packageName: "Current Extension",
        sourcePath: "C:\\private\\workspace\\Customer.al",
        sourceType: "workspace",
        line: 4,
        fields: [
          {
            id: "1",
            name: "No.",
            type: "Code[20]",
            line: 6,
            tableRelation: "Customer",
          },
        ],
        controls: [],
        dataItems: [],
        procedures: [],
        integrationEvents: [],
        integrationEventLines: {},
        properties: {},
        sourceText: "",
      },
      {
        key: "dependency:codeunit:2",
        id: "2",
        name: "Acme Publisher",
        kind: "codeunit",
        packageName: "Base App",
        sourcePath: "C:\\private\\workspace\\.alpackages\\Base App.app",
        sourceType: "package",
        line: 1,
        fields: [],
        controls: [],
        dataItems: [],
        procedures: [],
        integrationEvents: ["OnCustomerChanged"],
        integrationEventLines: { OnCustomerChanged: 12 },
        properties: {},
        sourceText: "",
      },
      {
        key: "current:codeunit:3",
        id: "3",
        name: "Acme Subscriber",
        kind: "codeunit",
        packageName: "Current Extension",
        sourcePath: "C:\\private\\workspace\\Subscriber.al",
        sourceType: "workspace",
        line: 1,
        fields: [],
        controls: [],
        dataItems: [],
        procedures: [],
        integrationEvents: [],
        integrationEventLines: {},
        properties: {},
        sourceText: "",
      },
    ],
    relationships: [
      { sourceKey: "current:table:1", targetKey: "current:table:1", type: "TableRelation · No." },
    ],
    usages: [
      {
        symbolKey: "current:table:1",
        objectKey: "current:codeunit:3",
        member: "No.",
        line: 8,
        excerpt: 'Customer."No."',
      },
      {
        symbolKey: "dependency:codeunit:2",
        objectKey: "current:codeunit:3",
        member: "OnCustomerChanged",
        line: 5,
        excerpt: "[EventSubscriber(ObjectType::Codeunit, Codeunit::Publisher, 'OnCustomerChanged', '')]",
      },
    ],
    packages: [
      {
        name: "Base App",
        path: "C:\\private\\workspace\\.alpackages\\Base App.app",
        id: "base-id",
        publisher: "Microsoft",
        version: "1.0.0.0",
        objectCount: 1,
        dependencies: [],
      },
    ],
    packageDependencies: [],
    diagnostics: [{ severity: "warning", message: "One symbol source was unavailable." }],
    analyzedAt: "2026-03-01T10:00:00.000Z",
  };

  const markdown = createDocumentationMarkdown(analysis, "2026-03-01T10:05:00.000Z");

  assert.match(markdown, /# Business Central Extension Reference/);
  assert.match(markdown, /Generated: 2026-03-01T10:05:00\.000Z/);
  assert.match(markdown, /\| Base App \| Microsoft \| 1\.0\.0\.0 \| base-id \| 1 \|/);
  assert.match(markdown, /Acme Customer.*TableRelation · No\..*Acme Customer/);
  assert.match(markdown, /Acme Customer\.No\./);
  assert.match(markdown, /Indexed where-used references: 1/);
  assert.match(markdown, /Acme Publisher\.OnCustomerChanged/);
  assert.match(markdown, /Acme Subscriber/);
  assert.match(markdown, /inferred, not compiler-validated/);
  assert.match(markdown, /Analysis timestamp: 2026-03-01T10:00:00\.000Z/);
  assert.match(markdown, /One symbol source was unavailable/);
  assert.match(markdown, /full local paths are omitted/);
  assert.doesNotMatch(markdown, /C:\\private\\workspace/);

  const projectMarkdown = createDocumentationMarkdown(
    analysis,
    "2026-03-01T10:05:00.000Z",
    { kind: "project", name: "Current Extension" },
  );
  assert.match(projectMarkdown, /Filter: Project/);
  assert.match(projectMarkdown, /Selected: Current Extension/);
  assert.match(projectMarkdown, /Acme Customer/);
  assert.match(projectMarkdown, /Acme Subscriber/);
  assert.doesNotMatch(projectMarkdown, /Acme Publisher/);
  assert.doesNotMatch(projectMarkdown, /Base App/);
  assert.match(projectMarkdown, /Dependency symbol objects: 0/);

  const packageMarkdown = createDocumentationMarkdown(
    analysis,
    "2026-03-01T10:05:00.000Z",
    { kind: "package", name: "Base App" },
  );
  assert.match(packageMarkdown, /Filter: AL Package/);
  assert.match(packageMarkdown, /Selected: Base App/);
  assert.match(packageMarkdown, /Acme Publisher/);
  assert.doesNotMatch(packageMarkdown, /Acme Customer/);
  assert.doesNotMatch(packageMarkdown, /Acme Subscriber/);
  assert.match(packageMarkdown, /Workspace objects: 0/);
});
