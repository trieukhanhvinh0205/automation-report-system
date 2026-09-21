import unittest
from datetime import datetime

from stitch import Stitcher, frame_keys, max_overlap
from viber_collector import VIETNAM_TZ, contains_keyword, normalize_search, parse_detected_time


class CollectorTests(unittest.TestCase):
    def test_overlap(self):
        stitcher = Stitcher()
        stitcher.feed([{"text": "3"}, {"text": "4"}, {"text": "5"}])
        info = stitcher.feed([{"text": "1"}, {"text": "2"}, {"text": "3"}, {"text": "4"}])
        self.assertEqual(info["overlap"], 2)
        self.assertEqual([item["text"] for item in stitcher.result()], ["1", "2", "3", "4", "5"])

    def test_gap(self):
        self.assertEqual(max_overlap(frame_keys([{"text": "a"}]), frame_keys([{"text": "b"}])), 0)

    def test_duplicate_text_in_same_frame(self):
        keys = frame_keys([{"text": "ok"}, {"text": "ok"}])
        self.assertNotEqual(keys[0], keys[1])

    def test_disjoint_frame_can_be_retained_for_incomplete_scope(self):
        stitcher = Stitcher()
        stitcher.feed([{"text": "newer"}])
        added = stitcher.prepend_disjoint([{"text": "older"}])
        self.assertEqual(added, 1)
        self.assertEqual([item["text"] for item in stitcher.result()], ["older", "newer"])

    def test_unicode_keyword(self):
        self.assertTrue(contains_keyword("TRONG QUÁ TRÌNH giám sát", "trong qua trinh"))
        self.assertEqual(normalize_search(" Đã   XỬ LÝ "), "da xu ly")

    def test_parse_milliseconds(self):
        value, error = parse_detected_time("- Thời gian: Aug 20, 2026 @ 03:18:55.008")
        self.assertIsNone(error)
        self.assertEqual(value.strftime("%Y%m%d%H%M%S"), "20260820031855")
        self.assertEqual(value.microsecond, 8000)

    def test_parse_numbered_time_line(self):
        value, error = parse_detected_time(
            "Trong quá trình giám sát\n1. Thời gian: Sep 18, 2026, 6:09:31 AM\n2. Mức độ: Thấp"
        )
        self.assertIsNone(error)
        self.assertEqual(value.strftime("%Y%m%d%H%M%S"), "20260918060931")

    def test_parse_english_ampm(self):
        value, _ = parse_detected_time("Thời gian : Jul 23, 2026, 9:46:17 PM")
        self.assertEqual(value.hour, 21)

    def test_parse_vietnamese_numeric(self):
        value, _ = parse_detected_time("Thời gian: 23/07/2026 21:46:17")
        self.assertEqual(value, datetime(2026, 7, 23, 21, 46, 17, tzinfo=VIETNAM_TZ))

    def test_missing_time(self):
        value, error = parse_detected_time("Trong quá trình giám sát")
        self.assertIsNone(value)
        self.assertEqual(error, "INVALID_DETECTED_TIME_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
