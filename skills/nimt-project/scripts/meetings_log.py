#!/usr/bin/env python
# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl", "pywin32", "websocket-client"]
# ///

import argparse
import base64
import json
import os
import sys
import tempfile
import time as time_module
from dataclasses import dataclass
from datetime import date, datetime, time
from importlib import import_module
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import ProxyHandler, Request, build_opener

WORKBOOK_NAME = "Meetings log.xlsx"
WORKSHEET_NAME = "Log"
ROW_FIELD = "_row"
SHAREPOINT_HOST = "boeing.sharepoint.us"
SHAREPOINT_DOCUMENT_URL = (
    "https://boeing.sharepoint.us/:x:/r/sites/NIMTShare/_layouts/15/Doc.aspx?"
    "sourcedoc=%7B234D112E-39EA-4216-B229-265B733AE53D%7D&file=Meetings%20log.xlsx"
)
SHAREPOINT_DOWNLOAD_URL = (
    "https://boeing.sharepoint.us/sites/NIMTShare/_api/web/"
    "GetFileById(guid'234D112E-39EA-4216-B229-265B733AE53D')/$value"
)
DEFAULT_CDP_URL = os.environ.get("SMITH_CHROME_DEVTOOLS_URL", "http://127.0.0.1:9222")
MAX_XLSX_BYTES = 25 * 1024 * 1024
EXPECTED_HEADERS = [
    "Item",
    "Description",
    "Reporter",
    "Date of opening",
    "Due Date",
    "Responsible",
    "Type",
    "Forum",
    "Status",
    "Comment",
]
DEFAULT_TASK_COLUMNS = ["Item", "Description", "Due Date", "Responsible", "Status", "Comment"]


class MeetingsLogError(RuntimeError):
    pass


@dataclass
class MeetingsLogData:
    source: str
    workbook: str
    worksheet: str
    headers: list[str]
    records: list[dict[str, Any]]
    display_name: str | None = None


def as_matrix(value: Any) -> list[tuple[Any, ...]]:
    if value is None:
        return []
    if isinstance(value, (tuple, list)):
        if not value:
            return []
        if isinstance(value[0], (tuple, list)):
            return [tuple(row) for row in value]
        return [tuple(value)]
    return [(value,)]


def clean_header(value: Any) -> str:
    return "" if value is None else str(value).strip()


def records_from_values(values: Any, first_excel_row: int = 1) -> tuple[list[str], list[dict[str, Any]]]:
    matrix = as_matrix(values)
    if not matrix:
        return [], []

    indexed_headers = [
        (index, clean_header(value))
        for index, value in enumerate(matrix[0])
        if clean_header(value)
    ]
    headers = [header for _, header in indexed_headers]
    if len(headers) != len(set(headers)):
        raise MeetingsLogError("The worksheet contains duplicate column headers")

    records = []
    for offset, row in enumerate(matrix[1:], start=1):
        record = {ROW_FIELD: first_excel_row + offset}
        for index, header in indexed_headers:
            record[header] = row[index] if index < len(row) else None
        records.append(record)
    return headers, records


def validate_headers(headers: list[str]) -> None:
    actual = {header.casefold(): header for header in headers}
    expected = {header.casefold(): header for header in EXPECTED_HEADERS}
    missing = [header for key, header in expected.items() if key not in actual]
    unexpected = [header for key, header in actual.items() if key not in expected]
    problems = []
    if missing:
        problems.append("missing: " + ", ".join(missing))
    if unexpected:
        problems.append("unexpected: " + ", ".join(unexpected))
    if problems:
        raise MeetingsLogError("Unexpected columns in worksheet 'Log' (" + "; ".join(problems) + ")")


def resolve_column(requested: str, headers: list[str]) -> str:
    if requested == ROW_FIELD:
        return ROW_FIELD
    matches = [header for header in headers if header.casefold() == requested.casefold()]
    if not matches:
        raise MeetingsLogError(
            "Unknown column '" + requested + "'. Available columns: " + ", ".join(headers)
        )
    return matches[0]


def match_records(
    records: list[dict[str, Any]],
    column: str,
    value: str,
    mode: str,
    case_sensitive: bool = False,
) -> list[dict[str, Any]]:
    needle = value if case_sensitive else value.casefold()
    result = []

    for record in records:
        raw = record.get(column)
        text = "" if raw is None else str(raw)
        candidate = text if case_sensitive else text.casefold()
        matched = needle in candidate if mode == "contains" else needle == candidate
        if matched:
            result.append(record)
    return result


def responsible_people(value: Any) -> list[str]:
    if value is None:
        return []
    return [token.strip() for token in str(value).splitlines() if token.strip()]


def responsible_matches(value: Any, match_name: str) -> bool:
    expected = match_name.strip().casefold()
    return bool(expected) and any(token.casefold() == expected for token in responsible_people(value))


def filter_assigned_records(
    records: list[dict[str, Any]],
    headers: list[str],
    match_name: str,
    status: str | None = None,
) -> list[dict[str, Any]]:
    responsible_column = resolve_column("Responsible", headers)
    status_column = resolve_column("Status", headers)
    expected_status = status.strip().casefold() if status else None
    return [
        record
        for record in records
        if responsible_matches(record.get(responsible_column), match_name)
        and (
            expected_status is None
            or str(record.get(status_column) or "").strip().casefold() == expected_status
        )
    ]


def select_columns(
    records: list[dict[str, Any]],
    requested: list[str] | None,
    headers: list[str],
) -> list[dict[str, Any]]:
    if not requested:
        return records
    columns = [resolve_column(column, headers) for column in requested]
    return [{column: record.get(column) for column in columns} for record in records]


def compact_tasks(
    records: list[dict[str, Any]],
    requested: list[str] | None,
    headers: list[str],
) -> list[dict[str, Any]]:
    columns = [resolve_column(column, headers) for column in (requested or DEFAULT_TASK_COLUMNS)]
    tasks = []
    for record in records:
        task = {ROW_FIELD: record.get(ROW_FIELD)}
        for column in columns:
            if column == ROW_FIELD:
                continue
            value = record.get(column)
            task[column] = responsible_people(value) if column.casefold() == "responsible" else value
        tasks.append(task)
    return tasks


def json_default(value: Any) -> str:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return str(value)


def print_json(value: Any) -> None:
    print(json.dumps(value, default=json_default, ensure_ascii=False, indent=2))


def is_blank_com_placeholder(sheet_names: list[str], used_range_address: str, values: Any) -> bool:
    matrix = as_matrix(values)
    has_value = any(clean_header(cell) for row in matrix for cell in row)
    normalized_address = used_range_address.replace("$", "").upper()
    return len(sheet_names) == 1 and normalized_address == "A1" and not has_value


def read_open_com_workbook() -> MeetingsLogData:
    try:
        win32 = import_module("win32com.client")
    except ImportError as error:
        raise MeetingsLogError("pywin32 is not installed; run this script with uv") from error

    try:
        excel = win32.GetActiveObject("Excel.Application")
    except Exception as error:
        raise MeetingsLogError("No active Excel session") from error

    open_books = [excel.Workbooks.Item(index).Name for index in range(1, excel.Workbooks.Count + 1)]
    workbook = next(
        (book for book in excel.Workbooks if book.Name.casefold() == WORKBOOK_NAME.casefold()),
        None,
    )
    if workbook is None:
        visible = ", ".join(open_books) if open_books else "none"
        raise MeetingsLogError("Meetings log workbook is not open. Open workbooks: " + visible)

    sheet_names = [
        workbook.Worksheets.Item(index).Name
        for index in range(1, workbook.Worksheets.Count + 1)
    ]
    first_sheet = workbook.Worksheets.Item(1)
    first_range = first_sheet.UsedRange
    if is_blank_com_placeholder(sheet_names, first_range.Address, first_range.Value):
        raise MeetingsLogError("The open Meetings log workbook is a blank Excel placeholder")

    sheet = next(
        (item for item in workbook.Worksheets if item.Name.casefold() == WORKSHEET_NAME.casefold()),
        None,
    )
    if sheet is None:
        raise MeetingsLogError(
            "Worksheet '" + WORKSHEET_NAME + "' was not found. Worksheets: " + ", ".join(sheet_names)
        )

    used_range = sheet.UsedRange
    headers, records = records_from_values(used_range.Value, used_range.Row)
    validate_headers(headers)
    display_name = str(getattr(excel, "UserName", "")).strip() or None
    return MeetingsLogData("excel-com", workbook.Name, sheet.Name, headers, records, display_name)


def read_xlsx(path: Path, source: str = "xlsx") -> MeetingsLogData:
    try:
        openpyxl = import_module("openpyxl")
    except ImportError as error:
        raise MeetingsLogError("openpyxl is not installed; run this script with uv") from error

    try:
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as error:
        raise MeetingsLogError("Downloaded Meetings log is not a valid XLSX workbook") from error

    try:
        if WORKSHEET_NAME not in workbook.sheetnames:
            raise MeetingsLogError(
                "Worksheet '" + WORKSHEET_NAME + "' was not found. Worksheets: " + ", ".join(workbook.sheetnames)
            )
        sheet = workbook[WORKSHEET_NAME]
        headers, records = records_from_values(list(sheet.iter_rows(values_only=True)), 1)
        validate_headers(headers)
        return MeetingsLogData(source, WORKBOOK_NAME, sheet.title, headers, records)
    finally:
        workbook.close()


def read_temporary_xlsx(
    content: bytes,
    loader: Callable[[Path], Any] = read_xlsx,
) -> Any:
    file_descriptor, temporary_path = tempfile.mkstemp(prefix="nimt-meetings-", suffix=".xlsx")
    path = Path(temporary_path)
    try:
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        with os.fdopen(file_descriptor, "wb") as temporary_file:
            temporary_file.write(content)
        return loader(path)
    finally:
        path.unlink(missing_ok=True)


def cdp_json(cdp_url: str, path: str, method: str = "GET") -> Any:
    request = Request(cdp_url.rstrip("/") + path, method=method)
    try:
        with build_opener(ProxyHandler({})).open(request, timeout=5) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        raise MeetingsLogError(
            "Chrome DevTools is unavailable at " + cdp_url + ". Start the authenticated Chrome session with remote debugging enabled."
        ) from error


class CdpClient:
    def __init__(self, web_socket_url: str):
        try:
            websocket = import_module("websocket")
        except ImportError as error:
            raise MeetingsLogError("websocket-client is not installed; run this script with uv") from error
        try:
            self.socket = websocket.create_connection(
                web_socket_url,
                timeout=60,
                suppress_origin=True,
                http_proxy_host=None,
            )
        except Exception as error:
            raise MeetingsLogError("Could not connect to the authenticated Chrome page") from error
        self.next_id = 1

    def close(self) -> None:
        try:
            self.socket.close()
        except Exception:
            pass

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        message_id = self.next_id
        self.next_id += 1
        try:
            self.socket.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
            while True:
                message = json.loads(self.socket.recv())
                if message.get("id") != message_id:
                    continue
                if "error" in message:
                    raise MeetingsLogError("Chrome DevTools request failed: " + str(message["error"].get("message", "unknown error")))
                return message.get("result", {})
        except MeetingsLogError:
            raise
        except Exception as error:
            raise MeetingsLogError("Chrome DevTools connection failed while reading SharePoint") from error

    def evaluate(self, expression: str) -> Any:
        result = self.call(
            "Runtime.evaluate",
            {"expression": expression, "awaitPromise": True, "returnByValue": True},
        )
        if "exceptionDetails" in result:
            description = result.get("result", {}).get("description", "browser evaluation failed")
            raise MeetingsLogError("SharePoint browser request failed: " + description)
        return result.get("result", {}).get("value")


def target_host(target: dict[str, Any]) -> str:
    try:
        return (urlparse(str(target.get("url", ""))).hostname or "").casefold()
    except ValueError:
        return ""


def get_sharepoint_target(cdp_url: str) -> tuple[dict[str, Any], bool]:
    targets = cdp_json(cdp_url, "/json/list")
    if not isinstance(targets, list):
        raise MeetingsLogError("Chrome DevTools returned an unexpected target list")
    target = next(
        (
            item
            for item in targets
            if isinstance(item, dict)
            and item.get("type") == "page"
            and target_host(item) == SHAREPOINT_HOST
        ),
        None,
    )
    if target:
        return target, False

    created = cdp_json(
        cdp_url,
        "/json/new?" + quote(SHAREPOINT_DOCUMENT_URL, safe=""),
        method="PUT",
    )
    if not isinstance(created, dict):
        raise MeetingsLogError("Chrome DevTools could not create a SharePoint page")
    return created, True


def wait_for_sharepoint_page(client: CdpClient, timeout_seconds: float = 30) -> None:
    deadline = time_module.monotonic() + timeout_seconds
    last_host = ""
    while time_module.monotonic() < deadline:
        try:
            location = client.evaluate(
                "({hostname: location.hostname, readyState: document.readyState})"
            )
            if isinstance(location, dict):
                last_host = str(location.get("hostname", ""))
                if last_host.casefold() == SHAREPOINT_HOST and location.get("readyState") in {"interactive", "complete"}:
                    return
        except MeetingsLogError:
            pass
        time_module.sleep(0.25)
    detail = " Current host: " + last_host if last_host else ""
    raise MeetingsLogError("SharePoint authentication is missing or the page did not load in Chrome." + detail)


def download_workbook_via_cdp(cdp_url: str = DEFAULT_CDP_URL) -> bytes:
    target, created = get_sharepoint_target(cdp_url)
    web_socket_url = target.get("webSocketDebuggerUrl")
    target_id = target.get("id")
    if not web_socket_url:
        raise MeetingsLogError("The Chrome SharePoint page does not expose a DevTools connection")

    client = CdpClient(str(web_socket_url))
    try:
        client.call("Runtime.enable")
        wait_for_sharepoint_page(client)
        download_url = json.dumps(SHAREPOINT_DOWNLOAD_URL)
        result = client.evaluate(
            """
            (async () => {
              try {
                const response = await fetch(%s, { credentials: "include", cache: "no-store" });
                if (!response.ok) return { ok: false, status: response.status };
                const bytes = new Uint8Array(await response.arrayBuffer());
                const chunks = [];
                for (let index = 0; index < bytes.length; index += 32768) {
                  chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
                }
                return {
                  ok: true,
                  size: bytes.length,
                  contentType: response.headers.get("content-type") || "",
                  data: btoa(chunks.join("")),
                };
              } catch (error) {
                return { ok: false, error: String(error) };
              }
            })()
            """ % download_url
        )
        if not isinstance(result, dict):
            raise MeetingsLogError("SharePoint browser returned an unexpected response")
        status = result.get("status")
        if status in {401, 403}:
            raise MeetingsLogError("SharePoint authentication is missing or expired in Chrome")
        if status == 404:
            raise MeetingsLogError("The Meetings log workbook was not found in SharePoint")
        if not result.get("ok"):
            detail = "HTTP " + str(status) if status else str(result.get("error", "unknown browser error"))
            raise MeetingsLogError("SharePoint workbook download failed: " + detail)
        size = result.get("size")
        if not isinstance(size, int) or size <= 0 or size > MAX_XLSX_BYTES:
            raise MeetingsLogError("SharePoint returned an invalid Meetings log file size")
        try:
            content = base64.b64decode(str(result.get("data", "")), validate=True)
        except ValueError as error:
            raise MeetingsLogError("SharePoint returned invalid workbook data") from error
        if len(content) != size or not content.startswith(b"PK"):
            raise MeetingsLogError("SharePoint did not return an XLSX workbook; authentication may be missing")
        return content
    finally:
        client.close()
        if created and target_id:
            try:
                cdp_json(cdp_url, "/json/close/" + quote(str(target_id), safe=""))
            except MeetingsLogError:
                pass


def read_browser_workbook(cdp_url: str = DEFAULT_CDP_URL) -> MeetingsLogData:
    content = download_workbook_via_cdp(cdp_url)
    return read_temporary_xlsx(content, lambda path: read_xlsx(path, "sharepoint-browser"))


def open_meetings_log(cdp_url: str = DEFAULT_CDP_URL) -> MeetingsLogData:
    try:
        return read_open_com_workbook()
    except MeetingsLogError as com_error:
        try:
            return read_browser_workbook(cdp_url)
        except MeetingsLogError as browser_error:
            raise MeetingsLogError(
                "Excel connection failed: " + str(com_error) + ". SharePoint browser fallback failed: " + str(browser_error)
            ) from browser_error


def add_output_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--column",
        action="append",
        dest="columns",
        help="Column to include. Repeat for more columns.",
    )
    parser.add_argument("--limit", type=int, help="Maximum rows to return.")


def validate_limit(limit: int | None) -> None:
    if limit is not None and limit < 0:
        raise MeetingsLogError("--limit must be zero or greater")


def output_rows(
    records: list[dict[str, Any]],
    headers: list[str],
    columns: list[str] | None,
    limit: int | None,
) -> None:
    validate_limit(limit)
    selected = select_columns(records, columns, headers)
    shown = selected if limit is None else selected[:limit]
    print_json({"count": len(records), "returned": len(shown), "rows": shown})


def self_test() -> None:
    values = (
        tuple(EXPECTED_HEADERS),
        ("#1", "Task", "Reporter", None, None, "Daniel\nEduardo", "Action", "Forum", "Open", ""),
        ("#2", "Other", "Reporter", None, None, "Maria", "Action", "Forum", "Closed", ""),
    )
    headers, records = records_from_values(values, 1)
    validate_headers(headers)
    assert records[0][ROW_FIELD] == 2
    assert responsible_matches(records[0]["Responsible"], "daniel")
    assert not responsible_matches(records[0]["Responsible"], "Dan")
    assert len(filter_assigned_records(records, headers, "Daniel", "Open")) == 1
    assert select_columns(records[:1], ["item", "status"], headers) == [
        {"Item": "#1", "Status": "Open"}
    ]
    print("Meetings log script self-test passed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read the NIMT Meetings log workbook without modifying it.")
    parser.add_argument(
        "--cdp-url",
        default=DEFAULT_CDP_URL,
        help="Chrome DevTools base URL used for the authenticated SharePoint fallback.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("check", help="Check the open Excel workbook or authenticated SharePoint browser connection.")

    rows = commands.add_parser("rows", help="Return workbook rows as JSON.")
    add_output_options(rows)

    assigned = commands.add_parser("assigned", help="Return tasks assigned to an exact Responsible name token.")
    assigned.add_argument("--name", help="Current user's display name. Used only for output; Excel can supply it when available.")
    assigned.add_argument("--match-name", required=True, help="Exact newline-separated name token stored in Responsible.")
    assigned.add_argument("--status", help="Exact status to include, for example Open.")
    add_output_options(assigned)

    for name in ("contains", "equals"):
        command = commands.add_parser(name, help=name.capitalize() + " filter on one column.")
        command.add_argument("field", help="Column name.")
        command.add_argument("value", help="Value to match.")
        command.add_argument("--case-sensitive", action="store_true")
        add_output_options(command)

    commands.add_parser("self-test", help="Run local tests without Excel or SharePoint.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "self-test":
        self_test()
        return

    data = open_meetings_log(args.cdp_url)

    if args.command == "check":
        print_json(
            {
                "connected": True,
                "source": data.source,
                "workbook": data.workbook,
                "worksheet": data.worksheet,
                "rows": len(data.records),
                "columns": data.headers,
                "displayName": data.display_name,
            }
        )
        return

    if args.command == "assigned":
        validate_limit(args.limit)
        filtered = filter_assigned_records(data.records, data.headers, args.match_name, args.status)
        tasks = compact_tasks(filtered, args.columns, data.headers)
        shown = tasks if args.limit is None else tasks[: args.limit]
        print_json(
            {
                "source": data.source,
                "currentUser": args.name or data.display_name,
                "matchedName": args.match_name,
                "status": args.status,
                "count": len(filtered),
                "returned": len(shown),
                "tasks": shown,
            }
        )
        return

    filtered = data.records
    if args.command in {"contains", "equals"}:
        column = resolve_column(args.field, data.headers)
        filtered = match_records(
            data.records,
            column,
            args.value,
            args.command,
            args.case_sensitive,
        )

    output_rows(filtered, data.headers, args.columns, args.limit)


if __name__ == "__main__":
    try:
        main()
    except MeetingsLogError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
