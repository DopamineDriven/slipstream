```py
# python/scripts/ensure_sync.py
from typing import List, Dict
import tomlkit
import subprocess
import sys

def load_dependencies(pyproject_path: str) -> List[str]:
    text = open(pyproject_path, "r").read()
    doc = tomlkit.parse(text)

    try:
        project = doc["project"]
        deps = project["dependencies"]
    except KeyError as e:
        raise ValueError(f"Missing key in pyproject.toml: {e}")

    if not isinstance(deps, list):
        raise ValueError(f"Expected a list for 'dependencies', got {type(deps)}")

    return [str(item) for item in deps]


def load_lock_packages(lock_path: str) -> Dict[str, str]:
    text = open(lock_path, "r").read()
    lock_doc = tomlkit.parse(text)

    try:
        pkgs = lock_doc["package"]
    except KeyError:
        raise ValueError("Missing 'package' in pdm.lock")

    if not isinstance(pkgs, list):
        raise ValueError(f"Expected a list for lockfile packages, got {type(pkgs)}")

    result: Dict[str, str] = {}
    for entry in pkgs:
        if not isinstance(entry, dict):
            raise ValueError(f"Lock entry not a table: {entry!r}")
        name = entry.get("name")
        version = entry.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            raise ValueError(f"Invalid lock entry: {entry!r}")
        result[name] = version

    return result


def main():
    try:
        deps = load_dependencies("pyproject.toml")
        lock_pkgs = load_lock_packages("pdm.lock")
    except Exception as e:
        print(f"Error reading TOML: {e}", file=sys.stderr)
        sys.exit(1)

    missing = [d.split()[0] for d in deps if d.split()[0] not in lock_pkgs]
    if missing:
        print(f"Lockfile missing {missing}, regenerating…")
        subprocess.run(["pdm", "lock"], check=True)

    subprocess.run(["pdm", "sync", "--prod"], check=True)


if __name__ == "__main__":
    main()

```