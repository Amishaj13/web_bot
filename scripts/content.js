// Create floating button 
function createFloatingButton() {
  const button = document.createElement('div');
  button.id = 'insomniacs-ai-button';
  
  // SVG logo instead of emoji for more professional look
  button.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="white"/>
    </svg>
  `;
  button.title = 'Insomniacs AI Assistant';
  
  button.addEventListener('click', () => {
    displayChatbot();
  });

  document.body.appendChild(button);
}

// Display the chatbot with Insomniacs branding
function displayChatbot() {
  // Remove button when chat is shown
  const floatingButton = document.getElementById('insomniacs-ai-button');
  if (floatingButton) {
    document.body.removeChild(floatingButton);
  }

  let chatbot = document.getElementById('insomniacs-ai-chatbot');
  if (chatbot) {
    document.body.removeChild(chatbot);
  }

  // Set theme based on user preference
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Create chatbot HTML structure
  chatbot = document.createElement('div');
  chatbot.id = 'insomniacs-ai-chatbot';
  chatbot.classList.add(prefersDarkMode ? 'insomniacs-dark-mode' : 'insomniacs-light-mode');

  chatbot.innerHTML = `
    <div id="insomniacs-ai-header">
      <div>AI Assistant</div>
      <div id="insomniacs-ai-actions">
        <div class="header-action" id="close-chatbot" title="Close">✕</div>
      </div>
    </div>
    <div id="insomniacs-ai-messages">
      <div class="assistant-message">Loading content from the current webpage...</div>
    </div>
    <div id="insomniacs-ai-input-area">
      <input type="text" id="insomniacs-ai-input" placeholder="Ask a question...">
      <div id="insomniacs-ai-send">➤</div>
    </div>
  `;

  document.body.appendChild(chatbot);

  // Send the current URL to the backend
  const currentUrl = window.location.href;
  chrome.runtime.sendMessage(
    {
      action: "scrapeWebsite",
      currentUrl: currentUrl,
    },
    (response) => {
      const messagesContainer = chatbot.querySelector('#insomniacs-ai-messages');
      messagesContainer.innerHTML = ''; // Clear the loading message

      if (response && response.success) {
        const successMessage = document.createElement('div');
        successMessage.className = 'assistant-message';
        successMessage.textContent = "Website content loaded. You can now ask questions.";
        messagesContainer.appendChild(successMessage);
      } else {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'assistant-message';
        errorMessage.textContent = `Failed to load website content: ${response.error}`;
        messagesContainer.appendChild(errorMessage);
      }
    }
  );

  setupEventListeners(chatbot);
}

function setupEventListeners(chatbot) {
  // Theme toggle
  chatbot.querySelector('#theme-toggle').addEventListener('click', () => {
    chatbot.classList.toggle('insomniacs-dark-mode');
    chatbot.classList.toggle('insomniacs-light-mode');
  });
  
  // Minimize toggle
  chatbot.querySelector('#minimize-toggle').addEventListener('click', () => {
    chatbot.classList.toggle('minimized');
    
    // Change icon when minimized/maximized
    const minimizeBtn = chatbot.querySelector('#minimize-toggle');
    if (chatbot.classList.contains('minimized')) {
      minimizeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="white"/>
        </svg>
      `;
      minimizeBtn.title = 'Maximize';
    } else {
      minimizeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 13H5V11H19V13Z" fill="white"/>
        </svg>
      `;
      minimizeBtn.title = 'Minimize';
    }
  });
  
  // Close button
  chatbot.querySelector('#close-chatbot').addEventListener('click', () => {
    document.body.removeChild(chatbot);
    createFloatingButton(); // Restore the floating button
  });
  
  // Send button click
  chatbot.querySelector('#insomniacs-ai-send').addEventListener('click', () => {
    sendMessage(chatbot);
  });
  
  // Enter key in input field
  chatbot.querySelector('#insomniacs-ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage(chatbot);
    }
  });
  
  // Quick action buttons
  chatbot.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      chatbot.querySelector('#insomniacs-ai-input').value = btn.textContent;
      sendMessage(chatbot);
    });
  });
  
  // Focus on input
  chatbot.querySelector('#insomniacs-ai-input').focus();
}

function sendMessage(chatbot) {
  const input = chatbot.querySelector('#insomniacs-ai-input');
  const question = input.value.trim();
  const currentUrl = window.location.href;
  if (!question) return;

  const messagesContainer = chatbot.querySelector('#insomniacs-ai-messages');

  // Add user message
  const userMessage = document.createElement('div');
  userMessage.className = 'user-message';
  userMessage.innerHTML = `
    <div class="message-content">${question}</div>
  `;
  messagesContainer.appendChild(userMessage);

  // Clear input
  input.value = '';

  // Show typing indicator
  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'typing-indicator';
  typingIndicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  messagesContainer.appendChild(typingIndicator);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Send question to background.js
  chrome.runtime.sendMessage(
    {
      action: "askQuestion",
      question: question,
      currentUrl : currentUrl
    },
    (response) => {
      // Remove typing indicator
      messagesContainer.removeChild(typingIndicator);

      // Add AI response
      const aiMessage = document.createElement('div');
      aiMessage.className = 'assistant-message';

      if (response && response.success) {
        aiMessage.innerHTML = `
          <div class="message-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="currentColor"/>
            </svg>
          </div>
          <div class="message-content">${response.answer}</div>
        `;
      } else {
        aiMessage.innerHTML = `
          <div class="message-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="currentColor"/>
            </svg>
          </div>
          <div class="message-content">Sorry, I couldn't process your question. ${response ? response.error : 'An error occurred.'}</div>
        `;
      }

      messagesContainer.appendChild(aiMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  );
}

function isWebsiteAccessible() {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

function initializeExtension() {
  if (isWebsiteAccessible()) {
    createFloatingButton();
  }
}