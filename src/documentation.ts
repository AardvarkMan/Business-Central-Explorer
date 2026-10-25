import * as path from "node:path";
import { Analysis, ObjectInfo, UsageInfo } from "./model";

export interface DocumentationScope {
  kind: "project" | "package";
  name: string;
}

export function createDocumentationMarkdown(
  analysis: Analysis,
  generatedAt = new Date().toISOString(),
  scope?: DocumentationScope,
): string {
  const scopedAnalysis = scope ? selectScope(analysis, scope) : analysis;
  const objectsByKey = new Map(scopedAnalysis.objects.map((object) => [object.key, object]));
  const workspaceObjects = scopedAnalysis.objects.filter((object) => object.sourceType === "workspace");
  const packageObjects = scopedAnalysis.objects.filter((object) => object.sourceType === "package");
  const fieldCount = scopedAnalysis.objects.reduce((count, object) => count + object.fields.length, 0);
  const eventCount = scopedAnalysis.objects.reduce((count, object) => count + object.integrationEvents.length, 0);
  const declaredDependencies = [
    ...scopedAnalysis.packageDependencies.map((item) => ({
      sourcePackage: item.sourcePackage,
      dependency: item.dependency,
      installedPackage: item.installedPackage,
      installedVersion: item.installedVersion,
    })),
    ...scopedAnalysis.packages.flatMap((pkg) =>
      pkg.dependencies.map((dependency) => ({
        sourcePackage: pkg.name,
        dependency,
        installedPackage: undefined as string | undefined,
        installedVersion: undefined as string | undefined,
      })),
    ),
  ].filter((item, index, all) =>
    all.findIndex((candidate) =>
      candidate.sourcePackage === item.sourcePackage &&
      candidate.dependency.name === item.dependency.name
    ) === index,
  );
  const lines = [
    "# Business Central Extension Reference",
    "",
    `Generated: ${generatedAt}`,
    "",
    "This reference is generated from the current Business Central Explorer analysis. It is intended for education and navigation, not as a compiler or runtime validation report.",
    "",
    ...(scope ? [`## Documentation scope`, "", `- Filter: ${scope.kind === "project" ? "Project" : "AL Package"}`, `- Selected: ${cell(scope.name)}`, ""] : []),
    "## Analysis summary",
    "",
    `- Analysis timestamp: ${scopedAnalysis.analyzedAt}`,
    `- Workspace objects: ${workspaceObjects.length}`,
    `- Dependency symbol objects: ${packageObjects.length}`,
    `- Total objects: ${scopedAnalysis.objects.length}`,
    `- Fields: ${fieldCount}`,
    `- Mapped relationships: ${scopedAnalysis.relationships.length}`,
    `- Indexed where-used references: ${scopedAnalysis.usages.length}`,
    `- Integration events: ${eventCount}`,
    `- Diagnostics: ${scopedAnalysis.diagnostics.length} (${scopedAnalysis.diagnostics.filter((item) => item.severity === "error").length} errors, ${scopedAnalysis.diagnostics.filter((item) => item.severity === "warning").length} warnings)`,
    "",
    "## Dependency inventory",
    "",
    "| Package | Publisher | Version | App ID | Objects |",
    "| --- | --- | --- | --- | ---: |",
    ...(scopedAnalysis.packages.length
      ? scopedAnalysis.packages.map((pkg) =>
          `| ${cell(pkg.name)} | ${cell(pkg.publisher ?? "—")} | ${cell(pkg.version ?? "—")} | ${cell(pkg.id ?? "—")} | ${pkg.objectCount} |`,
        )
      : ["| No .app packages were analyzed | — | — | — | 0 |"]),
    "",
    "### Declared dependencies",
    "",
    ...(declaredDependencies.length
      ? declaredDependencies.map((item) =>
          `- **${cell(item.sourcePackage)}** depends on **${cell(item.dependency.name)}**${item.dependency.publisher ? ` by ${cell(item.dependency.publisher)}` : ""}${item.dependency.version ? ` (declared version ${cell(item.dependency.version)})` : ""}; ${item.installedPackage ? `matched to ${cell(item.installedPackage)}${item.installedVersion ? ` ${cell(item.installedVersion)}` : ""}` : "no matching installed package was identified"}.`,
        )
      : ["No package dependency declarations were found."]),
    "",
    "## Relationship narrative",
    "",
    ...relationshipNarrative(scopedAnalysis, objectsByKey),
    "",
    "## Object reference",
    "",
    ...objectReference(scopedAnalysis.objects, scopedAnalysis.usages, objectsByKey),
    "",
    "## Field lineage and where-used",
    "",
    ...fieldLineage(scopedAnalysis.objects, scopedAnalysis.usages, objectsByKey),
    "",
    "## Integration event catalog",
    "",
    ...eventCatalog(scopedAnalysis.objects, scopedAnalysis.usages, objectsByKey),
    "",
    "## Diagnostics",
    "",
    ...(scopedAnalysis.diagnostics.length
      ? scopedAnalysis.diagnostics.map((item) => `- **${item.severity.toUpperCase()}** ${item.message}`)
      : ["No analysis diagnostics were reported."]),
    "",
    "## Reproducibility and limitations",
    "",
    "- The analysis timestamp and package identities above identify the analyzed snapshot. Re-run analysis after changing workspace source, manifests, or `.alpackages` contents.",
    "- Scoped diagnostics include only diagnostics linked to a source path in the selected project or package; diagnostics without a source path are omitted from scoped reports.",
    "- Workspace object source locations are represented by file name and line only; full local paths are omitted.",
    "- Dependency `.app` files may provide symbols without AL source. In that case, source excerpts, line numbers, and some member-level details are unavailable.",
    "- Relationships are inferred from recognized AL declarations and source patterns; the relationship list is not a complete semantic dependency graph.",
    "- Where-used results are token-indexed references against available source. They can include false positives or miss references that cannot be resolved from the available symbols.",
    "- Integration-event subscriber references are indexed event-name matches. They are labeled as inferred evidence and are not compiler-validated subscription bindings.",
    "- Package discovery is limited to `.app` files directly inside each workspace folder's `.alpackages` directory. No network downloads or recursive dependency resolution are performed.",
    "- This report does not validate AL compilation, permissions, runtime behavior, or Business Central server state.",
    "",
  ];
  return lines.join("\n");
}

function selectScope(analysis: Analysis, scope: DocumentationScope): Analysis {
  const objects = analysis.objects.filter((object) =>
    object.packageName === scope.name &&
    object.sourceType === (scope.kind === "package" ? "package" : "workspace"),
  );
  const keys = new Set(objects.map((object) => object.key));
  const objectPaths = new Set(objects.map((object) => path.resolve(object.sourcePath).toLowerCase()));
  const selectedPackage = analysis.packages.find((pkg) => pkg.name === scope.name);
  if (selectedPackage) objectPaths.add(path.resolve(selectedPackage.path).toLowerCase());
  return {
    ...analysis,
    objects,
    relationships: analysis.relationships.filter(
      (relation) => keys.has(relation.sourceKey) && keys.has(relation.targetKey),
    ),
    usages: analysis.usages.filter(
      (usage) => keys.has(usage.symbolKey) && keys.has(usage.objectKey),
    ),
    packages: selectedPackage ? [selectedPackage] : [],
    packageDependencies: scope.kind === "project"
      ? analysis.packageDependencies.filter((item) => item.sourcePackage === scope.name)
      : [],
    diagnostics: analysis.diagnostics.filter(
      (item) => item.sourcePath && objectPaths.has(path.resolve(item.sourcePath).toLowerCase()),
    ),
  };
}

function relationshipNarrative(
  analysis: Analysis,
  objectsByKey: Map<string, ObjectInfo>,
): string[] {
  if (!analysis.relationships.length) {
    return ["No relationships were identified in the available analysis."];
  }
  const byType = new Map<string, number>();
  for (const relation of analysis.relationships) {
    byType.set(relation.type, (byType.get(relation.type) ?? 0) + 1);
  }
  return [
    `The analyzer identified ${analysis.relationships.length} relationships across ${byType.size} relationship types: ${[...byType].map(([type, count]) => `${count} ${cell(type)}`).join(", ")}.`,
    "",
    ...analysis.relationships.map((relation) => {
      const source = objectsByKey.get(relation.sourceKey);
      const target = objectsByKey.get(relation.targetKey);
      return `- **${cell(source?.name ?? relation.sourceKey)}** (${cell(source?.kind ?? "unknown")}) ${relation.conditional ? "conditionally " : ""}**${cell(relation.type)}** → **${cell(target?.name ?? relation.targetKey)}**${relation.sourceLine ? ` (line ${relation.sourceLine})` : ""}.`;
    }),
  ];
}

function objectReference(
  objects: ObjectInfo[],
  usages: UsageInfo[],
  objectsByKey: Map<string, ObjectInfo>,
): string[] {
  if (!objects.length) {
    return ["No objects were available for reference documentation."];
  }
  const lines: string[] = [];
  for (const object of [...objects].sort((left, right) =>
    `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`),
  )) {
    lines.push(
      `### ${cell(object.kind)} ${cell(object.name)} (ID ${cell(object.id)})`,
      "",
      `- Package: ${cell(object.packageName)}`,
      `- Source: ${object.sourceType === "workspace" ? "workspace" : "dependency package"} · ${cell(path.basename(object.sourcePath))}${object.sourceType === "workspace" ? `:${object.line}` : ""}`,
    );
    if (object.properties.Extends) lines.push(`- Extends: ${cell(object.properties.Extends)}`);
    if (object.properties.SourceTable) lines.push(`- Source table: ${cell(object.properties.SourceTable)}`);
    if (object.properties.Caption) lines.push(`- Caption: ${cell(object.properties.Caption)}`);
    if (object.fields.length) {
      lines.push("", "| Field ID | Field | Type | TableRelation |", "| ---: | --- | --- | --- |");
      for (const field of object.fields) {
        lines.push(`| ${cell(field.id)} | ${cell(field.name)} | ${cell(field.type)} | ${cell(field.tableRelation ?? "—")} |`);
      }
    }
    if (object.controls.length) lines.push("", `- Controls: ${object.controls.map(cell).join(", ")}`);
    if (object.dataItems.length) lines.push("", `- Data items: ${object.dataItems.map(cell).join(", ")}`);
    if (object.procedures.length) lines.push("", `- Procedures: ${object.procedures.map(cell).join(", ")}`);
    if (object.integrationEvents.length) lines.push("", `- Integration events: ${object.integrationEvents.map(cell).join(", ")}`);
    const references = usages.filter((usage) => usage.objectKey === object.key);
    if (references.length) {
      lines.push("", `- Indexed references to other objects or members: ${references.length}`);
      for (const usage of references.slice(0, 20)) {
        const target = objectsByKey.get(usage.symbolKey);
        lines.push(`  - ${cell(target?.name ?? usage.symbolKey)}${usage.member ? ` · ${cell(usage.member)}` : ""} at line ${usage.line}`);
      }
      if (references.length > 20) lines.push(`  - …and ${references.length - 20} more indexed references.`);
    }
    lines.push("");
  }
  return lines;
}

function fieldLineage(
  objects: ObjectInfo[],
  usages: UsageInfo[],
  objectsByKey: Map<string, ObjectInfo>,
): string[] {
  const rows: string[] = [];
  for (const object of objects.filter((item) => item.kind === "table" || item.kind === "tableextension")) {
    for (const field of object.fields) {
      const references = usages.filter(
        (usage) => usage.symbolKey === object.key && usage.member === field.name,
      );
      rows.push(
        `### ${cell(object.name)}.${cell(field.name)}`,
        "",
        `- Definition: ${cell(field.type)}${field.tableRelation ? `; TableRelation = ${cell(field.tableRelation)}` : ""} (line ${field.line}).`,
        `- Indexed where-used references: ${references.length}.`,
      );
      for (const usage of references) {
        const consumer = objectsByKey.get(usage.objectKey);
        rows.push(`  - ${cell(consumer?.kind ?? "unknown")} **${cell(consumer?.name ?? usage.objectKey)}**, line ${usage.line}: \`${cell(usage.excerpt)}\``);
      }
      rows.push("");
    }
  }
  return rows.length ? rows : ["No table fields were available for lineage documentation."];
}

function eventCatalog(
  objects: ObjectInfo[],
  usages: UsageInfo[],
  objectsByKey: Map<string, ObjectInfo>,
): string[] {
  const events = objects.flatMap((publisher) =>
    publisher.integrationEvents.map((name) => ({ publisher, name })),
  );
  if (!events.length) {
    return ["No integration-event publishers were identified in the available symbols."];
  }
  const lines: string[] = [];
  for (const { publisher, name } of events) {
    lines.push(`### ${cell(publisher.name)}.${cell(name)}`, "");
    const matches = usages.filter(
      (usage) => usage.symbolKey === publisher.key && usage.member === name,
    );
    if (!matches.length) {
      lines.push("No indexed event-name references were found.", "");
      continue;
    }
    lines.push("Indexed event-name references (possible subscribers; inferred, not compiler-validated):");
    for (const usage of matches) {
      const subscriber = objectsByKey.get(usage.objectKey);
      lines.push(`- ${cell(subscriber?.kind ?? "unknown")} **${cell(subscriber?.name ?? usage.objectKey)}**, line ${usage.line}: \`${cell(usage.excerpt)}\``);
    }
    lines.push("");
  }
  return lines;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").replace(/`/g, "\\`");
}
