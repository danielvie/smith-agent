---
name: nimt-project
description: Connect to and work with NIMT data in Azure DevOps and the SharePoint Meetings log. Use to query or update 2CES work items, links, and test artifacts, or read the meeting log. Follow the user's request instead of imposing a fixed analysis workflow.
---

# NIMT project

Use this skill to connect to NIMT data. The user decides what to read, compare, investigate, or change. Use Azure DevOps, the Meetings log, or both as requested. Do not force a workflow that combines them.

## Connections

### Azure DevOps

- Collection URL: `https://gide-tfs.web.boeing.com/tfs/IT`
- Project: `2CES`
- Project URL: `https://gide-tfs.web.boeing.com/tfs/IT/2CES`
- Work item URL: `https://gide-tfs.web.boeing.com/tfs/IT/2CES/_workitems/edit/{id}`
- NIMT area path: `2CES\2CES-LST\Eng-IPT-ST\Eng-MBSE-ART\NIMT`
- Default API version: `5.0`

Use the REST API instead of scraping ADO pages. Change the API version only when an endpoint requires it.

### Meetings log

- SharePoint URL: `https://boeing.sharepoint.us/sites/NIMTShare/Shared%20Documents/Project%20Management/Meetings%20log.xlsx?d=w234d112e39ea4216b229265b733ae53d&nav=MTBfe0UyQUJFMzI1LUQ1ODQtNDc1MC05NDFGLTcwRTBDOTg4QUMyQX1fezBCOTQwNDA3LTQ3MjAtNDRDQi04RTQ1LTJCRTg5RjNENjUxMH0`
- Workbook: `Meetings log.xlsx`
- Worksheet: `Log`
- Columns: `Item`, `Description`, `Reporter`, `Date of opening`, `Due Date`, `Responsible`, `Type`, `Forum`, `Status`, and `Comment`

The script first reads an already-open real workbook through Excel COM. If that is unavailable or is a blank placeholder, it falls back to the authenticated Chrome session exposed through Chrome DevTools at `http://127.0.0.1:9222`. The fallback runs the SharePoint download request inside the browser, never exports cookies, parses a temporary XLSX read-only, and deletes it immediately.

## Safety

- Read the ADO PAT from `process.env.ADO_PAT`.
- Never put the PAT in a command, file, URL, or tool parameter.
- Never print the PAT, authorization header, browser cookies, Office credentials, or session data.
- If the user pastes a PAT into chat, tell them to revoke it. Do not use it.
- Ask for the smallest ADO scope needed. Common scopes are `Work Items: Read`, `Work Items: Read & Write`, and `Test Management: Read`.
- Treat ADO, test, and meeting data as internal. Return only what the user asked for.
- Read requests may proceed without confirmation.
- Before an ADO or workbook write, state the exact target and change. Get confirmation unless the user already requested that exact change.
- Keep exports out of version control unless the user says they may be committed.

## Use the ADO script

Resolve `scripts/ado.mjs` relative to this skill directory. It handles authentication, URLs, HTTP errors, and JSON output. It never prints the PAT.

Check the live connection:

```text
node scripts/ado.mjs check
```

Read one work item:

```text
node scripts/ado.mjs item 6717890
node scripts/ado.mjs item 6717890 --relations
```

Run WIQL inline or from a text or JSON file:

```text
node scripts/ado.mjs wiql --query "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project"
node scripts/ado.mjs wiql --file query.json
```

A JSON query file must contain a `query` field. A plain-text file may contain only the WIQL string.

Scope WIQL to NIMT when the request calls for it:

```sql
AND [System.AreaPath] UNDER '2CES\2CES-LST\Eng-IPT-ST\Eng-MBSE-ART\NIMT'
```

`CONTAINS WORDS` uses full-text matching and can stem short terms. Check the match count before relying on the results.

Fetch fields for up to 200 work items with a JSON body:

```text
node scripts/ado.mjs batch --file batch.json
```

```json
{
  "ids": [6717890],
  "fields": [
    "System.Id",
    "System.WorkItemType",
    "System.Title",
    "System.State"
  ]
}
```

Request only the data needed for the user's question. For lists, return a count and compact work-item links instead of raw JSON.

## Change ADO work items

ADO updates use JSON Patch:

```text
PATCH https://gide-tfs.web.boeing.com/tfs/IT/2CES/_apis/wit/workitems/{id}?api-version=5.0
Content-Type: application/json-patch+json
```

```json
[
  {
    "op": "add",
    "path": "/fields/System.Tags",
    "value": "ARCH; NIMT"
  }
]
```

Before writing:

1. Read the current item and revision.
2. Confirm the item ID and exact changes.
3. Preserve existing values that the user did not ask to replace.
4. Use validation mode when the endpoint supports it.
5. Read the item again and report its new revision.

Do not delete items or links without explicit confirmation. Do not apply a bulk update until the user has reviewed the matched IDs or a representative sample.

## Work-item links

Read links with `$expand=relations`. Common hierarchy links are:

- `System.LinkTypes.Hierarchy-Forward` for children
- `System.LinkTypes.Hierarchy-Reverse` for parents

Add or remove links through JSON Patch at `/relations/-`. Read the item first. Removing a link requires its current array index.

ADO and the Meetings log have separate identifiers. Treat them as linked only when the data or the user establishes the connection.

## Test plans and cases

Read suite details and directly assigned test cases:

```text
GET {projectUrl}/_apis/test/Plans/{planId}/suites/{suiteId}?api-version=5.0
GET {projectUrl}/_apis/test/Plans/{planId}/suites/{suiteId}/testcases?api-version=5.0
```

A suite with no direct cases may have child suites. Read the plan tree before calling it empty:

```text
GET {projectUrl}/_apis/test/Plans/{planId}/suites?asTreeView=true&api-version=5.0
```

Use parent relationships when flattening the tree. Keep suite paths. Deduplicate test cases only when the user asks for unique cases.

Fetch test-case details through the Work Item API. Useful fields include:

```text
System.Id
System.Title
System.State
System.AreaPath
System.IterationPath
System.Tags
System.Description
Microsoft.VSTS.TCM.Steps
Microsoft.VSTS.TCM.Parameters
Microsoft.VSTS.TCM.LocalDataSource
Microsoft.VSTS.TCM.AutomationStatus
```

`Microsoft.VSTS.TCM.Steps` is XML. Keep the original XML before making a display version. Preserve step order, IDs, actions, expected results, parameters, and shared-step references.

Read test points when the user needs configurations, testers, assignments, or outcomes:

```text
GET {projectUrl}/_apis/test/Plans/{planId}/Suites/{suiteId}/points?api-version=5.0
```

A test case can have more than one test point.

Prefer the verified `_apis/test/Plans/...` routes. Use newer `_apis/testplan` routes only when needed.

## Use the Meetings log script

Resolve `scripts/meetings_log.py` relative to this skill directory. The script declares its Python dependencies for `uv` and never changes or saves the workbook.

Check the connection. An already-open real Excel workbook is preferred; otherwise Chrome must be running with remote debugging and an authenticated SharePoint session:

```text
uv run scripts/meetings_log.py check
```

Read rows as JSON:

```text
uv run scripts/meetings_log.py rows --limit 10
uv run scripts/meetings_log.py rows --column Item --column Status
```

List open tasks assigned to a user. `--name` is the user's display name; `--match-name` is the exact newline-separated token stored in `Responsible`:

```text
uv run scripts/meetings_log.py assigned --name "Vieira, Daniel" --match-name "Daniel" --status Open
```

Filter a general column with case-insensitive matching:

```text
uv run scripts/meetings_log.py contains Description interface
uv run scripts/meetings_log.py equals Status Open --column Item --column Description
```

Do not use `contains` for assignment checks. Use `assigned --match-name` so `Responsible` matches a complete newline-separated token.

Use `--case-sensitive` when requested. Use repeated `--column` options to limit output. Each unprojected row includes `_row`, the Excel row number.

Do not call `Workbooks.Open`. If Excel does not have the real workbook open, use the Chrome fallback. If Chrome is unavailable or not authenticated, return the script's direct error and ask the user to start the configured Chrome session or sign in to SharePoint. Leave Excel and Chrome as you found them.

### Change the Meetings log

Excel may autosave a SharePoint workbook as soon as a cell changes. Before assigning any value:

1. Read the current value.
2. Show the workbook, worksheet, cell address, old value, and proposed value.
3. Get confirmation unless the user already requested that exact edit.
4. Make the smallest change possible.
5. Read the cell again and report the result.

Do not make broad workbook edits from an ambiguous request.

## Failure handling

- `400 Bad Request`: check WIQL, field names, JSON Patch paths, and content type.
- `401 Unauthorized`: check the PAT, scopes, VPN, collection URL, and Basic-auth username.
- `403 Forbidden`: check project permission. For the workbook, use the COM or authenticated Chrome path instead of direct HTTP.
- `404 Not Found`: check the collection, project URL, route, ID, and API version.
- `409 Conflict` or revision failure: read the ADO item again. Do not overwrite concurrent changes.
- No active Excel object or workbook not open: the script automatically tries authenticated Chrome.
- Chrome DevTools unavailable: ask the user to start Chrome with remote debugging at `http://127.0.0.1:9222`.
- SharePoint authentication missing: ask the user to sign in within that Chrome session.
- Worksheet not found or unexpected columns: report the script error; do not treat the workbook as valid.

## Finish

State which connection you used and what you read or changed. For ADO writes, list the work-item IDs and resulting revisions. For workbook reads, state that Excel and Chrome remain unchanged and that any temporary download was deleted. Never include credentials or session data in the response.