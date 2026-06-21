import urllib.request, json
req = urllib.request.Request('http://localhost:8000/api/review-architecture', data=b'{"graph_data": {"nodes": [], "edges": []}}', headers={'Content-Type': 'application/json'}, method='POST')
try:
    response = urllib.request.urlopen(req)
    print(response.read().decode())
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
