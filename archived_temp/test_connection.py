import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Mock settings if needed
from app.services.ai_service import ask_database

def test():
    print("Testing AI Connection...")
    try:
        response = ask_database("¿Cuántos empleados hay en total?")
        print("Response:", response)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
