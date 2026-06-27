import glob
import re

files = glob.glob('servo-ui/src/**/*.tsx', recursive=True)
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # We replace 'http://127.0.0.1:8000/api/...' with `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/...`
    # Note that we must also change the surrounding quotes from single quotes to backticks.
    # Pattern to match: 'http://127.0.0.1:8000/api/(something)'
    new_content = re.sub(
        r"'http://127\.0\.0\.1:8000/api/([^']+)'",
        r"`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/\1`",
        content
    )
    
    if new_content != content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
        print(f"Updated {f}")

