import traceback
import json
from engine.ai_generator import extract_graph_json

big_md = "Module 1\n" * 500

try:
    res = extract_graph_json(big_md)
    print("SUCCESS")
except Exception as e:
    print("FAILED WITH EXCEPTION:")
    traceback.print_exc()
