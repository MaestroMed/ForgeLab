"""AI Assistant Chat API endpoints."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # 'user', 'assistant', 'system'
    content: str


class ChatRequest(BaseModel):
    message: str
    project_id: Optional[str] = None
    context: Optional[List[ChatMessage]] = None


class AssistantAction(BaseModel):
    type: str
    params: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    response: str
    action: Optional[AssistantAction] = None


# Intent patterns for action detection
INTENT_PATTERNS = {
    "search": ["trouve", "cherche", "où", "montre", "find", "search", "show"],
    "trim": ["coupe", "trim", "supprime", "silence", "jump cut"],
    "generate_title": ["titre", "title", "génère", "propose", "créé"],
    "add_music": ["musique", "music", "son", "audio", "ajoute"],
    "export": ["export", "exporte", "rend", "sauvegarde", "save"],
    "navigate": ["va", "ouvre", "affiche", "go to", "open"],
}


def detect_intent(message: str) -> Optional[str]:
    """Detect user intent from message."""
    lower = message.lower()
    
    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if pattern in lower:
                return intent
    
    return None


def extract_action(message: str, intent: str) -> Optional[AssistantAction]:
    """Extract action from message based on intent."""
    lower = message.lower()
    
    if intent == "search":
        # Extract search terms
        search_terms = []
        if "drôle" in lower or "funny" in lower:
            search_terms.append("humour")
        if "moment" in lower:
            search_terms.append("moment")
        if "réaction" in lower:
            search_terms.append("reaction")
        
        return AssistantAction(
            type="search",
            params={"terms": search_terms, "tags": ["humour"] if "drôle" in lower else []}
        )
    
    elif intent == "trim":
        return AssistantAction(
            type="trim",
            params={"enable_jump_cuts": True}
        )
    
    elif intent == "generate_title":
        count = 3  # Default
        if "5" in message:
            count = 5
        return AssistantAction(
            type="generate_title",
            params={"count": count}
        )
    
    elif intent == "export":
        return AssistantAction(
            type="export",
            params={}
        )
    
    return None


@router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(request: ChatRequest):
    """
    Chat with the AI assistant.
    
    The assistant can:
    - Answer questions about Forge Lab
    - Execute actions based on natural language
    - Generate content using LLM
    """
    try:
        from forge_engine.services.llm_local import LocalLLMService
        
        llm = LocalLLMService.get_instance()
        is_available = await llm.check_availability()
        
        # Detect intent
        intent = detect_intent(request.message)
        action = extract_action(request.message, intent) if intent else None
        
        if is_available:
            # Build context for LLM
            system_prompt = """Tu es l'assistant IA de Forge Lab, une application de création de clips viraux.
Tu aides les utilisateurs à:
- Trouver des moments intéressants dans leurs vidéos
- Générer des titres et descriptions viraux
- Configurer les effets (jump cuts, musique, sous-titres)
- Optimiser leurs clips pour TikTok/YouTube/Instagram

Réponds de manière concise et utile. Si l'utilisateur demande une action, confirme-la.
Utilise le tutoiement et un ton amical."""
            
            # Include context
            context_str = ""
            if request.context:
                for msg in request.context[-3:]:  # Last 3 messages
                    context_str += f"{msg.role}: {msg.content}\n"
            
            prompt = f"""Contexte de conversation:
{context_str}

Utilisateur: {request.message}

{f"Action détectée: {intent}" if intent else ""}

Réponds de manière utile et concise:"""
            
            response = await llm.generate(
                prompt=prompt,
                system=system_prompt,
                temperature=0.7,
                max_tokens=500
            )
            
            if response:
                return ChatResponse(
                    response=response,
                    action=action
                )
        
        # Fallback responses
        fallback = get_fallback_response(request.message, intent)
        return ChatResponse(
            response=fallback,
            action=action
        )
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return ChatResponse(
            response=f"Désolé, j'ai eu un problème: {str(e)[:100]}",
            action=None
        )


def get_fallback_response(message: str, intent: Optional[str]) -> str:
    """Generate fallback response when LLM is not available."""
    
    if intent == "search":
        return """Pour trouver des moments spécifiques:
1. Va dans l'onglet 'Segments'
2. Utilise les filtres de tags
3. Trie par score viral

Je peux faire ça automatiquement quand Ollama est lancé!"""
    
    if intent == "trim":
        return """Pour activer les jump cuts:
1. Va dans l'onglet 'Jump Cuts'
2. Active l'option
3. Choisis la sensibilité
4. Les silences seront coupés à l'export"""
    
    if intent == "generate_title":
        return """Voici des templates de titres viraux:
• "Vous n'allez pas croire ce qui se passe..."
• "Le moment où il réalise que..."
• "[RÉACTION] quand tu..."
• "Il a VRAIMENT fait ça?!"

Pour des titres personnalisés, lance Ollama!"""
    
    if intent == "export":
        return """Pour exporter ton clip:
1. Configure les options (sous-titres, intro, musique)
2. Clique sur le bouton 'Export'
3. Attends le rendu
4. Le fichier sera dans le dossier exports/"""
    
    return """Je suis l'assistant Forge Lab! 🎬

Je peux t'aider avec:
• Trouver des moments (cherche "drôle", "clutch", etc.)
• Générer des titres viraux
• Configurer les effets
• Exporter tes clips

Pour des réponses avancées, lance Ollama avec un modèle LLM!"""


@router.get("/status")
async def assistant_status():
    """Check assistant availability."""
    try:
        from forge_engine.services.llm_local import LocalLLMService
        
        llm = LocalLLMService.get_instance()
        is_available = await llm.check_availability()
        
        return {
            "available": is_available,
            "model": llm._current_model if is_available else None,
            "mode": "llm" if is_available else "fallback"
        }
    except Exception as e:
        return {
            "available": False,
            "model": None,
            "mode": "fallback",
            "error": str(e)
        }
