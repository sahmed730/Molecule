import requests

try:
    res = requests.post("http://127.0.0.1:8000/api/extract-graph-json", json={"markdown_text": "M004: Inventory Service\nCore Task: Tracks real-time stock levels"})
    print("STATUS:", res.status_code)
    print("BODY:", res.text)
except Exception as e:
    print("ERROR:", str(e))
