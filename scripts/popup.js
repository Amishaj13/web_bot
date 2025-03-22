// Base URL for the backend server
const BACKEND_URL = 'http://localhost:5000';

// DOM elements
const questionInput = document.getElementById('question');
const submitQuestionButton = document.getElementById('submit-question');
const chatHistory = document.getElementById('chat-history');
const chatSection = document.getElementById('chat-section');
const documentTitle = document.getElementById('document-title');

// Store document info
let currentDocUrl = null;

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Get the current doc URL and title from storage if available
  if (chrome && chrome.storage) {
    chrome.storage.local.get(['currentDocUrl', 'documentTitle'], function(result) {
      if (result.currentDocUrl) {
        currentDocUrl = result.currentDocUrl;
        documentTitle.textContent = result.documentTitle || 'Document';
        
        // Show chat interface
        chatSection.style.display = 'block';
        
        // Add initial AI message
        addMessageToChat('AI', 'Document processed successfully. What would you like to know about it?');
      }
    });
  }
  
  submitQuestionButton.addEventListener('click', () => askQuestion());
  
  // Allow pressing Enter to submit
  questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
  });
});

// Ask a question about the document
async function askQuestion() {
  const question = questionInput.value.trim();
  
  if (!question) return;
  
  // Add user question to chat
  addMessageToChat('User', question);
  questionInput.value = '';
  
  try {
    // Add loading message
    const loadingMsgElement = addMessageToChat('AI', 'Thinking...');
    
    const requestBody = {
      question: question,
      document_url: currentDocUrl
    };
    
    const response = await fetch(`${BACKEND_URL}/ask-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Replace loading message with actual response
    if (data.success && data.answer) {
      loadingMsgElement.textContent = data.answer;
    } else {
      loadingMsgElement.textContent = 'Sorry, I couldn\'t find an answer';
    }
  } catch (error) {
    console.error('Error asking question:', error);
    addMessageToChat('AI', `Error: ${error.message}`);
  }
}

// Helper function to add messages to the chat history
function addMessageToChat(sender, message) {
  const messageElement = document.createElement('div');
  messageElement.className = sender === 'User' ? 'user-message' : 'ai-message';
  messageElement.textContent = message;
  
  chatHistory.appendChild(messageElement);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  return messageElement;
}