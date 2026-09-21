import argparse
import hashlib
import json
import os
import platform
import re
import socket
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

from stitch import Stitcher, key_of

VIETNAM_TZ = timezone(timedelta(hours=7))
STOP_REPORT_START = "REPORT_START_REACHED"
STOP_HISTORY_TOP = "VIBER_HISTORY_TOP_REACHED"
STOP_MAX = "MAX_SCROLL_ROUNDS_REACHED"
STOP_NO_PROGRESS = "NO_PROGRESS"
STOP_INTERRUPTED = "USER_INTERRUPTED"


def normalize_search(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text.replace("đ", "d").replace("Đ", "D")).strip().casefold()


def contains_keyword(text, keyword):
    return normalize_search(keyword) in normalize_search(text)


TIME_LINE_RE = re.compile(
    r"(?:^|\n)\s*(?:(?:\d{1,2}\s*[.)])|[-–—•])?\s*(?:thời|thoi)\s*gian\s*:\s*(.+?)\s*(?=\n|$)",
    re.I | re.M,
)
TIME_FORMATS = (
    "%b %d, %Y @ %H:%M:%S.%f", "%b %d, %Y @ %H:%M:%S",
    "%b %d, %Y, %I:%M:%S %p", "%b %d, %Y, %I:%M %p",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S"
)


def parse_detected_time(text):
    match = TIME_LINE_RE.search(str(text or "").replace("\r\n", "\n"))
    if not match:
        return None, "INVALID_DETECTED_TIME_NOT_FOUND"
    raw = match.group(1).strip()
    for fmt in TIME_FORMATS:
        try:
            value = datetime.strptime(raw, fmt).replace(tzinfo=VIETNAM_TZ)
            return value, None
        except ValueError:
            pass
    return None, "INVALID_DETECTED_TIME_FORMAT"


def iso_value(value):
    return value.isoformat(timespec="seconds") if value else None


def load_dotenv(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except ValueError:
        raise ValueError(f"{name} must be an integer")


def parse_scope(value, label):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be ISO-8601 with timezone")
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include timezone")
    return parsed.astimezone(VIETNAM_TZ)


class ViberDesktopAdapter:
    def __init__(self, config):
        if platform.system() != "Windows":
            raise RuntimeError("Viber Desktop collection requires Windows")
        try:
            import uiautomation as auto
        except ImportError as error:
            raise RuntimeError("Missing uiautomation. Run: pip install -r requirements.txt") from error
        self.auto = auto
        self.config = config
        self.window = None
        self.chat_container = None
        self.actual_conversation = None

    def connect(self):
        self.window = self.auto.WindowControl(searchDepth=1, RegexName=self.config["window_regex"])
        if not self.window.Exists(maxSearchSeconds=5):
            raise RuntimeError("VIBER_WINDOW_NOT_FOUND")
        self.window.SetActive()
        return self.window

    def inspect(self):
        self.connect()
        rows = []
        for control, depth in self.auto.WalkControl(self.window, includeTop=False, maxDepth=20):
            try:
                rect = control.BoundingRectangle
                if rect.width() <= 0 or rect.height() <= 0:
                    continue
                value = read_control_text(control)[:120]
                if not value:
                    continue
                rows.append({
                    "depth": depth, "controlType": control.ControlTypeName,
                    "name": str(control.Name or "")[:120], "automationId": str(control.AutomationId or ""),
                    "className": str(control.ClassName or ""),
                    "rectangle": [rect.left, rect.top, rect.right, rect.bottom],
                    "hasValue": has_pattern(control, "GetValuePattern"),
                    "hasText": has_pattern(control, "GetTextPattern"), "sample": value
                })
            except Exception:
                continue
        print(json.dumps(rows, ensure_ascii=False, indent=2))

    def select_conversation(self, expected, use_current=False):
        self.connect()
        if use_current:
            self.actual_conversation = expected
            self.chat_container = self._find_chat_container()
            if not self.chat_container:
                raise RuntimeError("CHAT_CONTAINER_NOT_FOUND; run --inspect-ui")
            return expected
        search_controls = []
        for control, _ in self.auto.WalkControl(self.window, includeTop=False, maxDepth=12):
            try:
                if control.ControlType == self.auto.ControlType.EditControl and any(token in normalize_search(f"{control.Name} {control.AutomationId}") for token in ("search", "tim kiem")):
                    search_controls.append(control)
            except Exception:
                continue
        if not search_controls:
            raise RuntimeError("CONVERSATION_SEARCH_NOT_FOUND; run --inspect-ui")
        search = search_controls[0]
        search.Click()
        search.SendKeys("{Ctrl}a{Del}" + expected, waitTime=0.05)
        time.sleep(self.config["settle_seconds"])
        exact = []
        window_rect = self.window.BoundingRectangle
        left_pane_limit = window_rect.left + int(window_rect.width() * 0.48)
        for control, _ in self.auto.WalkControl(self.window, includeTop=False, maxDepth=20):
            try:
                text = read_control_text(control)
                rect = control.BoundingRectangle
                is_search = control in search_controls
                if not is_search and rect.right <= left_pane_limit and rect.width() > 0 and rect.height() > 0 and normalize_search(text) == normalize_search(expected):
                    exact.append(control)
            except Exception:
                continue
        unique = unique_controls(exact)
        if len(unique) > 1:
            raise RuntimeError("AMBIGUOUS_CONVERSATION")
        if not unique:
            raise RuntimeError("CONVERSATION_NOT_VERIFIED")
        unique[0].Click()
        time.sleep(self.config["settle_seconds"])
        matches = self._find_visible_exact_text(expected, header_only=True)
        if not matches:
            raise RuntimeError("CONVERSATION_NOT_VERIFIED")
        self.actual_conversation = expected
        self.chat_container = self._find_chat_container()
        if not self.chat_container:
            raise RuntimeError("CHAT_CONTAINER_NOT_FOUND; run --inspect-ui")
        return expected

    def _find_visible_exact_text(self, expected, header_only=False):
        found = []
        window_rect = self.window.BoundingRectangle
        header_left = window_rect.left + int(window_rect.width() * 0.35)
        header_bottom = window_rect.top + int(window_rect.height() * 0.35)
        for control, _ in self.auto.WalkControl(self.window, includeTop=False, maxDepth=16):
            try:
                if normalize_search(read_control_text(control)) == normalize_search(expected):
                    rect = control.BoundingRectangle
                    in_header = rect.left >= header_left and rect.top <= header_bottom
                    if rect.width() > 0 and rect.height() > 0 and (not header_only or in_header):
                        found.append(control)
            except Exception:
                continue
        return found

    def _find_chat_container(self):
        candidates = []
        window_rect = self.window.BoundingRectangle
        content_left = window_rect.left + int(window_rect.width() * 0.28)
        for control, _ in self.auto.WalkControl(self.window, includeTop=False, maxDepth=16):
            try:
                rect = control.BoundingRectangle
                count = len(collect_visible_messages(control, self.config, self.auto))
                covers_window = rect.width() >= window_rect.width() * 0.9 and rect.height() >= window_rect.height() * 0.9
                if count >= 1 and rect.left >= content_left and rect.width() > 250 and rect.height() > 200 and not covers_window:
                    candidates.append((count * rect.height() / max(rect.width(), 1), control))
            except Exception:
                continue
        if candidates:
            return max(candidates, key=lambda item: item[0])[1]
        # Some Qt/QML Viber builds expose message EditControls but not their
        # scrollable parent. The window remains a usable read/scroll surface.
        if collect_visible_messages(self.window, self.config, self.auto):
            return self.window
        return None

    def read_visible(self):
        return collect_visible_messages(self.chat_container, self.config, self.auto)

    def scroll_up(self, step):
        rect = self.chat_container.BoundingRectangle
        self.auto.SetCursorPos((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
        self.auto.WheelUp(wheelTimes=max(1, step), waitTime=0)

    def scroll_down(self, step):
        rect = self.chat_container.BoundingRectangle
        self.auto.SetCursorPos((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
        self.auto.WheelDown(wheelTimes=max(1, step), waitTime=0)


def has_pattern(control, method):
    try:
        getattr(control, method)()
        return True
    except Exception:
        return False


def read_control_text(control):
    try:
        value = (control.GetValuePattern().Value or "").strip()
        if value:
            return value
    except Exception:
        pass
    try:
        value = control.GetTextPattern().DocumentRange.GetText(-1).strip()
        if value:
            return value
    except Exception:
        pass
    return str(getattr(control, "Name", "") or "").strip()


def unique_controls(controls):
    seen, result = set(), []
    for control in controls:
        try:
            rect = control.BoundingRectangle
            key = (control.AutomationId, rect.left, rect.top, rect.right, rect.bottom)
        except Exception:
            key = id(control)
        if key not in seen:
            seen.add(key)
            result.append(control)
    return result


def collect_visible_messages(container, config, auto):
    found = []
    allowed = {auto.ControlType.EditControl, auto.ControlType.TextControl, auto.ControlType.DocumentControl}
    container_rect = container.BoundingRectangle
    for control, _ in auto.WalkControl(container, includeTop=False, maxDepth=20):
        try:
            if control.ControlType not in allowed:
                continue
            text = read_control_text(control)
            rect = control.BoundingRectangle
            if len(text) < config["min_text_len"] or rect.width() <= 0 or rect.height() <= 0:
                continue
            if rect.right <= container_rect.left or rect.left >= container_rect.right:
                continue
            if rect.bottom <= container_rect.top or rect.top >= container_rect.bottom:
                continue
            normalized = normalize_search(f"{control.Name} {control.AutomationId} {control.ClassName}")
            if any(token in normalized for token in ("search", "tim kiem", "message input", "compose")):
                continue
            found.append({"text": text, "top": rect.top, "left": rect.left, "automation_id": str(control.AutomationId or "")})
        except Exception:
            continue
    found.sort(key=lambda item: (item["top"], item["left"]))
    return dedupe_nested_nodes(found)


def dedupe_nested_nodes(messages):
    result = []
    for message in messages:
        if result and message["text"] == result[-1]["text"] and abs(message["top"] - result[-1]["top"]) < 4:
            continue
        result.append(message)
    return result


def collect_scope(adapter, config, report_start, report_end):
    stitcher = Stitcher()
    rounds = total_nodes = duplicates = no_progress = 0
    oldest = newest = None
    reached_start = False
    gap = False
    stop_reason = STOP_MAX
    previous_frame = None
    current_step = 1 if config.get("use_current_conversation") else config["scroll_step"]
    while rounds < config["max_scroll_rounds"]:
        visible = adapter.read_visible()
        total_nodes += len(visible)
        frame = tuple(key_of(item) for item in visible)
        if frame == previous_frame:
            no_progress += 1
            current_step = min(max(config["scroll_step"], 1), 1 + no_progress // 2)
        else:
            no_progress = 0
            current_step = 1 if config.get("use_current_conversation") else config["scroll_step"]
        previous_frame = frame
        info = stitcher.feed(visible)
        if info["overlap"] == 0:
            recovered = False
            last_candidate = visible
            for retry in range(config["max_zero_overlap_retries"]):
                time.sleep(config["settle_seconds"] * (retry + 2))
                candidate = adapter.read_visible()
                last_candidate = candidate
                probe = Stitcher()
                probe.messages, probe.keys = list(stitcher.messages), list(stitcher.keys)
                retry_info = probe.feed(candidate)
                if retry_info["overlap"]:
                    stitcher = probe
                    recovered = True
                    current_step = max(1, current_step - 1)
                    break
                adapter.scroll_down(1)
            if not recovered:
                gap = True
                current_step = 1
                stitcher.prepend_disjoint(last_candidate)
        duplicates += max(0, len(visible) - int(info["new"] or 0) - int(info["overlap"] or 0))
        times = [parse_detected_time(item["text"])[0] for item in visible if contains_keyword(item["text"], config["keyword"])]
        times = [value for value in times if value]
        if times:
            frame_oldest, frame_newest = min(times), max(times)
            oldest = frame_oldest if oldest is None else min(oldest, frame_oldest)
            newest = frame_newest if newest is None else max(newest, frame_newest)
            if frame_oldest <= report_start:
                reached_start = True
                stop_reason = "REPORT_START_REACHED_WITH_GAPS" if gap else STOP_REPORT_START
                break
        if no_progress >= 15:
            stop_reason = STOP_NO_PROGRESS
            break
        adapter.scroll_up(current_step)
        time.sleep(config["settle_seconds"])
        rounds += 1

    messages, invalid = build_messages(stitcher.result(), config, report_start, report_end)
    scope_complete = reached_start and not gap
    return messages, {
        "start": iso_value(report_start), "end": iso_value(report_end), "scopeComplete": scope_complete,
        "scrollRounds": rounds, "stopReason": stop_reason, "totalNodesRead": total_nodes,
        "totalUniqueMessages": len(stitcher.result()), "alertsMatchingKeyword": len(messages) + invalid,
        "alertsInScope": len(messages), "duplicateMessages": duplicates,
        "zeroOverlapCount": stitcher.zero_overlap_count, "oldestDetectedTimeSeen": iso_value(oldest),
        "newestDetectedTimeSeen": iso_value(newest), "reachedReportStart": reached_start,
        "invalidAlerts": invalid, "collectionGapDetected": gap
    }


def build_messages(raw_messages, config, report_start, report_end):
    result, invalid = [], 0
    seen = set()
    for index, item in enumerate(raw_messages):
        text = item.get("text", "")
        if not contains_keyword(text, config["keyword"]):
            continue
        detected, error = parse_detected_time(text)
        if error:
            invalid += 1
            continue
        if not report_start <= detected <= report_end:
            continue
        fingerprint = hashlib.sha256(f'{config["tenant"]}\x1f{config["conversation"]}\x1f{detected.isoformat()}\x1f{text}'.encode("utf-8")).hexdigest()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        result.append({
            "externalMessageId": f"uia-{fingerprint[:24]}",
            "messageSentTime": item.get("sent_time") or None,
            "messageText": text,
            "metadata": {"tenant": config["tenant"], "detectedTime": iso_value(detected),
                         "detectedTimeKey": detected.strftime("%Y%m%d%H%M%S"),
                         "conversationVerified": True, "source": "viber-desktop-uia", "sequence": index,
                         "automationId": item.get("automation_id") or None}
        })
    return result, invalid


def send_api(url, token, payload, retries=3, timeout=30):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["X-Collector-Token"] = token
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url.rstrip("/") + "/api/viber-imports", body, headers, method="POST")
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(f"API request failed after {retries} attempts: {last_error}")


def checkpoint_path(config):
    digest = hashlib.sha256(f'{config["customer_id"]}:{config["tenant"]}:{config["conversation"]}'.encode()).hexdigest()[:16]
    return Path(__file__).parent / ".checkpoints" / f"{digest}.json"


def write_checkpoint(config, scope, messages):
    path = checkpoint_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"customerId": config["customer_id"], "tenant": config["tenant"], "conversationName": config["conversation"],
               "lastFingerprint": key_of({"text": messages[-1]["messageText"]}) if messages else None,
               "oldestDetectedTime": scope["oldestDetectedTimeSeen"], "newestDetectedTime": scope["newestDetectedTimeSeen"],
               "lastRunAt": datetime.now(timezone.utc).isoformat(), "scope": scope,
               "conversationVerified": True, "scopeComplete": scope["scopeComplete"]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def build_parser():
    parser = argparse.ArgumentParser(description="Read scoped alerts from Viber Desktop using Windows UI Automation")
    parser.add_argument("--tenant", default=os.getenv("TENANT_CODE", "pvoil"))
    parser.add_argument("--customer-id", type=int)
    parser.add_argument("--conversation")
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--keyword")
    parser.add_argument("--window-regex")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output-json")
    parser.add_argument("--send-api", action="store_true")
    parser.add_argument("--ignore-checkpoint", action="store_true")
    parser.add_argument("--inspect-ui", action="store_true")
    parser.add_argument(
        "--use-current-conversation",
        action="store_true",
        help="Use the conversation already opened in Viber when the QML UI does not expose search/header controls"
    )
    parser.add_argument("--max-scroll-rounds", type=int)
    return parser


def main():
    root = Path(__file__).parent
    load_dotenv(root / ".env")
    args = build_parser().parse_args()
    tenants = json.loads((root / "tenants.json").read_text(encoding="utf-8"))
    tenant_key = normalize_search(args.tenant)
    tenant = tenants.get(tenant_key)
    if not tenant:
        raise ValueError("UNKNOWN_TENANT")
    conversation = args.conversation or os.getenv("CONVERSATION_NAME") or tenant["conversationNames"][0]
    if normalize_search(conversation) not in {normalize_search(item) for item in tenant["conversationNames"]}:
        raise ValueError("CONVERSATION_NOT_CONFIGURED_FOR_TENANT")
    config = {
        "tenant": tenant_key, "customer_id": args.customer_id or int(os.getenv("CUSTOMER_ID", tenant["customerId"])),
        "conversation": conversation, "keyword": args.keyword or os.getenv("ALERT_KEYWORD", tenant["alertKeyword"]),
        "window_regex": args.window_regex or os.getenv("WINDOW_NAME_REGEX", ".*Rakuten Viber.*"),
        "source_machine": os.getenv("SOURCE_MACHINE", socket.gethostname()),
        "scroll_step": env_int("SCROLL_WHEEL_STEP", 3), "settle_seconds": float(os.getenv("SETTLE_SECONDS", "0.8")),
        "max_scroll_rounds": args.max_scroll_rounds or env_int("MAX_SCROLL_ROUNDS", 2000),
        "max_zero_overlap_retries": env_int("MAX_ZERO_OVERLAP_RETRIES", 3), "min_text_len": env_int("MIN_TEXT_LEN", 3),
        "use_current_conversation": args.use_current_conversation
    }
    adapter = ViberDesktopAdapter(config)
    if args.inspect_ui:
        adapter.inspect()
        return
    if not args.start or not args.end:
        raise ValueError("--start and --end are required unless --inspect-ui is used")
    report_start, report_end = parse_scope(args.start, "--start"), parse_scope(args.end, "--end")
    if report_start > report_end:
        raise ValueError("--start must not be after --end")
    actual = adapter.select_conversation(conversation, use_current=args.use_current_conversation)
    messages, scope = collect_scope(adapter, config, report_start, report_end)
    verification_method = "USER_CONFIRMED_CURRENT_CONVERSATION" if args.use_current_conversation else "UI_AUTOMATION_HEADER"
    for message in messages:
        message["metadata"]["conversationVerificationMethod"] = verification_method
    payload = {"customerId": config["customer_id"], "tenant": config["tenant"], "sourceMachine": config["source_machine"],
               "conversationName": actual, "collectionScope": scope, "messages": messages}
    output_ok = False
    if args.output_json:
        Path(args.output_json).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        output_ok = True
    api_result = None
    if args.send_api and not args.dry_run:
        token = os.getenv("VIBER_COLLECTOR_TOKEN", "")
        if not token:
            raise ValueError("VIBER_COLLECTOR_TOKEN is required for --send-api")
        api_result = send_api(os.getenv("BACKEND_URL", "http://localhost:3000"), token, payload)
    summary = {"tenant": config["tenant"], "customerId": config["customer_id"], "requestedConversation": conversation,
               "actualConversation": actual, "conversationVerified": True,
               "conversationVerificationMethod": verification_method, **scope,
               "outputFile": args.output_json, "apiResult": api_result}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.dry_run and scope["scopeComplete"] and (output_ok or api_result):
        write_checkpoint(config, scope, messages)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(json.dumps({"stopReason": STOP_INTERRUPTED, "scopeComplete": False}))
        sys.exit(130)
    except Exception as error:
        print(json.dumps({"status": "error", "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
