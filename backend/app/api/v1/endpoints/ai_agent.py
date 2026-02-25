from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Any, List, Dict, Optional
from app.core.security import get_current_user
from app.services.ai_service import ask_database

router = APIRouter()

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)
    # Use Field(default_factory=list) to avoid mutable default argument bug
    history: List[Dict[str, str]] = Field(default_factory=list)

class QueryResponse(BaseModel):
    answer: str

@router.post("/query", response_model=QueryResponse)
def query_ai_agent(
    request: QueryRequest,
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Takes a natural language question from an authenticated admin user,
    converts it to SQL using Vertex AI (Gemini), executes it on the database,
    and returns a natural language response.
    """
    
    # Basic role-based access control
    allowed_roles = ["TTHumano", "admin", "financiero", "talento"]
    
    # Try singular 'role' (used in local Mock and some DB paths) or plural 'roles' list
    user_role = current_user.get("role")
    user_roles = current_user.get("roles", [])
    
    # Consolidate roles to check
    all_roles = set(user_roles)
    if user_role:
        all_roles.add(user_role)
    
    if not any(role in all_roles for role in allowed_roles):
         raise HTTPException(
             status_code=status.HTTP_403_FORBIDDEN,
             detail="El usuario no tiene permisos para usar el Agente de IA."
         )

    if not request.question or len(request.question.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La pregunta está vacía o es muy corta."
        )

    # Cap history to max 10 items server-side as a safety measure
    safe_history = request.history[-10:] if request.history else []

    try:
        # Call the LangChain service with history support
        answer = ask_database(request.question, safe_history)
        return QueryResponse(answer=answer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar la pregunta con IA: {str(e)}"
        )
