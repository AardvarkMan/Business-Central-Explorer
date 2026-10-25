import {
  FieldInfo,
  ObjectInfo,
  ObjectKind,
  PageControlGroup,
  PackageMetadata,
  SourceInput,
} from "./model";

const objectKinds = new Set<ObjectKind>([
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
]);

const objectDeclaration =
  /^(?:\uFEFF)?[ \t]*(tableextension|reportextension|pageextension|permissionset|xmlport|interface|codeunit|profile|table|page|report|query|enum)\s+(\d+)\s+("(?:[^"]|"")*"|[A-Za-z_][\w]*)/gim;

export function parseAlFile(input: SourceInput, metadata: PackageMetadata): ObjectInfo[] {
  const objects: ObjectInfo[] = [];
  const text = input.content;
  const declarations = [...maskComments(text).matchAll(objectDeclaration)];

  for (const declaration of declarations) {
    const kind = declaration[1].toLowerCase() as ObjectKind;
    if (!objectKinds.has(kind)) {
      continue;
    }

    const declarationOffset = declaration.index ?? 0;
    const openBrace = findNextCodeBrace(text, declarationOffset + declaration[0].length);
    if (openBrace < 0) {
      continue;
    }

    const closeBrace = findMatchingBrace(text, openBrace);
    if (closeBrace < 0) {
      continue;
    }

    const sourceText = text.slice(declarationOffset, closeBrace + 1);
    const name = unquote(declaration[3]);
    const id = declaration[2];
    const line = countLines(text, declarationOffset);
    const properties = readProperties(sourceText);
    const fields = readFields(sourceText);
    const controlGroups = readPageControlGroups(sourceText);
    const procedures = readProcedureNames(sourceText);
    const eventLocations = readIntegrationEvents(sourceText, line);
    const key = `${metadata.id ?? metadata.name}:${kind}:${id}`;

    objects.push({
      key,
      id,
      name,
      kind,
      packageName: metadata.name,
      sourcePath: input.path,
      sourceType: input.sourceType,
      line,
      fields,
      controls: [...new Set(controlGroups.flatMap((group) => group.controls))],
      controlGroups,
      dataItems: readDataItems(sourceText),
      ...(kind === "report" || kind === "reportextension"
        ? {
            reportDataItems: readReportDataItems(sourceText, line),
            reportRequestPageControls: readReportRequestPageControls(sourceText),
          }
        : {}),
      procedures,
      integrationEvents: eventLocations.map((event) => event.name),
      integrationEventLines: Object.fromEntries(
        eventLocations.map((event) => [event.name, event.line]),
      ),
      integrationEventDetails: eventLocations,
      properties,
      sourceText,
    });
  }

  return objects;
}

function readProperties(sourceText: string): Record<string, string> {
  const properties: Record<string, string> = {};
  const propertyPattern =
    /\b(SourceTable|TableType|Access|Caption|UsageCategory|ProcessingOnly|DefaultLayout|DefaultRenderingLayout|DataAccessIntent|InsertAllowed|ModifyAllowed|DeleteAllowed|Editable|ApplicationArea|UseRequestPage|AllowScheduling|ExcelLayout|RDLCLayout|WordLayout)\s*=\s*([^;\r\n]+)\s*;/gi;

  for (const match of topLevelObjectText(sourceText).matchAll(propertyPattern)) {
    properties[match[1]] = unquote(match[2].trim());
  }

  const extendsMatch = sourceText.match(
    /\b(?:tableextension|pageextension|reportextension)\s+\d+\s+(?:"(?:[^"]|"")*"|[\w]+)\s+extends\s+("(?:[^"]|"")*"|[\w]+)/i,
  );
  if (extendsMatch) {
    properties.Extends = unquote(extendsMatch[1]);
  }

  return properties;
}

function topLevelObjectText(sourceText: string): string {
  const characters = maskComments(sourceText).split("");
  let depth = 0;
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < sourceText.length; index++) {
    const char = sourceText[index];
    if (quote) {
      if (char === quote && sourceText[index + 1] === quote) {
        index++;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      if (depth >= 1) characters[index] = " ";
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth >= 1) characters[index] = " ";
    } else if (depth > 1 && char !== "\n" && char !== "\r") {
      characters[index] = " ";
    }
  }
  return characters.join("");
}

function readFields(sourceText: string): FieldInfo[] {
  const block = findNamedBlock(sourceText, "fields");
  if (!block) {
    return [];
  }

  const fields: FieldInfo[] = [];
  const fieldPattern =
    /\bfield\s*\(\s*(\d+)\s*;\s*("(?:[^"]|"")*"|[^;]+?)\s*;\s*([^)]+?)\s*\)/gi;

  for (const match of block.text.matchAll(fieldPattern)) {
    const offset = block.start + (match.index ?? 0);
    const bodyStart = findNextCodeBrace(block.text, (match.index ?? 0) + match[0].length);
    const bodyEnd = bodyStart >= 0 ? findMatchingBrace(block.text, bodyStart) : -1;
    const body = bodyEnd >= 0 ? block.text.slice(bodyStart + 1, bodyEnd) : "";
    const tableRelation = body.match(/\bTableRelation\s*=\s*([\s\S]*?)\s*;/i)?.[1]?.trim();
    fields.push({
      id: match[1],
      name: unquote(match[2].trim()),
      type: match[3].trim(),
      line: countLines(sourceText, offset),
      ...(tableRelation ? { tableRelation } : {}),
    });
  }
  return fields;
}

function readProcedureNames(sourceText: string): string[] {
  return [...sourceText.matchAll(/\bprocedure\s+("(?:[^"]|"")*"|[\w]+)/gi)]
    .map((match) => unquote(match[1]))
    .filter((name, index, all) => all.indexOf(name) === index);
}

function readIntegrationEvents(
  sourceText: string,
  objectLine: number,
): NonNullable<ObjectInfo["integrationEventDetails"]> {
  const events: NonNullable<ObjectInfo["integrationEventDetails"]> = [];
  const pattern =
    /\[\s*IntegrationEvent(?:\s*\(([^)]*)\))?\s*\]\s*(?:(?:local|internal|protected)\s+)?procedure\s+("(?:[^"]|"")*"|[\w]+)/gi;
  const code = maskComments(sourceText);
  for (const match of code.matchAll(pattern)) {
    const procedureKeyword = /(?:(?:local|internal|protected)\s+)?procedure\b/i.exec(match[0]);
    const procedureStart = (match.index ?? 0) + (procedureKeyword?.index ?? 0);
    const signatureStart = (match.index ?? 0) + match[0].length;
    const signatureOpen = /^\s*\(/.exec(sourceText.slice(signatureStart));
    const openParen = signatureOpen
      ? signatureStart + signatureOpen[0].lastIndexOf("(")
      : -1;
    const signatureEnd = openParen >= 0 ? findMatchingParenthesis(sourceText, openParen) : -1;
    const signature = signatureEnd >= 0 ? sourceText.slice(openParen + 1, signatureEnd) : "";
    const procedureEnd = signatureEnd >= 0
      ? signatureEnd + 1
      : signatureStart + match[0].length - match[0].lastIndexOf("procedure");
    events.push({
      name: unquote(match[2]),
      line: objectLine + countLines(sourceText, procedureStart) - 1,
      definition: sourceText.slice(procedureStart, procedureEnd).replace(/\s+/g, " ").trim(),
      comment: readPrecedingComments(sourceText, match.index ?? 0),
      parameters: splitAlArguments(signature).flatMap((parameter) => {
        const parsed = parameter.trim().match(/^(var\s+)?("(?:[^"]|"")*"|[\w]+)\s*:\s*([\s\S]+)$/i);
        return parsed
          ? [{
              name: unquote(parsed[2]),
              type: parsed[3].trim(),
              byReference: !!parsed[1],
            }]
          : [];
      }),
      attributeArguments: match[1]
        ? splitAlArguments(match[1]).map((argument) => unquote(argument.trim()))
        : [],
    });
  }
  return events;
}

function readPrecedingComments(sourceText: string, offset: number): string {
  const precedingLines = sourceText.slice(0, offset).split(/\r?\n/);
  while (precedingLines.length && !precedingLines[precedingLines.length - 1].trim()) precedingLines.pop();
  const comments: string[] = [];
  let inBlockComment = false;
  while (precedingLines.length) {
    const line = precedingLines[precedingLines.length - 1].trim();
    if (!line && comments.length) {
      precedingLines.pop();
      continue;
    }
    if (inBlockComment) {
      if (line.startsWith("/*")) {
        precedingLines.pop();
        inBlockComment = false;
        continue;
      }
      comments.unshift(line.replace(/^\*\s?/, "").trim());
      precedingLines.pop();
      continue;
    }
    if (line.endsWith("*/")) {
      const openingIndex = line.lastIndexOf("/*");
      comments.unshift(
        line.slice(openingIndex < 0 ? 0 : openingIndex + 2, -2).replace(/^\*\s?/, "").trim(),
      );
      precedingLines.pop();
      inBlockComment = openingIndex < 0;
      continue;
    }
    if (/^\/\/\/?/.test(line)) {
      comments.unshift(line.replace(/^\/\/\/?/, "").trim());
      precedingLines.pop();
      continue;
    }
    break;
  }
  return comments.join("\n").trim();
}

function findMatchingParenthesis(text: string, openIndex: number): number {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index + 1] === quote) index++;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")" && --depth === 0) {
      return index;
    }
  }
  return -1;
}

function splitAlArguments(value: string): string[] {
  const argumentsList: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index + 1] === quote) index++;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    } else if ((char === "," || char === ";") && depth === 0) {
      argumentsList.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (value.slice(start).trim()) argumentsList.push(value.slice(start));
  return argumentsList;
}

function readPageControlGroups(sourceText: string): Array<{ group: string; controls: string[] }> {
  const layout = findNamedBlock(sourceText, "layout");
  if (!layout) {
    return [];
  }
  const groups = new Map<string, string[]>();
  const readScope = (text: string, path: string[]): void => {
    const pattern = /\b(area|group|repeater|cuegroup|field)\s*\(\s*("(?:[^"]|"")*"|[^;,)]+)[^)]*\)/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const name = unquote(match[2].trim());
      const bodyStart = findNextCodeBrace(text, pattern.lastIndex);
      const bodyEnd = bodyStart >= 0 ? findMatchingBrace(text, bodyStart) : -1;
      if (match[1].toLowerCase() === "field") {
        const group = path.join(" / ") || "Ungrouped";
        const controls = groups.get(group) ?? [];
        if (!controls.includes(name)) controls.push(name);
        groups.set(group, controls);
      } else if (bodyEnd >= 0) {
        readScope(text.slice(bodyStart + 1, bodyEnd), [...path, name]);
      }
      if (bodyEnd >= 0) pattern.lastIndex = bodyEnd + 1;
    }
  };
  readScope(layout.text, []);
  return [...groups].map(([group, controls]) => ({ group, controls }));
}

function readDataItems(sourceText: string): string[] {
  const items: string[] = [];
  const pattern =
    /\bdataitem\s*\(\s*([^;]+);\s*("(?:[^"]|"")*"|[\w]+)/gi;
  for (const match of sourceText.matchAll(pattern)) {
    const item = `${unquote(match[1])}: ${unquote(match[2])}`;
    if (!items.includes(item)) {
      items.push(item);
    }
  }
  return items;
}

function readReportDataItems(
  sourceText: string,
  objectLine: number,
): NonNullable<ObjectInfo["reportDataItems"]> {
  const items: NonNullable<ObjectInfo["reportDataItems"]> = [];
  const pattern = /\bdataitem\s*\(\s*([^;]+);\s*("(?:[^"]|"")*"|[\w]+)/gi;
  for (const match of sourceText.matchAll(pattern)) {
    const offset = match.index ?? 0;
    const bodyStart = findNextCodeBrace(sourceText, offset + match[0].length);
    const bodyEnd = bodyStart >= 0 ? findMatchingBrace(sourceText, bodyStart) : -1;
    const body = bodyEnd >= 0 ? sourceText.slice(bodyStart + 1, bodyEnd) : "";
    const properties: Record<string, string> = {};
    const propertyPattern =
      /\b(DataItemTableView|DataItemLink|DataItemLinkReference|DataItemTableFilter|RequestFilterFields|RequestFilterHeading|PrintOnlyIfDetail|MaxIteration)\s*=\s*([^;\r\n]+)\s*;/gi;
    for (const property of body.matchAll(propertyPattern)) {
      properties[property[1]] = unquote(property[2].trim());
    }
    items.push({
      name: unquote(match[1].trim()),
      sourceTable: unquote(match[2]),
      line: objectLine + countLines(sourceText, offset) - 1,
      properties,
    });
  }
  return items;
}

function readReportRequestPageControls(sourceText: string): PageControlGroup[] {
  const requestPage = findNamedBlock(sourceText, "requestpage");
  if (!requestPage) return [];
  const layout = findNamedBlock(requestPage.text, "layout");
  if (!layout) return [];
  return readPageControlGroups(`layout {${layout.text}}`);
}

function findNamedBlock(
  text: string,
  name: string,
): { text: string; start: number } | undefined {
  const pattern = new RegExp(`\\b${name}\\s*\\{`, "i");
  const match = pattern.exec(text);
  if (!match) {
    return undefined;
  }
  const openBrace = text.indexOf("{", match.index);
  const closeBrace = findMatchingBrace(text, openBrace);
  if (closeBrace < 0) {
    return undefined;
  }
  return {
    text: text.slice(openBrace + 1, closeBrace),
    start: openBrace + 1,
  };
}

function findNextCodeBrace(text: string, offset: number): number {
  let quote: '"' | "'" | undefined;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = offset; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (char === quote && next === quote) {
        index++;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      index++;
    } else if (char === "/" && next === "*") {
      inBlockComment = true;
      index++;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      return index;
    }
    if (char === ";") {
      return -1;
    }
  }
  return -1;
}

function findMatchingBrace(text: string, openBrace: number): number {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openBrace; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (char === quote && next === quote) {
        index++;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      index++;
    } else if (char === "/" && next === "*") {
      inBlockComment = true;
      index++;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}" && --depth === 0) {
      return index;
    }
  }
  return -1;
}

function countLines(text: string, offset: number): number {
  let lines = 1;
  for (let index = 0; index < offset; index++) {
    if (text[index] === "\n") {
      lines++;
    }
  }
  return lines;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function maskComments(text: string): string {
  const characters = text.split("");
  let quote: '"' | "'" | undefined;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      } else {
        characters[index] = " ";
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index++;
        blockComment = false;
      } else if (char !== "\n" && char !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (quote) {
      if (char === quote && next === quote) {
        index++;
      } else if (char === quote) {
        quote = undefined;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "/" && next === "/") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index++;
      lineComment = true;
    } else if (char === "/" && next === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index++;
      blockComment = true;
    }
  }
  return characters.join("");
}
