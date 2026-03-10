// === State ===
let state = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    booksContent: '',
    booksLoaded: false,
    booksLoadedCount: 0,
    booksTotalCount: 0,
    conversations: JSON.parse(localStorage.getItem('conversations') || '[]'),
    currentConversationId: localStorage.getItem('current_conversation_id') || null,
    isLoading: false,
    chatSession: null
};

// === DOM Elements ===
const elements = {
    // Screens
    loadingScreen: document.getElementById('loading-screen'),
    loadingStatus: document.getElementById('loading-status'),
    apiKeyScreen: document.getElementById('api-key-screen'),
    chatScreen: document.getElementById('chat-screen'),
    
    // API Key
    apiKeyInput: document.getElementById('api-key-input'),
    saveApiKeyBtn: document.getElementById('save-api-key-btn'),
    
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    conversationsList: document.getElementById('conversations-list'),
    settingsBtn: document.getElementById('settings-btn'),
    
    // Chat
    messagesContainer: document.getElementById('messages-container'),
    welcomeMessage: document.getElementById('welcome-message'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    
    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    settingsApiKeyInput: document.getElementById('settings-api-key-input'),
    updateApiKeyBtn: document.getElementById('update-api-key-btn'),
    booksStatus: document.getElementById('books-status'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    clearAllBtn: document.getElementById('clear-all-btn')
};

// === System Prompt ===
const SYSTEM_PROMPT_BASE = `אתה "ישיביש", חברותא חכם ובקי בתורה, גמרא, הלכה ומחשבה יהודית.

הנחיות חשובות:
1. דבר בעברית בסגנון ישיבתי אותנטי - השתמש בביטויים כמו "נו", "ממילא", "קשיא", "תירוץ", "סברא", "ראיה", "דוחק", "פשוט" וכדומה.
2. כשאתה מצטט מקורות, ציין את שם הספר ואת המיקום המדויק (דף, עמוד, סימן, סעיף וכו').
3. אם אינך בטוח בתשובה או שאין לך מידע, אמור זאת בכנות - "צריך לעיין בזה יותר" או "אין לי מידע מספיק על כך".
4. היה מדויק ושקול בתשובותיך - אל תמציא מקורות או מידע.
5. כשמתאים, הצע מקורות נוספים ללימוד והעמקה.
6. התייחס לשואל בכבוד ובחום, כמו חברותא אמיתי.

להלן ספרי הקודש שברשותך. השתמש בהם כמקור ידע עיקרי לתשובותיך:

`;

// === Initialize ===
async function init() {
    updateLoadingStatus('טוען רשימת ספרי קודש...');
    
    try {
        // נסה לטעון את manifest.json
        const manifestResponse = await fetch('manifest.json');
        
        if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            state.booksTotalCount = manifest.files.length;
            
            updateLoadingStatus(`נמצאו ${manifest.files.length} קבצים. טוען...`);
            
            // טען את כל הקבצים
            const allContent = [];
            
            for (let i = 0; i < manifest.files.length; i++) {
                const filePath = manifest.files[i];
                try {
                    const fileResponse = await fetch(filePath);
                    if (fileResponse.ok) {
                        const content = await fileResponse.text();
                        allContent.push(`\n\n=== ${filePath} ===\n\n${content}`);
                        state.booksLoadedCount = i + 1;
                        updateLoadingStatus(`טוען ספרי קודש... (${i + 1}/${manifest.files.length})`);
                    }
                } catch (fileError) {
                    console.warn(`לא ניתן לטעון קובץ: ${filePath}`, fileError);
                }
            }
            
            if (allContent.length > 0) {
                state.booksContent = allContent.join('');
                state.booksLoaded = true;
                updateLoadingStatus(`נטענו ${allContent.length} ספרי קודש בהצלחה!`);
            } else {
                throw new Error('לא נטענו קבצים');
            }
        } else {
            // אם אין manifest, נסה לטעון קובץ בודד (תאימות לאחור)
            updateLoadingStatus('מחפש קובץ ספרים בודד...');
            const response = await fetch('combined_output.txt');
            if (response.ok) {
                state.booksContent = await response.text();
                state.booksLoaded = true;
                state.booksLoadedCount = 1;
                state.booksTotalCount = 1;
                updateLoadingStatus('ספרי הקודש נטענו בהצלחה!');
            } else {
                throw new Error('לא נמצאו קבצים');
            }
        }
    } catch (error) {
        console.error('Error loading books:', error);
        state.booksLoaded = false;
        updateLoadingStatus('לא נמצאו ספרי קודש. הרץ את scan-books.js ליצירת manifest.json');
    }
    
    // Wait a moment for the user to see the status
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check if we have an API key
    if (state.apiKey) {
        showChatScreen();
    } else {
        showApiKeyScreen();
    }
    
    setupEventListeners();
}

function updateLoadingStatus(text) {
    elements.loadingStatus.textContent = text;
}

// === Screen Management ===
function showApiKeyScreen() {
    elements.loadingScreen.classList.add('hidden');
    elements.apiKeyScreen.classList.remove('hidden');
    elements.chatScreen.classList.add('hidden');
}

function showChatScreen() {
    elements.loadingScreen.classList.add('hidden');
    elements.apiKeyScreen.classList.add('hidden');
    elements.chatScreen.classList.remove('hidden');
    
    renderConversationsList();
    
    // Load current conversation or create new one
    if (state.currentConversationId) {
        loadConversation(state.currentConversationId);
    } else if (state.conversations.length > 0) {
        loadConversation(state.conversations[0].id);
    } else {
        createNewConversation();
    }
    
    updateBooksStatus();
}

// === Event Listeners ===
function setupEventListeners() {
    // API Key Screen
    elements.saveApiKeyBtn.addEventListener('click', saveApiKey);
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
    
    // Sidebar
    elements.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    elements.newChatBtn.addEventListener('click', createNewConversation);
    elements.settingsBtn.addEventListener('click', openSettings);
    
    // Chat
    elements.messageInput.addEventListener('input', handleInputChange);
    elements.messageInput.addEventListener('keydown', handleInputKeydown);
    elements.sendBtn.addEventListener('click', sendMessage);
    
    // Settings Modal
    elements.closeSettingsBtn.addEventListener('click', closeSettings);
    elements.settingsModal.querySelector('.modal-backdrop').addEventListener('click', closeSettings);
    elements.updateApiKeyBtn.addEventListener('click', updateApiKey);
    elements.clearHistoryBtn.addEventListener('click', clearHistory);
    elements.clearAllBtn.addEventListener('click', clearAll);
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            elements.sidebar.classList.contains('open') &&
            !elements.sidebar.contains(e.target) &&
            !elements.toggleSidebarBtn.contains(e.target)) {
            elements.sidebar.classList.remove('open');
        }
    });
}

// === API Key Functions ===
function saveApiKey() {
    const apiKey = elements.apiKeyInput.value.trim();
    if (!apiKey) {
        alert('נא להזין מפתח API');
        return;
    }
    
    state.apiKey = apiKey;
    localStorage.setItem('gemini_api_key', apiKey);
    showChatScreen();
}

function updateApiKey() {
    const apiKey = elements.settingsApiKeyInput.value.trim();
    if (!apiKey) {
        alert('נא להזין מפתח API');
        return;
    }
    
    state.apiKey = apiKey;
    localStorage.setItem('gemini_api_key', apiKey);
    elements.settingsApiKeyInput.value = '';
    
    // Reset chat session to use new key
    state.chatSession = null;
    
    alert('מפתח ה-API עודכן בהצלחה');
    closeSettings();
}

// === Sidebar Functions ===
function toggleSidebar() {
    elements.sidebar.classList.toggle('open');
}

function renderConversationsList() {
    elements.conversationsList.innerHTML = '';
    
    state.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `conversation-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
        item.innerHTML = `
            <span class="conversation-title">${escapeHtml(conv.title)}</span>
            <button class="conversation-delete" data-id="${conv.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
            </button>
        `;
        
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.conversation-delete')) {
                loadConversation(conv.id);
                if (window.innerWidth <= 768) {
                    elements.sidebar.classList.remove('open');
                }
            }
        });
        
        item.querySelector('.conversation-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });
        
        elements.conversationsList.appendChild(item);
    });
}

// === Conversation Functions ===
function createNewConversation() {
    const conversation = {
        id: Date.now().toString(),
        title: 'שיחה חדשה',
        messages: [],
        createdAt: new Date().toISOString()
    };
    
    state.conversations.unshift(conversation);
    state.currentConversationId = conversation.id;
    state.chatSession = null;
    
    saveConversations();
    renderConversationsList();
    renderMessages();
    
    if (window.innerWidth <= 768) {
        elements.sidebar.classList.remove('open');
    }
}

function loadConversation(id) {
    state.currentConversationId = id;
    state.chatSession = null;
    localStorage.setItem('current_conversation_id', id);
    
    renderConversationsList();
    renderMessages();
}

function deleteConversation(id) {
    if (!confirm('למחוק את השיחה?')) return;
    
    state.conversations = state.conversations.filter(c => c.id !== id);
    
    if (state.currentConversationId === id) {
        if (state.conversations.length > 0) {
            loadConversation(state.conversations[0].id);
        } else {
            createNewConversation();
        }
    }
    
    saveConversations();
    renderConversationsList();
}

function getCurrentConversation() {
    return state.conversations.find(c => c.id === state.currentConversationId);
}

function saveConversations() {
    localStorage.setItem('conversations', JSON.stringify(state.conversations));
}

// === Message Functions ===
function renderMessages() {
    const conversation = getCurrentConversation();
    
    if (!conversation || conversation.messages.length === 0) {
        elements.welcomeMessage.classList.remove('hidden');
        // Clear any previous messages except welcome
        const messages = elements.messagesContainer.querySelectorAll('.message');
        messages.forEach(m => m.remove());
        return;
    }
    
    elements.welcomeMessage.classList.add('hidden');
    
    // Clear and re-render
    const messages = elements.messagesContainer.querySelectorAll('.message');
    messages.forEach(m => m.remove());
    
    conversation.messages.forEach(msg => {
        appendMessage(msg.role, msg.content, false);
    });
    
    scrollToBottom();
}

function appendMessage(role, content, animate = true) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    
    const avatar = role === 'user' ? 'את' : 'יש';
    const roleName = role === 'user' ? 'אתה' : 'ישיביש';
    
    messageEl.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-role">${roleName}</div>
            <div class="message-text">${formatMessageText(content)}</div>
        </div>
    `;
    
    if (!animate) {
        messageEl.style.animation = 'none';
    }
    
    elements.messagesContainer.appendChild(messageEl);
    
    if (animate) {
        scrollToBottom();
    }
}

function formatMessageText(text) {
    // Basic formatting - escape HTML and convert newlines
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = `
        <div class="message-avatar">יש</div>
        <div class="message-content">
            <div class="message-role">ישיביש</div>
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    elements.messagesContainer.appendChild(indicator);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function scrollToBottom() {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// === Input Functions ===
function handleInputChange() {
    // Auto-resize textarea
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 150) + 'px';
    
    // Enable/disable send button
    elements.sendBtn.disabled = !elements.messageInput.value.trim() || state.isLoading;
}

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!elements.sendBtn.disabled) {
            sendMessage();
        }
    }
}

// === Send Message ===
async function sendMessage() {
    const userMessage = elements.messageInput.value.trim();
    if (!userMessage || state.isLoading) return;
    
    const conversation = getCurrentConversation();
    if (!conversation) return;
    
    // Hide welcome message
    elements.welcomeMessage.classList.add('hidden');
    
    // Add user message
    conversation.messages.push({ role: 'user', content: userMessage });
    appendMessage('user', userMessage);
    
    // Update title if first message
    if (conversation.messages.length === 1) {
        conversation.title = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
        renderConversationsList();
    }
    
    // Clear input
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.sendBtn.disabled = true;
    
    // Show typing indicator
    state.isLoading = true;
    showTypingIndicator();
    
    try {
        const response = await callGeminiAPI(conversation.messages);
        
        hideTypingIndicator();
        
        // Add assistant message
        conversation.messages.push({ role: 'assistant', content: response });
        appendMessage('assistant', response);
        
        saveConversations();
    } catch (error) {
        hideTypingIndicator();
        
        let errorMessage = 'אירעה שגיאה. נא לנסות שוב.';
        if (error.message.includes('API key')) {
            errorMessage = 'מפתח ה-API אינו תקין. נא לבדוק בהגדרות.';
        } else if (error.message.includes('quota')) {
            errorMessage = 'חרגת ממכסת השימוש ב-API. נא לבדוק את חשבון Google שלך.';
        }
        
        appendMessage('assistant', errorMessage);
        console.error('Gemini API Error:', error);
    }
    
    state.isLoading = false;
    handleInputChange();
}

// === Gemini API ===
async function callGeminiAPI(messages) {
    const systemPrompt = SYSTEM_PROMPT_BASE + (state.booksContent || 'לא נטענו ספרי קודש.');
    
    // Convert messages to Gemini format
    const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: contents,
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }
    
    const data = await response.json();
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
    }
    
    throw new Error('Invalid response from API');
}

// === Settings Functions ===
function openSettings() {
    elements.settingsModal.classList.remove('hidden');
    updateBooksStatus();
}

function closeSettings() {
    elements.settingsModal.classList.add('hidden');
}

function updateBooksStatus() {
    const indicator = elements.booksStatus.querySelector('.status-indicator');
    const text = elements.booksStatus.querySelector('.status-text');
    
    indicator.classList.remove('loaded', 'error');
    
    if (state.booksLoaded) {
        indicator.classList.add('loaded');
        const sizeKB = Math.round(state.booksContent.length / 1024);
        const sizeMB = (sizeKB / 1024).toFixed(1);
        text.textContent = `נטענו ${state.booksLoadedCount} קבצים (${sizeMB} MB)`;
    } else {
        indicator.classList.add('error');
        text.textContent = 'לא נמצאו ספרי קודש. הרץ node scan-books.js ליצירת manifest.json';
    }
}

function clearHistory() {
    if (!confirm('למחוק את כל השיחות?')) return;
    
    state.conversations = [];
    state.currentConversationId = null;
    state.chatSession = null;
    saveConversations();
    localStorage.removeItem('current_conversation_id');
    
    createNewConversation();
    closeSettings();
}

function clearAll() {
    if (!confirm('למחוק את כל הנתונים כולל מפתח ה-API?')) return;
    
    localStorage.clear();
    location.reload();
}

// === Utilities ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === Start App ===
document.addEventListener('DOMContentLoaded', init);
