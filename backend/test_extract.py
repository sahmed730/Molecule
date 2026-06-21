import traceback
from engine.ai_generator import extract_graph_json
try:
    print(extract_graph_json('Module 1: Does things'))
except Exception as e:
    traceback.print_exc()
