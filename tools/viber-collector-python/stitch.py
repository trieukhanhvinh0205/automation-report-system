import hashlib
import json


def normalize_message(message):
    return {
        "text": str(message.get("text", "")).strip().replace("\r\n", "\n"),
        "sender": str(message.get("sender", "")).strip(),
        "sent_time": str(message.get("sent_time", "")).strip(),
        "automation_id": str(message.get("automation_id", "")).strip(),
    }


def key_of(message):
    normalized = normalize_message(message if isinstance(message, dict) else {"text": message})
    stable = {key: value for key, value in normalized.items() if value}
    return hashlib.sha256(json.dumps(stable, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def frame_keys(messages):
    counts = {}
    keys = []
    for message in messages:
        base = key_of(message)
        counts[base] = counts.get(base, 0) + 1
        keys.append(f"{base}:{counts[base]}")
    return keys


def max_overlap(new_keys, accumulated_keys):
    for size in range(min(len(new_keys), len(accumulated_keys)), 0, -1):
        if new_keys[-size:] == accumulated_keys[:size]:
            return size
    return 0


class Stitcher:
    def __init__(self):
        self.messages = []
        self.keys = []
        self.zero_overlap_count = 0

    def feed(self, visible_messages):
        visible = list(visible_messages)
        keys = frame_keys(visible)
        if not self.messages:
            self.messages = visible
            self.keys = keys
            return {"new": len(visible), "overlap": None}
        overlap = max_overlap(keys, self.keys)
        if overlap == 0:
            self.zero_overlap_count += 1
            return {"new": 0, "overlap": 0}
        older = visible[:-overlap]
        self.messages = older + self.messages
        self.keys = keys[:-overlap] + self.keys
        return {"new": len(older), "overlap": overlap}

    def result(self):
        return list(self.messages)

    def prepend_disjoint(self, visible_messages):
        """Keep collecting after a verified overlap cannot be recovered.

        The caller must keep scopeComplete false because continuity is no longer
        proven. Exact keys already present are excluded to limit duplicates.
        """
        existing = set(self.keys)
        visible = list(visible_messages)
        keys = frame_keys(visible)
        older = [(message, key) for message, key in zip(visible, keys) if key not in existing]
        self.messages = [message for message, _ in older] + self.messages
        self.keys = [key for _, key in older] + self.keys
        return len(older)
