import * as fs from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";
import { maskComments, parseAlFile } from "./alParser";
import {
  Analysis,
  AnalysisPhase,
  AppDependency,
  DiagnosticInfo,
  FieldInfo,
  ObjectInfo,
  ObjectKind,
  PageControlGroup,
  PackageInfo,
  PackageDependencyInfo,
  PackageMetadata,
  RelationshipInfo,
  SourceInput,
  UsageInfo,
} from "./model";

export interface AnalysisProgress {
  message: string;
  phase?: AnalysisPhase;
  completed?: number;
  total?: number;
}

export type AnalysisProgressReporter = (progress: AnalysisProgress) => void;

const supportedKinds = new Set<ObjectKind>([
  "table",
  "tableextension",
  "page",
  "pageextension",
  "report",
  "reportextension",
  "codeunit",
  "enum",
  "interface",
  "query",
  "xmlport",
  "permissionset",
  "profile",
  "controladdin",
]);

export async function analyzeFiles(
  sourceInputs: SourceInput[],
  packagePaths: string[],
  workspacePackages: PackageMetadata[],
  reportProgress?: AnalysisProgressReporter,
): Promise<Analysis> {
  reportProgress?.({ message: "Reading dependency packages", phase: "packages", completed: 0, total: packagePaths.length });
  const objects = sourceInputs.flatMap((input) => {
    const metadata = workspacePackages.find((item) => item.name === input.packageName) ??
      { name: input.packageName, path: input.path };
    return parseAlFile(input, metadata);
  });
  const packages: PackageInfo[] = workspacePackages.map((metadata) => ({
    ...metadata,
    objectCount: 0,
    dependencies: metadata.dependencies ?? [],
  }));
  const packageDependencies: PackageDependencyInfo[] = [];
  const diagnostics: DiagnosticInfo[] = [];

  for (const [index, packagePath] of packagePaths.entries()) {
    reportProgress?.({
      message: `Reading ${path.basename(packagePath)}`,
      phase: "packages",
      completed: index,
      total: packagePaths.length,
    });
    try {
      const parsed = await readAppPackage(packagePath);
      objects.push(...parsed.objects);
      packages.push({
        ...parsed.metadata,
        objectCount: parsed.objects.length,
        dependencies: parsed.metadata.dependencies ?? [],
      });
      if (parsed.objects.length === 0) {
        diagnostics.push({
          severity: "warning",
          sourcePath: packagePath,
          message: `${path.basename(packagePath)} contains no readable AL sources or supported SymbolReference.json metadata.`,
        });
      }
    } catch (error) {
      diagnostics.push({
        severity: "error",
        sourcePath: packagePath,
        message: `Unable to read ${path.basename(packagePath)}: ${errorMessage(error)}`,
      });
    }
    reportProgress?.({
      message: `Read ${path.basename(packagePath)}`,
      phase: "packages",
      completed: index + 1,
      total: packagePaths.length,
    });
  }

  const uniqueObjects = deduplicateObjects(objects);
  for (const item of packages) {
    item.objectCount = uniqueObjects.filter((object) => object.packageName === item.name).length;
  }

  for (const workspacePackage of packages.filter(
    (item) => !item.path.toLowerCase().endsWith(".app"),
  )) {
    for (const dependency of workspacePackage.dependencies) {
      const installed = packages.find((item) =>
        item.path.toLowerCase().endsWith(".app") &&
        ((dependency.id && item.id?.toLowerCase() === dependency.id.toLowerCase()) ||
          (item.name.toLowerCase() === dependency.name.toLowerCase() &&
            (!dependency.publisher ||
              item.publisher?.toLowerCase() === dependency.publisher.toLowerCase()))),
      );
      packageDependencies.push({
        sourcePackage: workspacePackage.name,
        dependency,
        installedPackage: installed?.name,
        installedVersion: installed?.version,
      });
      if (!installed) {
        diagnostics.push({
          severity: "warning",
          sourcePath: workspacePackage.path,
          message: `Declared dependency "${dependency.name}"${dependency.version ? ` (${dependency.version})` : ""} is not present in an .alpackages directory.`,
        });
      } else if (
        dependency.version &&
        installed.version &&
        dependency.version !== installed.version
      ) {
        diagnostics.push({
          severity: "warning",
          sourcePath: installed.path,
          message: `Dependency "${dependency.name}" requests version ${dependency.version}, but ${installed.version} is available.`,
        });
      }
    }
  }

  reportProgress?.({ message: "Mapping object relationships", phase: "relationships", completed: 0, total: uniqueObjects.length });
  const relationships = await buildRelationships(uniqueObjects, reportProgress);
  reportProgress?.({ message: "Indexing where-used references", phase: "usages", completed: 0, total: uniqueObjects.length });
  const usages = await buildUsages(uniqueObjects, reportProgress);
  return {
    objects: uniqueObjects,
    relationships,
    usages,
    packages,
    packageDependencies,
    diagnostics,
    analyzedAt: new Date().toISOString(),
  };
}

export async function discoverAppPackages(
  workspacePaths: string[],
): Promise<{ paths: string[]; diagnostics: DiagnosticInfo[] }> {
  const paths: string[] = [];
  const diagnostics: DiagnosticInfo[] = [];
  for (const workspacePath of workspacePaths) {
    const packageDirectory = path.join(workspacePath, ".alpackages");
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(packageDirectory, { withFileTypes: true });
    } catch (error) {
      if (!isMissingFile(error)) {
        diagnostics.push({
          severity: "warning",
          sourcePath: packageDirectory,
          message: `Unable to scan .alpackages: ${errorMessage(error)}`,
        });
      }
      continue;
    }

    paths.push(
      ...entries
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".app")
        .map((entry) => path.join(packageDirectory, entry.name)),
    );
  }
  return {
    paths: [...new Set(paths)],
    diagnostics,
  };
}

export function parseAppManifest(
  contents: string,
  manifestPath: string,
  fallbackName: string,
): PackageMetadata {
  try {
    const value = JSON.parse(contents) as Record<string, unknown>;
    return {
      name: stringValue(value.name) ?? fallbackName,
      path: manifestPath,
      id: stringValue(value.id),
      publisher: stringValue(value.publisher),
      version: stringValue(value.version),
      dependencies: readAppDependencies(value.dependencies),
    };
  } catch {
    return { name: fallbackName, path: manifestPath };
  }
}

async function readAppPackage(
  packagePath: string,
): Promise<{ metadata: PackageMetadata; objects: ObjectInfo[] }> {
  const bytes = await fs.readFile(packagePath);
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  const manifest = entries.find((entry) =>
    /(?:^|\/)navxmanifest\.xml$/i.test(entry.name),
  );
  const manifestText = manifest ? await manifest.async("text") : "";
  const metadata = parseNavxManifest(manifestText, packagePath);
  const objects: ObjectInfo[] = [];
  const alFiles = entries.filter((entry) => /\.al$/i.test(entry.name));

  for (const entry of alFiles) {
    objects.push(
      ...parseAlFile(
        {
          path: `${packagePath}!/${entry.name}`,
          content: await entry.async("text"),
          sourceType: "package",
          packageName: metadata.name,
        },
        metadata,
      ),
    );
  }

  const symbolFiles = entries.filter((entry) =>
    /(?:^|\/)symbolreference\.json$/i.test(entry.name),
  );
  for (const entry of symbolFiles) {
    const source = (await entry.async("text")).replace(/^\uFEFF/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(source) as unknown;
    } catch (error) {
      throw new Error(`Invalid SymbolReference.json: ${errorMessage(error)}`);
    }
    const symbolMetadata = parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
    metadata.id ??= stringValue(symbolMetadata.AppId);
    metadata.name = stringValue(symbolMetadata.Name) ?? metadata.name;
    metadata.publisher = stringValue(symbolMetadata.Publisher) ?? metadata.publisher;
    metadata.version = stringValue(symbolMetadata.Version) ?? metadata.version;
    objects.push(...parseSymbolReference(parsed, packagePath, metadata));
  }

  return { metadata, objects: deduplicateObjects(objects) };
}

function parseNavxManifest(contents: string, packagePath: string): PackageMetadata {
  const getTag = (tag: string): string | undefined => {
    const match = contents.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
    return match?.[1]?.trim();
  };
  const getAttribute = (tag: string, attribute: string): string | undefined => {
    const match = contents.match(
      new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]*)"`, "i"),
    );
    return match?.[1]
      ?.replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  };
  const fileName = path.basename(packagePath, path.extname(packagePath));
  const dependencies: AppDependency[] = [];
  for (const match of contents.matchAll(
    /<Dependency\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Dependency>)/gi,
  )) {
    const attributes = match[1];
    const dependencyText = match[2] ?? "";
    const readDependencyValue = (field: string): string | undefined =>
      dependencyText.match(new RegExp(`<${field}>([^<]*)</${field}>`, "i"))?.[1]?.trim() ??
      attributes.match(new RegExp(`\\b${field}="([^"]*)"`, "i"))?.[1];
    const name = readDependencyValue("Name");
    if (name) {
      dependencies.push({
        id: readDependencyValue("Id"),
        name,
        publisher: readDependencyValue("Publisher"),
        version: readDependencyValue("Version"),
      });
    }
  }
  return {
    name: getTag("Name") ?? getAttribute("App", "Name") ?? getAttribute("Package", "Name") ?? fileName,
    path: packagePath,
    id: getTag("Id") ?? getAttribute("App", "Id") ?? getAttribute("Package", "Id"),
    publisher: getTag("Publisher") ?? getAttribute("App", "Publisher") ?? getAttribute("Package", "Publisher"),
    version: getTag("Version") ?? getAttribute("App", "Version") ?? getAttribute("Package", "Version"),
    dependencies,
  };
}

function parseSymbolReference(
  input: unknown,
  packagePath: string,
  metadata: PackageMetadata,
): ObjectInfo[] {
  const results: ObjectInfo[] = [];
  const visited = new Set<object>();

  const visit = (value: unknown, contextKind?: string): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, contextKind);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    const declaredKind =
      stringProperty(record, ["ObjectType", "Kind", "ObjectKind", "$type", "Type"]) ??
      contextKind;
    const kind = normalizeKind(declaredKind);
    const id = scalarProperty(record, ["Id", "ID", "ObjectId", "ObjectID"]);
    const name = stringProperty(record, ["Name", "ObjectName"]);
    if (kind && id && name) {
      const fields = readSymbolFields(record);
      const members = readSymbolMembers(record);
      results.push({
        key: `${metadata.id ?? metadata.name}:${kind}:${id}`,
        id,
        name,
        kind,
        packageName: metadata.name,
        sourcePath: packagePath,
        sourceType: "package",
        line: 1,
        fields,
        controls: readSymbolControls(record),
        controlGroups: readSymbolControlGroups(record),
        dataItems: readSymbolDataItems(record),
        procedures: members.procedures,
        integrationEvents: members.integrationEvents,
        integrationEventLines: Object.fromEntries(
          members.integrationEvents.map((event) => [event, 1]),
        ),
        properties: readSymbolProperties(record),
        sourceText: "",
      });
    }

    for (const [key, child] of Object.entries(record)) {
      visit(child, kindForCollection(key) ?? (isNumericKey(key) ? declaredKind ?? contextKind : undefined));
    }
  };

  visit(input);
  return deduplicateObjects(results);
}

function readSymbolFields(record: Record<string, unknown>): FieldInfo[] {
  const candidates = propertyValue(record, ["Fields", "Field"]);
  return collectRecords(candidates, ["Field", "Fields"]).flatMap((candidate): FieldInfo[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const field = candidate as Record<string, unknown>;
    const id = scalarProperty(field, ["Id", "ID", "FieldId", "FieldID"]);
    const name = stringProperty(field, ["Name"]);
    if (!id || !name) {
      return [];
    }
    const tableRelation = symbolFieldTableRelation(field);
    return [{
      id,
      name,
      type: symbolType(field),
      line: 1,
      ...(tableRelation ? { tableRelation } : {}),
    }];
  });
}

function symbolFieldTableRelation(field: Record<string, unknown>): string | undefined {
  const directValue = propertyValue(field, ["TableRelation"]);
  if (typeof directValue === "string") {
    return directValue;
  }
  const properties = propertyValue(field, ["Properties", "Property"]);
  if (properties && !Array.isArray(properties) && typeof properties === "object") {
    const value = propertyValue(properties as Record<string, unknown>, ["TableRelation"]);
    if (typeof value === "string") {
      return value;
    }
  }
  const candidates = Array.isArray(properties) ? properties : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const property = candidate as Record<string, unknown>;
    if (stringProperty(property, ["Name"])?.toLowerCase() !== "tablerelation") {
      continue;
    }
    const value = propertyValue(property, ["Value"]);
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function readSymbolProperties(record: Record<string, unknown>): Record<string, string> {
  const properties: Record<string, string> = {};
  const candidates = propertyValue(record, ["Properties", "Property"]);
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      const property = candidate as Record<string, unknown>;
      const name = stringProperty(property, ["Name"]);
      const value = propertyValue(property, ["Value"]);
      if (name && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        properties[name] = String(value);
      }
    }
  } else if (candidates && typeof candidates === "object") {
    for (const [name, value] of Object.entries(candidates)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        properties[name] = String(value);
      }
    }
  }
  return properties;
}

function readSymbolControls(record: Record<string, unknown>): string[] {
  const controls = propertyValue(record, ["Controls", "Control"]);
  const names: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const item = value as Record<string, unknown>;
    const name = stringProperty(item, ["Name"]);
    if (name && !names.includes(name)) {
      names.push(name);
    }
    visit(propertyValue(item, ["Controls", "Control"]));
  };
  visit(controls);
  return names;
}

function readSymbolControlGroups(record: Record<string, unknown>): PageControlGroup[] {
  const groups = new Map<string, string[]>();
  const visit = (value: unknown, parents: string[]): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, parents));
      return;
    }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const name = stringProperty(item, ["Name"]);
    const children = propertyValue(item, ["Controls", "Control"]);
    if (name && children !== undefined) {
      visit(children, [...parents, name]);
      return;
    }
    if (name) {
      const group = parents.join(" / ") || "Ungrouped";
      const controls = groups.get(group) ?? [];
      if (!controls.includes(name)) controls.push(name);
      groups.set(group, controls);
    }
    visit(children, parents);
  };
  visit(propertyValue(record, ["Controls", "Control"]), []);
  return [...groups].map(([group, controls]) => ({ group, controls }));
}

function readSymbolDataItems(record: Record<string, unknown>): string[] {
  const dataItems = propertyValue(record, ["DataItems", "DataItem"]);
  const results: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const item = value as Record<string, unknown>;
    const name = stringProperty(item, ["Name"]);
    const table = stringProperty(item, ["RelatedTable", "TableName", "SourceTable"]);
    if (name && table) {
      const description = `${name}: ${table}`;
      if (!results.includes(description)) {
        results.push(description);
      }
    }
    visit(propertyValue(item, ["DataItems", "DataItem"]));
  };
  visit(dataItems);
  return results;
}

function readSymbolMembers(
  record: Record<string, unknown>,
): { procedures: string[]; integrationEvents: string[] } {
  const members = propertyValue(record, ["Methods", "Procedures", "Members"]);
  if (!Array.isArray(members)) {
    return { procedures: [], integrationEvents: [] };
  }

  const procedures: string[] = [];
  const integrationEvents: string[] = [];
  for (const member of members) {
    if (!member || typeof member !== "object" || Array.isArray(member)) {
      continue;
    }
    const method = member as Record<string, unknown>;
    const name = stringProperty(method, ["Name"]);
    if (!name) {
      continue;
    }
    procedures.push(name);
    const attributes = propertyValue(method, ["Attributes", "Attribute"]);
    if (
      stringProperty(method, ["Kind", "Type", "AttributeType"])?.toLowerCase() ===
        "integrationevent" ||
      propertyValue(method, ["IsIntegrationEvent"]) === true ||
      (Array.isArray(attributes) &&
        attributes.some(
          (attribute) => {
            const description =
              typeof attribute === "string" ? attribute : JSON.stringify(attribute);
            return description.toLowerCase().includes("integrationevent");
          },
        ))
    ) {
      integrationEvents.push(name);
    }
  }
  return { procedures, integrationEvents };
}

function normalizeKind(value: string | undefined): ObjectKind | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  for (const kind of supportedKinds) {
    if (normalized === kind.toLowerCase()) {
      return kind;
    }
  }
  return undefined;
}

function kindForCollection(value: string): string | undefined {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "enumtypes") {
    return "enum";
  }
  return [...supportedKinds].find(
    (kind) =>
      normalized === `${kind.toLowerCase()}s` ||
      normalized === kind ||
      normalized.startsWith(`${kind.toLowerCase()}object`) ||
      normalized.startsWith(`${kind.toLowerCase()}reference`),
  );
}

function collectRecords(value: unknown, collectionNames: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecords(item, collectionNames));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  const id = scalarProperty(record, ["Id", "ID", "ObjectId", "ObjectID", "FieldId", "FieldID"]);
  const name = stringProperty(record, ["Name", "ObjectName"]);
  if (id && name) {
    return [value];
  }
  for (const key of collectionNames) {
    const child = propertyValue(record, [key]);
    if (child !== undefined) {
      return collectRecords(child, collectionNames);
    }
  }
  return Object.values(record).flatMap((child) => collectRecords(child, collectionNames));
}

function symbolType(record: Record<string, unknown>): string {
  const directType = propertyValue(record, ["Type", "DataType", "TypeDefinition"]);
  if (typeof directType === "string") {
    return directType;
  }
  if (directType && typeof directType === "object" && !Array.isArray(directType)) {
    const definition = directType as Record<string, unknown>;
    const name = stringProperty(definition, ["Name", "Type", "DataType"]);
    const length = scalarProperty(definition, ["Length"]);
    return name ? `${name}${length ? `[${length}]` : ""}` : "Unknown";
  }
  return "Unknown";
}

function isNumericKey(value: string): boolean {
  return /^\d+$/.test(value);
}

function deduplicateObjects(objects: ObjectInfo[]): ObjectInfo[] {
  const unique = new Map<string, ObjectInfo>();
  for (const object of objects) {
    const previous = unique.get(object.key);
    if (!previous || (!previous.sourceText && object.sourceText)) {
      unique.set(object.key, object);
    }
  }
  return [...unique.values()];
}

async function buildRelationships(
  objects: ObjectInfo[],
  reportProgress?: AnalysisProgressReporter,
): Promise<RelationshipInfo[]> {
  const targets = new Map<string, ObjectInfo[]>();
  for (const object of objects) {
    const key = normalizeName(object.name);
    targets.set(key, [...(targets.get(key) ?? []), object]);
    if (object.kind === "table") {
      targets.set(object.id, [...(targets.get(object.id) ?? []), object]);
    }
  }

  const relations = new Map<string, RelationshipInfo>();
  const add = (
    source: ObjectInfo,
    targetName: string,
    type: string,
    conditional = false,
    sourceLine?: number,
    targetKind: ObjectInfo["kind"] = "table",
  ): void => {
    const matches = targets.get(normalizeName(targetName)) ?? [];
    for (const target of matches) {
      if (source.key === target.key || target.kind !== targetKind) {
        continue;
      }
      const key = `${source.key}\u0000${target.key}\u0000${type}`;
      const previous = relations.get(key);
      relations.set(key, {
        sourceKey: source.key,
        targetKey: target.key,
        type,
        conditional: conditional || previous?.conditional || false,
        sourceLine: sourceLine ?? previous?.sourceLine,
      });
    }
  };

  for (const [index, object] of objects.entries()) {
    const extensionTarget = object.properties.Extends;
    if (extensionTarget) {
      const targetKind = object.kind === "pageextension" ? "page" : "table";
      add(object, extensionTarget, "extends", false, undefined, targetKind);
    }
    const sourceTable = object.properties.SourceTable;
    if (sourceTable) {
      add(object, sourceTable, "source table");
    }
    for (const match of object.sourceText.matchAll(/\bdataitem\s*\(\s*[^;]+;\s*("[^"]+"|[\w]+)/gi)) {
      add(object, unquote(match[1]), "data item");
    }
    for (const dataItem of object.dataItems) {
      const tableName = dataItem.split(":").slice(1).join(":").trim();
      if (tableName) {
        add(object, tableName, "data item");
      }
    }
    if (object.kind === "table" || object.kind === "tableextension") {
      for (const field of object.fields) {
        if (!field.tableRelation) {
          continue;
        }
        const conditional = /\bif\s*\(/i.test(field.tableRelation);
        for (const targetName of tableRelationTargets(field.tableRelation)) {
          add(object, targetName, "TableRelation · " + field.name, conditional, field.line);
        }
      }
    }
    const recordReferences =
      /\b(?:Record|RecordRef)\s+("(?:[^"]|"")*"|[A-Za-z_][\w]*)|\bDatabase::\s*("(?:[^"]|"")*"|[A-Za-z_][\w]*)/gi;
    for (const match of object.sourceText.matchAll(recordReferences)) {
      add(object, unquote(match[1] ?? match[2]), "uses");
    }
    if ((index + 1) % 100 === 0 || index === objects.length - 1) {
      reportProgress?.({
        message: "Mapping object relationships",
        phase: "relationships",
        completed: index + 1,
        total: objects.length,
      });
      await yieldToEventLoop();
    }
  }
  return [...relations.values()];
}

function tableRelationTargets(value: string): string[] {
  const targets: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    cursor = skipWhitespace(value, cursor);
    if (/^else\b/i.test(value.slice(cursor))) {
      cursor += 4;
      cursor = skipWhitespace(value, cursor);
    }
    if (/^if\b/i.test(value.slice(cursor))) {
      cursor = skipWhitespace(value, cursor + 2);
      if (value[cursor] !== "(") {
        break;
      }
      const conditionEnd = findClosingParenthesis(value, cursor);
      if (conditionEnd < 0) {
        break;
      }
      cursor = skipWhitespace(value, conditionEnd + 1);
    }
    const qualifier = value.slice(cursor).match(/^(?:Database|Table)::/i);
    if (qualifier) {
      cursor += qualifier[0].length;
      cursor = skipWhitespace(value, cursor);
    }
    let target: string | undefined;
    if (value[cursor] === '"') {
      let end = cursor + 1;
      while (end < value.length) {
        if (value[end] === '"' && value[end + 1] === '"') {
          end += 2;
        } else if (value[end] === '"') {
          end++;
          break;
        } else {
          end++;
        }
      }
      if (value[end - 1] === '"') {
        target = unquote(value.slice(cursor, end));
        cursor = end;
      }
    } else {
      const identifier = value.slice(cursor).match(/^[A-Za-z_][\w]*/);
      if (identifier) {
        target = identifier[0];
        cursor += identifier[0].length;
      }
    }
    if (!target) {
      break;
    }
    targets.push(target);
    const elsePosition = findNextTopLevelElse(value, cursor);
    if (elsePosition < 0) {
      break;
    }
    cursor = elsePosition;
  }
  return [...new Set(targets)];
}

function skipWhitespace(value: string, start: number): number {
  let cursor = start;
  while (/\s/.test(value[cursor] ?? "")) {
    cursor++;
  }
  return cursor;
}

function findClosingParenthesis(value: string, open: number): number {
  let depth = 0;
  let quote = false;
  for (let cursor = open; cursor < value.length; cursor++) {
    if (quote) {
      if (value[cursor] === '"' && value[cursor + 1] === '"') {
        cursor++;
      } else if (value[cursor] === '"') {
        quote = false;
      }
    } else if (value[cursor] === '"') {
      quote = true;
    } else if (value[cursor] === "(") {
      depth++;
    } else if (value[cursor] === ")" && --depth === 0) {
      return cursor;
    }
  }
  return -1;
}

function findNextTopLevelElse(value: string, start: number): number {
  let depth = 0;
  let quote = false;
  for (let cursor = start; cursor < value.length; cursor++) {
    if (quote) {
      if (value[cursor] === '"' && value[cursor + 1] === '"') {
        cursor++;
      } else if (value[cursor] === '"') {
        quote = false;
      }
    } else if (value[cursor] === '"') {
      quote = true;
    } else if (value[cursor] === "(") {
      depth++;
    } else if (value[cursor] === ")") {
      depth--;
    } else if (depth === 0 && /^else\b/i.test(value.slice(cursor))) {
      return cursor;
    }
  }
  return -1;
}

async function buildUsages(
  objects: ObjectInfo[],
  reportProgress?: AnalysisProgressReporter,
): Promise<UsageInfo[]> {
  const usages = new Map<string, UsageInfo>();
  const symbolsByName = new Map<
    string,
    Array<{ object: ObjectInfo; member?: string; memberType?: "field" | "event" }>
  >();
  for (const symbol of objects) {
    const members: Array<{
      name: string;
      member?: string;
      memberType?: "field" | "event";
    }> = [
      { name: symbol.name },
      ...symbol.fields.map((field) => ({
        name: field.name,
        member: field.name,
        memberType: "field" as const,
      })),
      ...symbol.integrationEvents.map((event) => ({
        name: event,
        member: event,
        memberType: "event" as const,
      })),
    ];
    for (const member of members) {
      if (!member.name) {
        continue;
      }
      const key = normalizeName(member.name);
      symbolsByName.set(key, [
        ...(symbolsByName.get(key) ?? []),
        { object: symbol, member: member.member, memberType: member.memberType },
      ]);
    }
  }

  const tokenPattern = /"(?:[^"]|"")*"|'(?:[^']|'')*'|[A-Za-z_][\w]*/g;
  for (const [index, reference] of objects.entries()) {
    if (!reference.sourceText) {
      if ((index + 1) % 100 === 0 || index === objects.length - 1) {
        reportProgress?.({
          message: "Indexing where-used references",
          phase: "usages",
          completed: index + 1,
          total: objects.length,
        });
        await yieldToEventLoop();
      }
      continue;
    }
    const lines = reference.sourceText.split(/\r?\n/);
    const recordVariables = readRecordVariables(reference.sourceText);
    const defaultTables = new Set<string>();
    if (reference.kind === "table") {
      defaultTables.add(normalizeName(reference.name));
    }
    if (reference.properties.SourceTable) {
      defaultTables.add(normalizeName(reference.properties.SourceTable));
    }
    if (reference.kind === "tableextension" && reference.properties.Extends) {
      defaultTables.add(normalizeName(reference.properties.Extends));
    }
    if (reference.kind === "pageextension" && reference.properties.Extends) {
      for (const page of objects) {
        if (
          page.kind === "page" &&
          normalizeName(page.name) === normalizeName(reference.properties.Extends) &&
          page.properties.SourceTable
        ) {
          defaultTables.add(normalizeName(page.properties.SourceTable));
        }
      }
    }
    for (const match of reference.sourceText.matchAll(
      /\bdataitem\s*\(\s*([^;]+);\s*("(?:[^"]|"")*"|[\w]+)/gi,
    )) {
      const itemName = normalizeName(match[1]);
      const tableName = normalizeName(match[2]);
      recordVariables.set(
        itemName,
        new Set([...(recordVariables.get(itemName) ?? []), tableName]),
      );
    }

    const searchableSource = maskComments(reference.sourceText);
    let localLine = 1;
    let lineStart = 0;
    let nextNewline = searchableSource.indexOf("\n");
    for (const match of searchableSource.matchAll(tokenPattern)) {
      const targets = symbolsByName.get(normalizeName(match[0]));
      if (!targets) {
        continue;
      }
      const offset = match.index ?? 0;
      while (nextNewline >= 0 && nextNewline < offset) {
        localLine++;
        lineStart = nextNewline + 1;
        nextNewline = searchableSource.indexOf("\n", lineStart);
      }
      const prefix = reference.sourceText.slice(lineStart, offset);
      const qualifier = prefix.match(/\b([A-Za-z_][\w]*)\.\s*$/)?.[1];
      const normalizedQualifier = qualifier?.toLowerCase();
      const contextTables = normalizedQualifier === "rec" || normalizedQualifier === "xrec"
        ? defaultTables
        : qualifier
          ? recordVariables.get(normalizedQualifier ?? "") ?? new Set<string>()
          : defaultTables;
      for (const target of targets) {
        if (
          target.memberType === "field" &&
          !fieldNamesEqual(target.member, match[0])
        ) {
          continue;
        }
        if (
          target.memberType === "event" &&
          !matchesIntegrationEventReference(reference, offset, target.object, target.member ?? "")
        ) {
          continue;
        }
        if (target.object.key === reference.key && target.memberType !== "event") {
          continue;
        }
        if (
          target.memberType === "field" &&
          ![...contextTables].some((tableName) => {
            const targetName = normalizeName(target.object.name);
            return (
              targetName === tableName ||
              (target.object.kind === "tableextension" &&
                normalizeName(target.object.properties.Extends ?? "") === tableName)
            );
          })
        ) {
          continue;
        }
        const usage: UsageInfo = {
          symbolKey: target.object.key,
          objectKey: reference.key,
          member: target.member,
          line: reference.line + localLine - 1,
          excerpt: lines[localLine - 1]?.trim().slice(0, 140) ?? match[0],
        };
        usages.set(
          `${usage.symbolKey}\u0000${usage.objectKey}\u0000${usage.member ?? ""}\u0000${usage.line}`,
          usage,
        );
      }
    }
    if ((index + 1) % 100 === 0 || index === objects.length - 1) {
      reportProgress?.({
        message: "Indexing where-used references",
        phase: "usages",
        completed: index + 1,
        total: objects.length,
      });
      await yieldToEventLoop();
    }
  }
  return [...usages.values()];
}

function matchesIntegrationEventReference(
  reference: ObjectInfo,
  offset: number,
  publisher: ObjectInfo,
  eventName: string,
): boolean {
  const lineStart = reference.sourceText.lastIndexOf("\n", offset) + 1;
  const lineEndIndex = reference.sourceText.indexOf("\n", offset);
  const line = reference.sourceText.slice(lineStart, lineEndIndex < 0 ? undefined : lineEndIndex);
  if (reference.key === publisher.key) {
    return (
      new RegExp(`\\b${escapeRegExp(eventName)}\\s*\\(`, "i").test(line) &&
      !/\bprocedure\s+/i.test(line) &&
      !/\bIntegrationEvent\b/i.test(line)
    );
  }
  const subscriberPattern = /\bEventSubscriber\s*\(([^)]*)\)/gi;
  for (const subscriber of reference.sourceText.matchAll(subscriberPattern)) {
    const start = subscriber.index ?? 0;
    const end = start + subscriber[0].length;
    if (offset < start || offset >= end) continue;
    const argumentsList = splitEventArguments(subscriber[1]);
    const subscriberEventName = argumentsList[2]?.trim().replace(/^['"]|['"]$/g, "");
    const publisherReference = argumentsList[1] ?? "";
    return (
      normalizeName(subscriberEventName ?? "") === normalizeName(eventName) &&
      normalizeName(publisherReference).includes(normalizeName(publisher.name))
    );
  }
  return false;
}

function splitEventArguments(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index + 1] === quote) index++;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ",") {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function readRecordVariables(sourceText: string): Map<string, Set<string>> {
  const variables = new Map<string, Set<string>>();
  const declaration =
    /\b([A-Za-z_][\w]*)\s*:\s*Record(?:Ref)?\s+("(?:[^"]|"")*"|[A-Za-z_][\w]*)/gi;
  for (const match of sourceText.matchAll(declaration)) {
    const name = match[1].toLowerCase();
    const table = normalizeName(match[2]);
    variables.set(name, new Set([...(variables.get(name) ?? []), table]));
  }
  return variables;
}

function normalizeName(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/""/g, '"').replace(/''/g, "'").toLowerCase();
  }
  return trimmed.toLowerCase();
}

function fieldNamesEqual(left: string | undefined, right: string): boolean {
  return left !== undefined && normalizeName(left) === normalizeName(right);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readAppDependencies(value: unknown): AppDependency[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): AppDependency[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const dependency = item as Record<string, unknown>;
    const name = stringValue(dependency.name);
    if (!name) {
      return [];
    }
    return [{
      id: stringValue(dependency.id),
      name,
      publisher: stringValue(dependency.publisher),
      version: stringValue(dependency.version),
    }];
  });
}

function stringProperty(
  record: Record<string, unknown>,
  names: string[],
): string | undefined {
  const value = propertyValue(record, names);
  return stringValue(value);
}

function scalarProperty(record: Record<string, unknown>, names: string[]): string | undefined {
  const value = propertyValue(record, names);
  if (typeof value === "number") {
    return String(value);
  }
  return stringValue(value);
}

function propertyValue(record: Record<string, unknown>, names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const key = Object.keys(record).find((candidate) => wanted.has(candidate.toLowerCase()));
  return key ? record[key] : undefined;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"')
    : trimmed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
