import re

f = 'servo-ui/src/App.tsx'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

# Fix the broken urls
content = content.replace("fetch('${import.meta.env.VITE_API_URL || '}/api/classify-system'", "fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/classify-system`")
content = content.replace("fetch('${import.meta.env.VITE_API_URL || '}/api/clarify-architecture'", "fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/clarify-architecture`")
content = content.replace("fetch('${import.meta.env.VITE_API_URL || '}/api/suggest-architecture-stream'", "fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/suggest-architecture-stream`")
content = content.replace("fetch('${import.meta.env.VITE_API_URL || '}/api/extract-graph-json'", "fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/extract-graph-json`")

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)
