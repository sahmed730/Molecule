import asyncio
import os
import sys
import json
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine.ai_generator import extract_graph_json

md = \"\"\"triggers a refund job if order already cancelled). Testing Requirements: Integration tests for the checkout saga (happy path, inventory fail, payment fail, timeout); Unit tests for state machine transitions.
M004: Inventory Service
Core Task: Tracks real-time stock levels and manages reservations. The single source of truth for product availability, preventing overselling under high concurrency. Data Shape (Input): { orderId: UUID, reservations: [{ productId: UUID, quantity: number }] } Expected Output: { reservationId: UUID, status: "reserved" | "failed",\"\"\"

try:
    res = extract_graph_json(md)
    print("SUCCESS")
    print(json.dumps(res, indent=2))
except Exception as e:
    print("FAILED WITH EXCEPTION:")
    traceback.print_exc()
