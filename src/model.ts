export type ObjectKind =
  | "table"
  | "tableextension"
  | "page"
  | "pageextension"
  | "report"
  | "reportextension"
  | "codeunit"
  | "enum"
  | "interface"
  | "query"
  | "xmlport"
  | "permissionset"
  | "profile"
  | "controladdin"
  | "unknown";

export type SourceType = "workspace" | "package";
export type AnalysisPhase =
  | "manifests"
  | "sources"
  | "packages"
  | "relationships"
  | "usages"
  | "finalizing";

export interface FieldInfo {
  id: string;
  name: string;
  type: string;
  line: number;
  tableRelation?: string;
}

export interface PageControlGroup {
  group: string;
  controls: string[];
}

export interface ReportDataItem {
  name: string;
  sourceTable: string;
  line: number;
  properties: Record<string, string>;
}

export interface IntegrationEventParameter {
  name: string;
  type: string;
  byReference: boolean;
}

export interface IntegrationEventInfo {
  name: string;
  line: number;
  definition: string;
  comment: string;
  parameters: IntegrationEventParameter[];
  attributeArguments: string[];
}

export interface ObjectInfo {
  key: string;
  id: string;
  name: string;
  kind: ObjectKind;
  packageName: string;
  sourcePath: string;
  sourceType: SourceType;
  line: number;
  fields: FieldInfo[];
  controls: string[];
  controlGroups?: PageControlGroup[];
  dataItems: string[];
  reportDataItems?: ReportDataItem[];
  reportRequestPageControls?: PageControlGroup[];
  procedures: string[];
  integrationEvents: string[];
  integrationEventLines: Record<string, number>;
  integrationEventDetails?: IntegrationEventInfo[];
  properties: Record<string, string>;
  sourceText: string;
}

export interface RelationshipInfo {
  sourceKey: string;
  targetKey: string;
  type: string;
  conditional?: boolean;
  sourceLine?: number;
}

export interface UsageInfo {
  symbolKey: string;
  objectKey: string;
  member?: string;
  line: number;
  excerpt: string;
}

export interface PackageInfo {
  name: string;
  path: string;
  id?: string;
  publisher?: string;
  version?: string;
  objectCount: number;
  dependencies: AppDependency[];
}

export interface AppDependency {
  id?: string;
  name: string;
  publisher?: string;
  version?: string;
}

export interface PackageDependencyInfo {
  sourcePackage: string;
  dependency: AppDependency;
  installedPackage?: string;
  installedVersion?: string;
}

export interface DiagnosticInfo {
  severity: "warning" | "error";
  message: string;
  sourcePath?: string;
}

export interface Analysis {
  objects: ObjectInfo[];
  relationships: RelationshipInfo[];
  usages: UsageInfo[];
  packages: PackageInfo[];
  packageDependencies: PackageDependencyInfo[];
  diagnostics: DiagnosticInfo[];
  analyzedAt: string;
}

export interface SourceInput {
  path: string;
  content: string;
  sourceType: SourceType;
  packageName: string;
}

export interface PackageMetadata {
  name: string;
  path: string;
  id?: string;
  publisher?: string;
  version?: string;
  dependencies?: AppDependency[];
}
