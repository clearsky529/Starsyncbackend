<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StarSync Chat - User 2 (test)</title>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        
        .chat-container {
            width: 100%;
            max-width: 800px;
            height: 90vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            padding: 20px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ff4444;
        }
        
        .status-dot.connected {
            background: #44ff44;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column-reverse;
            background: #fafafa;
        }
        
        .loading-indicator {
            text-align: center;
            padding: 15px;
            color: #666;
            font-size: 14px;
        }
        
        .loading-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #f093fb;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .message {
            margin-bottom: 16px;
            display: flex;
            flex-direction: column;
            animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .message.own {
            align-items: flex-end;
        }
        
        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
            font-size: 12px;
            color: #666;
        }
        
        .message.own .message-header {
            flex-direction: row-reverse;
        }
        
        .sender-name {
            font-weight: 600;
            color: #f093fb;
        }
        
        .message-time {
            font-size: 11px;
        }
        
        .message-bubble {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .message:not(.own) .message-bubble {
            background: white;
            color: #333;
            border-bottom-left-radius: 4px;
        }
        
        .message.own .message-bubble {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            border-bottom-right-radius: 4px;
        }
        
        .chat-input-container {
            padding: 20px;
            background: white;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 12px;
        }
        
        .chat-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 24px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.3s;
        }
        
        .chat-input:focus {
            border-color: #f093fb;
        }
        
        .send-button {
            padding: 12px 24px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            border: none;
            border-radius: 24px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .send-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(240, 147, 251, 0.4);
        }
        
        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .error-message {
            padding: 12px;
            background: #ffe0e0;
            color: #c00;
            text-align: center;
            font-size: 14px;
        }
        
        .no-messages {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        
        .messages-container::-webkit-scrollbar {
            width: 6px;
        }
        
        .messages-container::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        
        .messages-container::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <div>
                <h2>💬 Chat with Sage User</h2>
                <div class="status-indicator">
                    <div class="status-dot" id="statusDot"></div>
                    <span id="statusText">Connecting...</span>
                </div>
            </div>
            <div class="user-badge">👤 User 2: test</div>
        </div>
        
        <div id="errorContainer"></div>
        
        <div class="messages-container" id="messagesContainer">
            <div class="loading-indicator" id="loadingIndicator" style="display: none;">
                <div class="loading-spinner"></div>
                <div>Loading messages...</div>
            </div>
        </div>
        
        <div class="chat-input-container">
            <input 
                type="text" 
                class="chat-input" 
                id="messageInput" 
                placeholder="Type a message..." 
                autocomplete="off"
            />
            <button class="send-button" id="sendButton">Send</button>
        </div>
    </div>

    <script>
        // Configuration
        const API_URL = 'http://localhost:3500';
        const SOCKET_URL = 'http://localhost:3500/chat';
        
        // User 2 credentials
        const MY_USERNAME = 'testuser';
        const MY_PASSWORD = 'superman1218';
        const MY_USER_ID = 'b71cc435-a10e-11ef-bff7-e4a8dfaa99f7';
        const FRIEND_USER_ID = 'd87905d0-8bb9-45ec-8211-28f8ab7b3535';
        
        // State
        let socket = null;
        let authToken = null;
        let currentRoom = null;
        let currentPage = 1;
        let isLoading = false;
        let hasMoreMessages = true;
        let allMessages = [];
        let isScrolledToBottom = true;
        
        // DOM Elements
        const messagesContainer = document.getElementById('messagesContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorContainer = document.getElementById('errorContainer');
        
        // Initialize
        init();
        
        async function init() {
            try {
                console.log('🚀 Initializing chat for User 2 (test)...');
                
                await login();
                connectSocket();
                setupEventListeners();
                await loadMessages(1);
                
                console.log('✅ Chat initialized successfully');
                
            } catch (error) {
                showError('Failed to initialize: ' + error.message);
                console.error('❌ Initialization error:', error);
            }
        }
        
        async function login() {
            try {
                console.log('🔐 Logging in as test...');
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: MY_USERNAME,
                        password: MY_PASSWORD
                    })
                });
                
                if (!response.ok) throw new Error('Login failed');
                
                const data = await response.json();
                authToken = data.token;
                console.log('✅ Logged in successfully as', data.userName);
            } catch (error) {
                throw new Error('Authentication failed: ' + error.message);
            }
        }
        
        function connectSocket() {
            console.log('🔌 Connecting to WebSocket...');
            socket = io(SOCKET_URL, { transports: ['websocket'] });
            
            socket.on('connect', () => {
                console.log('✅ Socket connected:', socket.id);
                updateStatus(true);
                joinRoom();
            });
            
            socket.on('disconnect', () => {
                console.log('❌ Socket disconnected');
                updateStatus(false);
            });
            
            socket.on('newMessage', (data) => {
                console.log('📨 New message received:', data);
                handleNewMessage(data);
            });
        }
        
        function joinRoom() {
            socket.emit('joinRoomBetweenUsers', {
                userId1: MY_USER_ID,
                userId2: FRIEND_USER_ID
            }, (response) => {
                if (response && response.room) {
                    currentRoom = response.room;
                    console.log('✅ Joined room:', currentRoom);
                }
            });
        }
        
        function setupEventListeners() {
            sendButton.addEventListener('click', sendMessage);
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            messagesContainer.addEventListener('scroll', handleScroll);
        }
        
        function handleScroll() {
            const container = messagesContainer;
            isScrolledToBottom = container.scrollTop >= -50;
            
            if (container.scrollTop <= 100 && !isLoading && hasMoreMessages) {
                const oldScrollHeight = container.scrollHeight;
                loadMessages(currentPage + 1, oldScrollHeight);
            }
        }
        
        async function loadMessages(page, oldScrollHeight = null) {
            if (isLoading) return;
            
            isLoading = true;
            loadingIndicator.style.display = 'block';
            
            try {
                const url = `${API_URL}/chat/history/between/${MY_USER_ID}/${FRIEND_USER_ID}?page=${page}&limit=100`;
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                
                if (page === 1) {
                    // For page 1, messages come in DESC order (newest first)
                    // We need to reverse them to show oldest first, newest at bottom
                    console.log('🔍 Before reverse:', data.messages.map(m => ({time: m.created_at, msg: m.message})));
                    allMessages = data.messages.reverse();
                    console.log('🔍 After reverse:', allMessages.map(m => ({time: m.created_at, msg: m.message})));
                    renderMessages();
                    scrollToBottom();
                } else {
                    // For older pages, messages also come in DESC order
                    // We need to reverse them and prepend to existing messages
                    const olderMessages = data.messages.reverse();
                    allMessages = [...olderMessages, ...allMessages];
                    renderMessages();
                    if (oldScrollHeight) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight - oldScrollHeight;
                    }
                }
                
                currentPage = page;
                hasMoreMessages = data.hasMore;
                
                console.log(`📜 Loaded page ${page}: ${data.messages.length} messages`);
                
            } catch (error) {
                showError('Failed to load messages: ' + error.message);
            } finally {
                isLoading = false;
                loadingIndicator.style.display = 'none';
            }
        }
        
        function renderMessages() {
            const messages = messagesContainer.querySelectorAll('.message, .no-messages');
            messages.forEach(msg => msg.remove());
            
            if (allMessages.length === 0) {
                const noMsg = document.createElement('div');
                noMsg.className = 'no-messages';
                noMsg.textContent = '💬 No messages yet. Start the conversation!';
                messagesContainer.appendChild(noMsg);
                return;
            }
            
            // allMessages is now in correct order (oldest first, newest last)
            for (let i = 0; i < allMessages.length; i++) {
                const msg = allMessages[i];
                const messageEl = createMessageElement(msg);
                messagesContainer.appendChild(messageEl);
            }
        }
        
        function createMessageElement(msg) {
            const isOwn = msg.sender_id === MY_USER_ID;
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isOwn ? 'own' : ''}`;
            messageDiv.dataset.messageId = msg.id;
            
            const senderName = msg.sender ? msg.sender.username : 'Unknown';
            const time = formatTime(new Date(msg.created_at));
            
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="sender-name">${isOwn ? 'You' : senderName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-bubble">${escapeHtml(msg.message)}</div>
            `;
            
            return messageDiv;
        }
        
        function handleNewMessage(data) {
            if (allMessages.some(msg => msg.id === data.id)) return;
            
            // Add new message to the end (newest at bottom)
            allMessages.push(data);
            const messageEl = createMessageElement(data);
            messagesContainer.appendChild(messageEl);
            
            if (isScrolledToBottom) {
                scrollToBottom();
            }
        }
        
        async function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || !currentRoom) return;
            
            try {
                sendButton.disabled = true;
                messageInput.disabled = true;
                
                socket.emit('sendMessage', {
                    room: currentRoom,
                    senderId: MY_USER_ID,
                    message: message
                });
                
                messageInput.value = '';
                
            } catch (error) {
                showError('Failed to send: ' + error.message);
            } finally {
                sendButton.disabled = false;
                messageInput.disabled = false;
                messageInput.focus();
            }
        }
        
        function scrollToBottom() {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        function updateStatus(connected) {
            if (connected) {
                statusDot.classList.add('connected');
                statusText.textContent = 'Connected';
            } else {
                statusDot.classList.remove('connected');
                statusText.textContent = 'Disconnected';
            }
        }
        
        function showError(message) {
            errorContainer.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
            setTimeout(() => { errorContainer.innerHTML = ''; }, 5000);
        }
        
        function formatTime(date) {
            const now = new Date();
            const diff = now - date;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            
            if (hours < 24) {
                return date.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                });
            } else {
                return date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            }
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function clearMessages() {
            allMessages = [];
            renderMessages();
            console.log('🧹 Messages cleared - refresh the page and click Load History to test');
        }
        
        // Add this to window for easy access from console
        window.clearMessages = clearMessages;
        window.loadHistory = () => loadMessages(1);

        <!-- window.clearMessages = clearMessages;
        window.loadHistory = () => loadMessages(1); -->
    </script>
</body>
</html>

