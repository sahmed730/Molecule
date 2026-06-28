import sys
import os

# Add the project root (two directories up) to the sys.path so we can import the backend module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.main import app
