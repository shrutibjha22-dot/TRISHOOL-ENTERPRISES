"""
Static check: every db.query / db.execute call must pass exactly the named
placeholders its SQL uses.

A missing or misspelled key does not throw at import time - mysql2 only
complains at runtime, when the request happens to hit that code path. This
catches the whole class of mistake before the server ever starts.
"""
import io, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "server"

# db.query(`sql`, { a, b })  /  db.execute('sql', { a })
CALL = re.compile(r"db\.(?:query|execute)\(", re.M)

def collect_placeholders(sql):
    # :name but not :: (cast) and not inside a longer identifier
    return set(re.findall(r"(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)", sql))

def find_object_keys(text, start):
    """Walk forward from the opening brace of a params object and list top-level keys."""
    i = text.find("{", start)
    if i < 0:
        return None
    depth, keys, j = 0, [], i
    while j < len(text):
        ch = text[j]
        if ch == "{":
            depth += 1
            j += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                break
            j += 1
        elif ch in "\"'`":
            quote = ch
            j += 1
            while j < len(text) and text[j] != quote:
                if text[j] == "\\":
                    j += 1
                j += 1
            j += 1
        else:
            # Either `key:` or ES6 shorthand `{ key }` / `{ key, key2 }`
            m = re.match(r"\s*([A-Za-z_$][\w$]*)\s*(?::|(?=[,}]))", text[j:])
            if m and depth == 1:
                keys.append(m.group(1))
                j += m.end()
            else:
                j += 1
    return keys


def main():
    problems = 0
    checked = 0

    for path in sorted(ROOT.rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        for m in CALL.finditer(text):
            checked += 1
            # SQL literal is the first string after the call
            tail = text[m.end(): m.end() + 3000]
            sm = re.match(r"\s*(`|'|\")", tail)
            if not sm:
                continue
            quote = sm.group(1)
            open_at = sm.end() - 1          # index of the opening quote itself
            close_at = tail.find(quote, open_at + 1)
            if close_at < 0:
                continue
            sql = tail[open_at + 1: close_at]

            placeholders = collect_placeholders(sql)
            if not placeholders:
                continue

            keys = set(find_object_keys(tail, close_at) or [])
            missing = placeholders - keys
            extra = keys - placeholders

            line = text[: m.start()].count("\n") + 1
            rel = path.relative_to(ROOT.parent)
            if missing:
                problems += 1
                print(f"  MISSING  {rel}:{line}")
                print(f"           SQL wants {sorted(placeholders)}")
                print(f"           object has {sorted(keys)}")
                print(f"           not supplied: {sorted(missing)}")
            elif extra:
                print(f"  note     {rel}:{line}  unused keys {sorted(extra)}")

    print(f"\n  checked {checked} db calls")
    if problems:
        print(f"  {problems} call(s) with missing parameters")
        return 1
    print("  all parameter names match their SQL")
    return 0


if __name__ == "__main__":
    sys.exit(main())
