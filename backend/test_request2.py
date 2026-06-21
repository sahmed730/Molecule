import requests
r = requests.post('http://127.0.0.1:8000/api/suggest-architecture', json={'prompt': 'test'})
print(r.status_code)
print(r.text)
