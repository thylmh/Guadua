import { auth } from './auth.js';

let chatHistory = [];

export function renderChatbotWidget() {
    // Only render for admins or TTHumano
    const isAdmin = auth._user?.role && (auth._user.role === 'admin' || auth._user.role === 'TTHumano');

    if (!isAdmin) return;

    // Create widget container if it doesn't exist
    if (document.getElementById('chatbot-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'chatbot-widget';

    widget.innerHTML = `
        <button id="chatbot-toggle" title="Asistente IA">
            ✨
        </button>
        <div id="chatbot-panel">
            <div class="chatbot-header">
                <h3><span>✨</span> Guadua AI Copilot</h3>
                <button class="chatbot-close" id="chatbot-close-btn">✕</button>
            </div>
            <div class="chatbot-messages" id="chatbot-messages">
                <div class="chat-bubble ai">
                    Hola ${auth._user ? auth._user.given_name : ''}! Soy el Asistente de IA de Guadua. Puedo ayudarte consultando la base de datos. ¿Qué necesitas saber hoy?
                    <div class="chatbot-suggestions">
                        <span class="suggestion-chip">¿Cuántos empleados hay en total?</span>
                        <span class="suggestion-chip">Ver lista de proyectos</span>
                        <span class="suggestion-chip">¿Quiénes vencen contrato este mes?</span>
                    </div>
                </div>
            </div>
            <div class="chatbot-warning">
                ⚠️ El asistente está aprendiendo y puede dar datos inexactos. Verifique información crítica.
            </div>
            <div class="chatbot-input-area">
                <input type="text" id="chatbot-input" class="chatbot-input" placeholder="Pregúntale a tus datos en lenguaje natural..." autocomplete="off">
                <button id="chatbot-send" class="chatbot-send">
                    ➤
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(widget);

    // Attach event listeners
    const toggleBtn = document.getElementById('chatbot-toggle');
    const closeBtn = document.getElementById('chatbot-close-btn');
    const panel = document.getElementById('chatbot-panel');
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');

    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('active');
        if (panel.classList.contains('active')) {
            input.focus();
            // Stop pulsing once user opens the chat (no longer needs attention)
            toggleBtn.style.animation = 'none';
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('active');
    });

    sendBtn.addEventListener('click', handleSendQuery);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendQuery();
    });

    // Handle suggestion chips — fill input, hide chips so they don't repeat
    panel.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion-chip')) {
            input.value = e.target.textContent.trim();
            // Remove suggestion area so it doesn't re-appear
            const suggestionsEl = panel.querySelector('.chatbot-suggestions');
            if (suggestionsEl) suggestionsEl.remove();
            handleSendQuery();
        }
    });
}

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatbot-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    // Use innerText for user messages (XSS-safe), allow basic line breaks for AI
    if (sender === 'user') {
        bubble.textContent = text;
    } else {
        // Render newlines as <br> for AI responses — strip unsafe tags first
        const safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        bubble.innerHTML = safe;
    }
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatbot-messages');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ai typing-indicator-container';
    bubble.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return bubble;
}

async function handleSendQuery() {
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');
    const text = input.value.trim();

    if (!text || text.length < 3) return;  // Guard: match backend validation

    // 1. Add user message
    addMessage(text, 'user');
    input.value = '';

    // 2. Disable input and show loading
    input.disabled = true;
    sendBtn.disabled = true;
    const typingIndicator = addTypingIndicator();

    try {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://localhost:8000/api/v1' : 'https://bosque-api-516412770014.southamerica-east1.run.app/api/v1';

        const response = await fetch(`${baseUrl}/ai/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth._token}`
            },
            body: JSON.stringify({
                question: text,
                history: chatHistory
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error en el servidor');
        }

        const data = await response.json();

        // Remove typing indicator and add AI response
        typingIndicator.remove();
        addMessage(data.answer, 'ai');

        // Update History (Limit to 10 entries = 5 pairs)
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: data.answer });
        if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    } catch (error) {
        console.error('AI Query Error:', error);
        typingIndicator.remove();
        addMessage(`❌ Lo siento, ocurrió un error: ${error.message}`, 'ai');
    } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }
}
