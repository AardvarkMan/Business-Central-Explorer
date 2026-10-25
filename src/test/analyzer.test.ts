import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { analyzeFiles, discoverAppPackages, parseAppManifest } from "../analyzer";
import { parseAlFile } from "../alParser";
import { PackageMetadata, SourceInput } from "../model";

const manifest: PackageMetadata = {
  name: "Current Extension",
  id: "11111111-1111-1111-1111-111111111111",
  path: "C:\\workspace\\app.json",
};

const source = [
  "// table 50099 Commented Object { }",
  "/*",
  "table 50098 Block Commented Object { }",
  "*/",
  'table 50100 "Acme Customer" {',
  "    Caption = 'Brace } should not close object';",
  "    fields {",
  '        field(1; "No."; Code[20]) { }',
  "        field(2; Name; Text[100]) { }",
  "    }",
  "}",
  'tableextension 50101 "Acme Customer Ext" extends "Acme Customer" {',
  "    fields {",
  '        field(3; "External Id"; Text[50]) { }',
  "    }",
  "}",
  'page 50102 "Acme Customer Card" {',
  "    Caption = 'Customer Card';",
  '    SourceTable = "Acme Customer";',
  "    layout {",
  '        area(content) { group(General) { field("No."; Rec."No.") { } } group(Communication) { field("Phone"; Rec."Phone No.") { } } }',
  "    }",
  "}",
  'report 50103 "Acme Customer List" {',
  "    dataset {",
  '        dataitem(Customer; "Acme Customer") {',
  '            RequestFilterFields = "No.", Name;',
  '            DataItemTableView = sorting("No.") order(Ascending);',
  "            DataItemTableFilter = Blocked = const(false);",
  '            field(No; Customer."No.") { }',
  "        }",
  "    }",
  '    requestpage { layout { area(content) { group(Options) { field("Show Details"; ShowDetails) { } } } } }',
  "}",
  "codeunit 50104 AcmePublisher {",
  '    var CustomerRec: Record "Acme Customer";',
  "    /// <summary>",
  "    /// Raised when customer data changes.",
  "    /// </summary>",
  "    [IntegrationEvent(false, false)]",
  "    procedure OnCustomerChanged(CustomerNo: Code[20])",
  "    begin",
  "    end;",
  "}",
  "codeunit 50105 AcmeSubscriber {",
  "    [EventSubscriber(ObjectType::Codeunit, Codeunit::AcmePublisher, 'OnCustomerChanged', '', false, false)]",
  "    local procedure HandleCustomerChanged()",
  "    begin",
  "    end;",
  "}",
].join("\n");

function sourceInput(content: string): SourceInput {
  return {
    path: "C:\\workspace\\Objects.al",
    content,
    sourceType: "workspace",
    packageName: manifest.name,
  };
}

test("parses AL object declarations, fields, properties, and integration events", () => {
  const objects = parseAlFile(sourceInput(source), manifest);
  assert.deepEqual(
    objects.map((object) => `${object.kind}:${object.name}`),
    [
      "table:Acme Customer",
      "tableextension:Acme Customer Ext",
      "page:Acme Customer Card",
      "report:Acme Customer List",
      "codeunit:AcmePublisher",
      "codeunit:AcmeSubscriber",
    ],
  );
  assert.deepEqual(
    objects[0].fields.map((field) => [field.id, field.name, field.type]),
    [
      ["1", "No.", "Code[20]"],
      ["2", "Name", "Text[100]"],
    ],
  );
  assert.equal(objects[1].properties.Extends, "Acme Customer");
  assert.equal(objects[2].properties.SourceTable, "Acme Customer");
  assert.equal(objects[2].properties.Caption, "Customer Card");
  assert.deepEqual(objects[2].controls, ["No.", "Phone"]);
  assert.deepEqual(objects[2].controlGroups, [
    { group: "content / General", controls: ["No."] },
    { group: "content / Communication", controls: ["Phone"] },
  ]);
  assert.deepEqual(objects[3].dataItems, ["Customer: Acme Customer"]);
  assert.deepEqual(objects[3].reportDataItems, [
    {
      name: "Customer",
      sourceTable: "Acme Customer",
      line: objects[3].line + 2,
      properties: {
        RequestFilterFields: '"No.", Name',
        DataItemTableView: 'sorting("No.") order(Ascending)',
        DataItemTableFilter: "Blocked = const(false)",
      },
    },
  ]);
  assert.deepEqual(objects[3].reportRequestPageControls, [
    { group: "content / Options", controls: ["Show Details"] },
  ]);
  assert.deepEqual(objects[4].integrationEvents, ["OnCustomerChanged"]);
  assert.equal(objects[4].integrationEventLines.OnCustomerChanged, 41);
  assert.deepEqual(objects[4].integrationEventDetails, [
    {
      name: "OnCustomerChanged",
      line: 41,
      definition: "procedure OnCustomerChanged(CustomerNo: Code[20])",
      comment: "<summary>\nRaised when customer data changes.\n</summary>",
      parameters: [{ name: "CustomerNo", type: "Code[20]", byReference: false }],
      attributeArguments: ["false", "false"],
    },
  ]);
});

test("parses local integration-event publishers on tables", () => {
  const objects = parseAlFile(sourceInput([
    "table 18 Customer {",
    "    /// Raised before changing the customer.",
    "    [IntegrationEvent(false, false)]",
    "    // Event publisher declaration.",
    "    local procedure OnBeforeModifyEvent(var Customer: Record Customer; var xCustomer: Record Customer; RunTrigger: Boolean)",
    "    begin",
    "    end;",
    "}",
  ].join("\n")), manifest);

  assert.deepEqual(objects[0]?.integrationEvents, ["OnBeforeModifyEvent"]);
  assert.deepEqual(objects[0]?.integrationEventDetails?.[0], {
    name: "OnBeforeModifyEvent",
    line: objects[0].line + 4,
    definition: "local procedure OnBeforeModifyEvent(var Customer: Record Customer; var xCustomer: Record Customer; RunTrigger: Boolean)",
    comment: "Raised before changing the customer.",
    parameters: [
      { name: "Customer", type: "Record Customer", byReference: true },
      { name: "xCustomer", type: "Record Customer", byReference: true },
      { name: "RunTrigger", type: "Boolean", byReference: false },
    ],
    attributeArguments: ["false", "false"],
  });
});

test("uses the table definition caption instead of a nested field caption", () => {
  const objects = parseAlFile(sourceInput([
    "table 18 Customer {",
    "    Caption = 'Customer';",
    "    fields {",
    "        field(1; Name; Text[100]) {",
    "            Caption = 'CFDI Customer Name';",
    "        }",
    "    }",
    "}",
  ].join("\n")), manifest);

  assert.equal(objects[0]?.name, "Customer");
  assert.equal(objects[0]?.properties.Caption, "Customer");
});

test("builds table relationships and where-used references", async () => {
  const analysis = await analyzeFiles([sourceInput(source)], [], [manifest]);
  const customer = analysis.objects.find((object) => object.name === "Acme Customer");
  assert.ok(customer);
  const relations = analysis.relationships.map((item) => ({
    source: analysis.objects.find((object) => object.key === item.sourceKey)?.name,
    target: analysis.objects.find((object) => object.key === item.targetKey)?.name,
    type: item.type,
  }));
  assert.ok(relations.some((item) => item.source === "Acme Customer Ext" && item.type === "extends"));
  assert.ok(relations.some((item) => item.source === "Acme Customer Card" && item.type === "source table"));
  assert.ok(relations.some((item) => item.source === "Acme Customer List" && item.type === "data item"));
  assert.ok(relations.some((item) => item.source === "AcmePublisher" && item.type === "uses"));

  const field = customer.fields.find((item) => item.name === "No.");
  assert.ok(field);
  assert.ok(
    analysis.usages.some((usage) => usage.symbolKey === customer.key && usage.member === field.name),
  );
  assert.ok(
    analysis.usages.some(
      (usage) =>
        usage.symbolKey === customer.key &&
        usage.member === field.name &&
        analysis.objects.find((object) => object.key === usage.objectKey)?.kind === "report",
    ),
  );
  const publisher = analysis.objects.find((object) => object.name === "AcmePublisher");
  assert.equal(publisher?.integrationEvents[0], "OnCustomerChanged");
  assert.ok(
    analysis.usages.some(
      (usage) => usage.symbolKey === publisher?.key && usage.member === "OnCustomerChanged",
    ),
  );
});

test("resolves Rec and xRec to the current source table, not named record variables", async () => {
  const analysis = await analyzeFiles([sourceInput([
    "table 50200 Customer {",
    "    fields {",
    '        field(1; "No."; Code[20]) { }',
    "    }",
    "}",
    "table 50201 Vendor {",
    "    fields {",
    '        field(1; "No."; Code[20]) { }',
    "    }",
    "}",
    "page 50202 VendorCard {",
    "    SourceTable = Vendor;",
    "    var",
    "        Customer: Record Customer;",
    "    layout {",
    '        area(content) { field("No."; Rec."No.") { } }',
    "    }",
    "    trigger OnAfterGetRecord()",
    "    begin",
    '        if Rec."No." = xRec."No." then;',
    '        if Customer."No." = Rec."No." then;',
    "    end;",
    "}",
    "report 50203 RecordReferences {",
    "    dataset {",
    "        dataitem(Customer; Customer) { }",
    "        dataitem(Vendor; Vendor) { }",
    "    }",
    "    procedure CheckRecord()",
    "    begin",
    '        if Rec."No." = Customer."No." then;',
    '        if Vendor."No." = Customer."No." then;',
    "    end;",
    "}",
  ].join("\n"))], [], [manifest]);
  const customer = analysis.objects.find((object) => object.name === "Customer");
  const vendor = analysis.objects.find((object) => object.name === "Vendor");
  const vendorCard = analysis.objects.find((object) => object.name === "VendorCard");
  const report = analysis.objects.find((object) => object.name === "RecordReferences");
  assert.ok(customer && vendor && vendorCard && report);

  const sourceLines = vendorCard.sourceText.split(/\r?\n/);
  const recAndXRecLine = vendorCard.line + sourceLines.findIndex((line) => line.includes('if Rec."No." = xRec."No."'));
  const customerVariableLine = vendorCard.line + sourceLines.findIndex((line) => line.includes('if Customer."No." = Rec."No."'));
  const customerCardUsages = analysis.usages.filter(
    (usage) => usage.objectKey === vendorCard.key && usage.symbolKey === customer.key && usage.member === "No.",
  );
  const vendorCardUsages = analysis.usages.filter(
    (usage) => usage.objectKey === vendorCard.key && usage.symbolKey === vendor.key && usage.member === "No.",
  );
  assert.deepEqual(customerCardUsages.map((usage) => usage.line), [customerVariableLine]);
  assert.ok(vendorCardUsages.some((usage) => usage.line === recAndXRecLine));
  assert.ok(vendorCardUsages.some((usage) => usage.line === customerVariableLine));

  const customerUsages = analysis.usages.filter(
    (usage) => usage.symbolKey === customer.key && usage.member === "No.",
  );
  const vendorUsages = analysis.usages.filter(
    (usage) => usage.symbolKey === vendor.key && usage.member === "No.",
  );
  assert.ok(customerUsages.length > 0);
  assert.ok(customerUsages.every((usage) => [report.key, vendorCard.key].includes(usage.objectKey)));
  assert.ok(vendorUsages.some((usage) => usage.objectKey === vendorCard.key));
  assert.ok(vendorUsages.some((usage) => usage.objectKey === report.key));
  assert.equal(customerUsages.some((usage) => usage.objectKey === vendorCard.key && usage.line === recAndXRecLine), false);
});

test("keeps full field names distinct in where-used references", async () => {
  const analysis = await analyzeFiles([sourceInput([
    "table 50210 Customer {",
    "    fields {",
    '        field(1; "No."; Code[20]) { }',
    '        field(2; "Primary Contact No."; Code[20]) { }',
    "    }",
    "}",
    "codeunit 50211 CustomerReferences {",
    "    var",
    "        Customer: Record Customer;",
    "    procedure FindReferences()",
    "    begin",
    '        // Customer."No." is mentioned here but is not a call site.',
    '        Customer."No.";',
    '        Customer."Primary Contact No.";',
    "    end;",
    "}",
  ].join("\n"))], [], [manifest]);
  const customer = analysis.objects.find((object) => object.name === "Customer");
  const caller = analysis.objects.find((object) => object.name === "CustomerReferences");
  assert.ok(customer && caller);

  const fieldUsages = analysis.usages.filter(
    (usage) => usage.objectKey === caller.key && usage.symbolKey === customer.key,
  );
  const noUsages = fieldUsages.filter((usage) => usage.member === "No.");
  const primaryContactUsages = fieldUsages.filter((usage) => usage.member === "Primary Contact No.");
  assert.deepEqual(noUsages.map((usage) => usage.excerpt), ['Customer."No.";']);
  assert.deepEqual(primaryContactUsages.map((usage) => usage.excerpt), ['Customer."Primary Contact No.";']);
  const sourceLines = caller.sourceText.split(/\r?\n/);
  assert.deepEqual(
    noUsages.map((usage) => usage.line),
    [caller.line + sourceLines.findIndex((line) => line.trim() === 'Customer."No.";')],
  );
  assert.deepEqual(
    primaryContactUsages.map((usage) => usage.line),
    [caller.line + sourceLines.findIndex((line) => line.trim() === 'Customer."Primary Contact No.";')],
  );
});

test("indexes same-object integration-event trigger call sites", async () => {
  const input = sourceInput([
    "codeunit 50110 Event Publisher {",
    "    [IntegrationEvent(false, false)]",
    "    procedure OnBeforePost(DocumentNo: Code[20]; var IsHandled: Boolean)",
    "    begin",
    "    end;",
    "",
    "    procedure PreparePosting(DocumentNo: Code[20])",
    "    begin",
    "        OnBeforePost(DocumentNo, IsHandled);",
    "    end;",
    "}",
  ].join("\n"));
  const analysis = await analyzeFiles([input], [], [manifest]);
  const publisher = analysis.objects[0];

  assert.deepEqual(publisher.integrationEventDetails?.[0].parameters, [
    { name: "DocumentNo", type: "Code[20]", byReference: false },
    { name: "IsHandled", type: "Boolean", byReference: true },
  ]);
  assert.ok(
    analysis.usages.some(
      (usage) =>
        usage.symbolKey === publisher.key &&
        usage.objectKey === publisher.key &&
        usage.member === "OnBeforePost" &&
        usage.excerpt.includes("OnBeforePost(DocumentNo, IsHandled)"),
    ),
  );
});

test("keeps same-name integration events isolated by publisher object", async () => {
  const analysis = await analyzeFiles([sourceInput([
    "codeunit 50120 PublisherA {",
    "    [IntegrationEvent(false, false)]",
    "    procedure OnShared(Value: Integer)",
    "    begin",
    "    end;",
    "    procedure TriggerA()",
    "    begin",
    "        OnShared(1);",
    "    end;",
    "}",
    "codeunit 50121 PublisherB {",
    "    [IntegrationEvent(false, false)]",
    "    procedure OnShared(Value: Integer)",
    "    begin",
    "    end;",
    "    procedure TriggerB()",
    "    begin",
    "        OnShared(2);",
    "    end;",
    "}",
    "codeunit 50122 SubscriberA {",
    "    [EventSubscriber(ObjectType::Codeunit, Codeunit::PublisherA, 'OnShared', '', false, false)]",
    "    local procedure HandleA(Value: Integer)",
    "    begin",
    "    end;",
    "}",
    "codeunit 50123 SubscriberB {",
    "    [EventSubscriber(ObjectType::Codeunit, Codeunit::PublisherB, 'OnShared', '', false, false)]",
    "    local procedure HandleB(Value: Integer)",
    "    begin",
    "    end;",
    "}",
  ].join("\n"))], [], [manifest]);
  const publisherA = analysis.objects.find((object) => object.name === "PublisherA");
  const publisherB = analysis.objects.find((object) => object.name === "PublisherB");
  assert.ok(publisherA);
  assert.ok(publisherB);

  const referencesA = analysis.usages
    .filter((usage) => usage.symbolKey === publisherA.key && usage.member === "OnShared")
    .map((usage) => analysis.objects.find((object) => object.key === usage.objectKey)?.name)
    .sort();
  const referencesB = analysis.usages
    .filter((usage) => usage.symbolKey === publisherB.key && usage.member === "OnShared")
    .map((usage) => analysis.objects.find((object) => object.key === usage.objectKey)?.name)
    .sort();
  assert.deepEqual(referencesA, ["PublisherA", "SubscriberA"]);
  assert.deepEqual(referencesB, ["PublisherB", "SubscriberB"]);
});

test("maps TableRelation targets and marks conditional relations", async () => {
  const input = sourceInput([
    'table 50200 "Relation Source" {',
    "    fields {",
    '        field(1; "Vendor No."; Code[20]) {',
    '            TableRelation = "Relation Vendor";',
    "        }",
    '        field(2; "Related No."; Code[20]) {',
    '            TableRelation = if (Type = const(Vendor)) "Relation Vendor" where("No." = field("Vendor No.")) else if (Type = const(Resource)) "Relation Resource";',
    "        }",
    "    }",
    "}",
    'table 50201 "Relation Vendor" { }',
    'table 50202 "Relation Resource" { }',
  ].join("\n"));
  const analysis = await analyzeFiles([input], [], [manifest]);
  const sourceObject = analysis.objects.find((object) => object.name === "Relation Source");
  assert.equal(sourceObject?.fields[0].tableRelation, '"Relation Vendor"');
  assert.equal(sourceObject?.fields[1].tableRelation, 'if (Type = const(Vendor)) "Relation Vendor" where("No." = field("Vendor No.")) else if (Type = const(Resource)) "Relation Resource"');

  const relations = analysis.relationships
    .filter((relation) => relation.sourceKey === sourceObject?.key)
    .map((relation) => ({
      target: analysis.objects.find((object) => object.key === relation.targetKey)?.name,
      type: relation.type,
      conditional: relation.conditional,
      sourceLine: relation.sourceLine,
    }));
  assert.deepEqual(relations, [
    { target: "Relation Vendor", type: "TableRelation · Vendor No.", conditional: false, sourceLine: sourceObject?.fields[0].line },
    { target: "Relation Vendor", type: "TableRelation · Related No.", conditional: true, sourceLine: sourceObject?.fields[1].line },
    { target: "Relation Resource", type: "TableRelation · Related No.", conditional: true, sourceLine: sourceObject?.fields[1].line },
  ]);
});

test("maps table and page extensions back to their base objects", async () => {
  const basePackage: PackageMetadata = {
    name: "Base Extension",
    id: "22222222-2222-2222-2222-222222222222",
    path: "C:\\workspace\\Base\\app.json",
  };
  const overlayPackage: PackageMetadata = {
    name: "Overlay Extension",
    id: "33333333-3333-3333-3333-333333333333",
    path: "C:\\workspace\\Overlay\\app.json",
  };
  const inputs: SourceInput[] = [
    {
      path: "C:\\workspace\\Base\\Objects.al",
      content: [
        'table 50300 "Galaxy Table" { }',
        'page 50301 "Galaxy Page" { SourceTable = "Galaxy Table"; }',
      ].join("\n"),
      sourceType: "workspace",
      packageName: basePackage.name,
    },
    {
      path: "C:\\workspace\\Overlay\\Objects.al",
      content: [
        'tableextension 50302 "Galaxy Table Ext" extends "Galaxy Table" { }',
        'pageextension 50303 "Galaxy Page Ext" extends "Galaxy Page" { }',
      ].join("\n"),
      sourceType: "workspace",
      packageName: overlayPackage.name,
    },
  ];
  const analysis = await analyzeFiles(inputs, [], [basePackage, overlayPackage]);
  const extensionRelations = analysis.relationships
    .filter((relation) => relation.type === "extends")
    .map((relation) => ({
      source: analysis.objects.find((object) => object.key === relation.sourceKey)?.name,
      target: analysis.objects.find((object) => object.key === relation.targetKey)?.name,
    }));
  assert.deepEqual(extensionRelations, [
    { source: "Galaxy Table Ext", target: "Galaxy Table" },
    { source: "Galaxy Page Ext", target: "Galaxy Page" },
  ]);
});

test("reads package metadata and symbols from a local app archive", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bc-explorer-"));
  try {
    const packagePath = path.join(directory, "Base Application.app");
    const zip = new JSZip();
    zip.file(
      "NavxManifest.xml",
      '<Package><App Id="22222222-2222-2222-2222-222222222222" Name="Base Application" Publisher="Microsoft" Version="25.0.0.0" /></Package>',
    );
    zip.file(
      "SymbolReference.json",
      "\uFEFF" + JSON.stringify({
        AppId: "22222222-2222-2222-2222-222222222222",
        Name: "Base Application",
        Publisher: "Microsoft",
        Version: "25.0.0.0",
        Tables: [
          {
            Id: 18,
            Name: "Customer",
            Fields: [{
              Id: 1,
              Name: "No.",
              TypeDefinition: { Name: "Code[20]" },
              Properties: [{ Name: "TableRelation", Value: '"Customer Ledger Entry"' }],
            }],
            Properties: [{ Name: "DataClassification", Value: "CustomerContent" }],
          },
        ],
        Pages: [
          {
            Id: 21,
            Name: "Customer Card",
            Properties: [{ Name: "SourceTable", Value: "Customer" }],
            Controls: [{ Id: 1, Name: "General" }],
          },
        ],
        Reports: [
          {
            Id: 22,
            Name: "Customer List",
            DataItems: [{ Id: 1, Name: "Customer", RelatedTable: "Customer" }],
          },
        ],
        Namespaces: [
          {
            Name: "Microsoft.Sales.Customer",
            Tables: [{ Id: 19, Name: "Customer Ledger Entry", Fields: [] }],
          },
        ],
        EnumTypes: [{ Id: 23, Name: "Customer Status" }],
      }),
    );
    await fs.writeFile(packagePath, await zip.generateAsync({ type: "nodebuffer" }));

    const workspacePackage: PackageMetadata = {
      name: "My Extension",
      id: "33333333-3333-3333-3333-333333333333",
      path: path.join(directory, "app.json"),
      dependencies: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Base Application",
          version: "24.0.0.0",
        },
      ],
    };
    const progress: string[] = [];
    const analysis = await analyzeFiles([], [packagePath], [workspacePackage], (state) => {
      progress.push(state.message);
    });
    assert.ok(progress.includes("Reading Base Application.app"));
    assert.ok(progress.includes("Mapping object relationships"));
    assert.ok(progress.includes("Indexing where-used references"));
    const base = analysis.packages.find((item) => item.name === "Base Application");
    assert.equal(base?.publisher, "Microsoft");
    assert.equal(base?.version, "25.0.0.0");
    assert.equal(base?.objectCount, 5);
    assert.deepEqual(analysis.packageDependencies[0], {
      sourcePackage: "My Extension",
      dependency: workspacePackage.dependencies?.[0],
      installedPackage: "Base Application",
      installedVersion: "25.0.0.0",
    });
    assert.ok(analysis.diagnostics.some((item) => item.message.includes("requests version 24.0.0.0")));
    const table = analysis.objects.find((object) => object.name === "Customer");
    assert.equal(table?.kind, "table");
    assert.equal(table?.fields[0].name, "No.");
    assert.equal(table?.fields[0].type, "Code[20]");
    assert.equal(table?.fields[0].tableRelation, '"Customer Ledger Entry"');
    assert.equal(table?.properties.DataClassification, "CustomerContent");
    assert.equal(analysis.objects.find((object) => object.name === "Customer Card")?.kind, "page");
    assert.deepEqual(
      analysis.objects.find((object) => object.name === "Customer Card")?.controls,
      ["General"],
    );
    assert.deepEqual(
      analysis.objects.find((object) => object.name === "Customer List")?.dataItems,
      ["Customer: Customer"],
    );
    assert.ok(analysis.relationships.some((item) =>
      analysis.objects.find((object) => object.key === item.sourceKey)?.name === "Customer Card" &&
      analysis.objects.find((object) => object.key === item.targetKey)?.name === "Customer",
    ));
    assert.ok(analysis.relationships.some((item) =>
      analysis.objects.find((object) => object.key === item.sourceKey)?.name === "Customer" &&
      analysis.objects.find((object) => object.key === item.targetKey)?.name === "Customer Ledger Entry" &&
      item.type === "TableRelation · No." &&
      !item.conditional,
    ));
    assert.ok(analysis.objects.some((object) => object.kind === "enum" && object.name === "Customer Status"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("discovers app packages directly under hidden .alpackages directories", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bc-explorer-"));
  try {
    const packages = path.join(directory, ".alpackages");
    await fs.mkdir(path.join(packages, "nested"), { recursive: true });
    const expectedPath = path.join(packages, "Dependency.APP");
    await fs.writeFile(expectedPath, "package");
    await fs.writeFile(path.join(packages, "readme.txt"), "not a package");
    await fs.writeFile(path.join(packages, "nested", "nested.app"), "not a direct package");

    const result = await discoverAppPackages([directory]);
    assert.deepEqual(result.paths, [expectedPath]);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("reports unreadable dependency packages instead of silently skipping them", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bc-explorer-"));
  try {
    const packagePath = path.join(directory, "broken.app");
    await fs.writeFile(packagePath, "not a zip archive");
    const analysis = await analyzeFiles([], [packagePath], []);
    assert.equal(analysis.diagnostics.length, 1);
    assert.match(analysis.diagnostics[0].message, /Unable to read broken\.app/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("uses a fallback workspace name when app.json is malformed", () => {
  const parsed = parseAppManifest("{", "C:\\workspace\\app.json", "Fallback");
  assert.equal(parsed.name, "Fallback");
  assert.equal(parsed.path, "C:\\workspace\\app.json");
});
