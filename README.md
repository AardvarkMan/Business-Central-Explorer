# Aardvark Labs Business Central Explorer

![Aardvark Labs logo](resources/aardvarklabs-logo.jpg)

Business Central Explorer is an Aardvark Labs Visual Studio Code extension for inspecting a Business Central AL project and the `.app` packages in its `.alpackages` folder.

## Features

- The Relationships view centers the selected table with incoming and outgoing TableRelation targets arranged in columns on either side. Filter related tables by name or object ID; diagrams support drag-to-pan and wheel-to-zoom.
- Galaxy View shows extension modification links (such as a table and its table extension), not data relationships. It defaults to tables and table extensions, grouped by extension with distinct colors. Fit-to-view shows the complete galaxy; filter by object kind or name, zoom to reveal non-overlapping labels, and double-click an object to open its details.
- Declared `app.json` dependency coverage and version checks against installed packages.
- Compact, expandable object definitions with captions and IDs, plus a detailed where-used view that summarizes object/field definitions and lists source references in an expandable table with source navigation. Drill-down pages provide back navigation and a consistent **View Source** action; source opens in a persistent editor tab beside the explorer, including package AL source embedded in a read-only `.al` or `.dal` document.
- Page layouts show controls grouped by their AL layout area/group. Integration events can be filtered by publisher object and by related table, including tables connected through page and record relationships.
- Page definitions with layout controls and report summaries with dataset tables.
- Integration event catalog with publisher object, event name, and source location.
- Automatic re-analysis when AL files or `.alpackages` packages change.
- Sidebar selections open their main-panel explorer immediately. An Aardvark Labs loading panel tracks manifest, AL source, dependency package, relationship, and where-used work with individual progress bars.
- Searches match object names and IDs throughout the object browsers, where-used results, Galaxy View, and integration-event catalog.
- Clear diagnostics for packages that cannot be read or do not contain supported symbol metadata.

## Getting started

1. Open a Business Central AL workspace in Visual Studio Code.
2. Build the extension with `npm install` and `npm run compile`.
3. Run the extension with the VS Code Extension Development Host (`F5`).
4. Open the **BC Explorer** activity-bar view and select an explorer, or run **Business Central Explorer: Open Overview** from the Command Palette.

The extension scans `.al` files in workspace folders, reads project dependencies from `app.json`, and inspects `.app` files directly inside each workspace folder's `.alpackages` directory. Package discovery reads the hidden directory directly so VS Code search exclusions do not hide the packages. UTF-8 BOMs in Business Central's `SymbolReference.json` are supported. It does not download symbols or recursively resolve package dependencies. Package content is inspected locally.

## Development

- `npm run compile` compiles the extension.
- `npm test` compiles and runs the analyzer tests.
- `npm run watch` starts the TypeScript watcher.

## Package metadata support

For `.app` packages, the extension reads the package's `SymbolReference.json` and AL sources when present. AL source projects are parsed directly. Unknown package layouts and invalid archives are reported in the overview rather than silently ignored.
