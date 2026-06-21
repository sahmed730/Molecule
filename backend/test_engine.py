import json

# Example Blueprint exported from the frontend Canvas
blueprint = {
    "nodes": [
        {
            "id": "servo_1",
            "label": "QR Scanner",
            "purpose": "Scan codes"
        },
        {
            "id": "servo_2",
            "label": "Duplicate Checker",
            "purpose": "Check duplicates"
        }
    ],
    "connections": [
        {
            "from": "servo_1",
            "to": "servo_2"
        }
    ]
}

print("Testing the Software Servo Engine locally (bypassing FastAPI network call for quick test)...")
from engine.runner import EngineRunner
from engine.schema import WorkflowBlueprint

bp = WorkflowBlueprint(**blueprint)
runner = EngineRunner(bp)
result = runner.execute()

print("\n--- Final Engine State ---")
print(json.dumps(result, indent=2))
