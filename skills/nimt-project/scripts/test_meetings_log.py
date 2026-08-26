#!/usr/bin/env python
# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl", "pywin32", "websocket-client"]
# ///

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from meetings_log import (
    EXPECTED_HEADERS,
    MeetingsLogError,
    filter_assigned_records,
    is_blank_com_placeholder,
    read_temporary_xlsx,
    read_xlsx,
    records_from_values,
    responsible_matches,
    validate_headers,
)


class MeetingsLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.paths: list[Path] = []

    def tearDown(self) -> None:
        for path in self.paths:
            path.unlink(missing_ok=True)

    def workbook_path(self, headers: list[str] | None = None, worksheet: str = "Log") -> Path:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = worksheet
        if headers is not None:
            sheet.append(headers)
            sheet.append(["#1", "Task", "Reporter", None, None, "Daniel", "Action", "Forum", "Open", "Comment"][: len(headers)])
        handle = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        handle.close()
        path = Path(handle.name)
        self.paths.append(path)
        workbook.save(path)
        workbook.close()
        return path

    def test_rejects_blank_com_placeholder(self) -> None:
        self.assertTrue(is_blank_com_placeholder(["Meetings log"], "$A$1", None))
        self.assertFalse(is_blank_com_placeholder(["Log"], "$A$1:$B$2", (("Item", "Status"), ("#1", "Open"))))

    def test_parses_real_header_layout(self) -> None:
        values = (tuple(EXPECTED_HEADERS), tuple(range(len(EXPECTED_HEADERS))))
        headers, records = records_from_values(values)
        validate_headers(headers)
        self.assertEqual(headers, EXPECTED_HEADERS)
        self.assertEqual(records[0]["_row"], 2)

    def test_matches_complete_responsible_tokens_case_insensitively(self) -> None:
        for value in ("Daniel", "Daniel\nEduardo", "Glen\nIT\nDaniel", "dAnIeL"):
            with self.subTest(value=value):
                self.assertTrue(responsible_matches(value, "Daniel"))

    def test_does_not_match_unrelated_substrings_or_suffixes(self) -> None:
        for value in ("Dan", "McDaniel", "Daniel Eduardo", "Daniel (support)"):
            with self.subTest(value=value):
                self.assertFalse(responsible_matches(value, "Daniel"))

    def test_filters_open_and_closed_items(self) -> None:
        values = (
            tuple(EXPECTED_HEADERS),
            ("#1", "Open task", "Reporter", None, None, "Daniel", "Action", "Forum", "Open", ""),
            ("#2", "Closed task", "Reporter", None, None, "Daniel", "Action", "Forum", "Closed", ""),
            ("#3", "Other owner", "Reporter", None, None, "Eduardo", "Action", "Forum", "Open", ""),
        )
        headers, records = records_from_values(values)
        self.assertEqual([row["Item"] for row in filter_assigned_records(records, headers, "Daniel", "Open")], ["#1"])
        self.assertEqual([row["Item"] for row in filter_assigned_records(records, headers, "Daniel", "Closed")], ["#2"])

    def test_temporary_file_is_removed_after_success(self) -> None:
        seen: list[Path] = []

        def loader(path: Path) -> str:
            seen.append(path)
            self.assertTrue(path.exists())
            return "loaded"

        self.assertEqual(read_temporary_xlsx(b"test", loader), "loaded")
        self.assertFalse(seen[0].exists())

    def test_temporary_file_is_removed_after_failure(self) -> None:
        seen: list[Path] = []

        def loader(path: Path) -> None:
            seen.append(path)
            raise MeetingsLogError("failed")

        with self.assertRaisesRegex(MeetingsLogError, "failed"):
            read_temporary_xlsx(b"test", loader)
        self.assertFalse(seen[0].exists())

    def test_rejects_missing_log_worksheet(self) -> None:
        with self.assertRaisesRegex(MeetingsLogError, "Worksheet 'Log' was not found"):
            read_xlsx(self.workbook_path(EXPECTED_HEADERS, worksheet="Other"))

    def test_rejects_missing_responsible_or_status_column(self) -> None:
        for missing in ("Responsible", "Status"):
            with self.subTest(missing=missing):
                headers = [header for header in EXPECTED_HEADERS if header != missing]
                with self.assertRaisesRegex(MeetingsLogError, "missing: " + missing):
                    read_xlsx(self.workbook_path(headers))


if __name__ == "__main__":
    unittest.main()
