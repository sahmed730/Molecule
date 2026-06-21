import requests
print(requests.post('http://127.0.0.1:8000/api/suggest-architecture', json={'prompt': 'hello'}).json())
