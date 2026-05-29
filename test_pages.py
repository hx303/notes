"""Test if GitHub Pages works for wld030303 account."""
import json, subprocess, sys

def gh_json(*args):
    r = subprocess.run(["gh", "api"] + list(args), capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print(f"  Error: {r.stderr[:200]}")
        return None
    return json.loads(r.stdout)

# Create test repo
import tempfile, os
with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
    json.dump({"name": "pages-test", "description": "Test Pages deployment", "auto_init": True, "private": False}, f)
    tmpfile = f.name

result = subprocess.run(
    ["gh", "api", "/user/repos", "--input", tmpfile],
    capture_output=True, text=True, encoding="utf-8"
)
os.unlink(tmpfile)

if result.returncode != 0:
    print(f"Create repo failed: {result.stderr[:200]}")
    # Maybe already exists
    pass
else:
    data = json.loads(result.stdout)
    print(f"Created: {data['html_url']}")

# Enable Pages on the test repo
pages_config_file = "pages_cfg.json"
with open(pages_config_file, "w", encoding="utf-8") as f:
    json.dump({"build_type": "legacy", "source": {"branch": "main", "path": "/"}}, f)

result = subprocess.run(
    ["gh", "api", "-X", "PUT", "/repos/wld030303/pages-test/pages", "--input", pages_config_file],
    capture_output=True, text=True, encoding="utf-8"
)
print(f"Pages config: {result.returncode} {result.stdout[:200]} {result.stderr[:200]}")
os.unlink(pages_config_file)

# Check if site URL works
print("\nTest URL: https://wld030303.github.io/pages-test/")
print("Does README show up?")
