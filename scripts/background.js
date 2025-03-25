// background.js - Handles events and communication
let tenantCounter = 1;
let currentTenantId = null; // Global variable to store the current tenant ID

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scrapeWebsite") {
    scrapeWebsiteContent(message.currentUrl, sendResponse);
    return true; // Indicate you wish to send a response asynchronously
  }
  if (message.action === "askQuestion") {
    askQuestionAndRespond(message.question, message.currentUrl, sendResponse);
    return true; // Indicate you wish to send a response asynchronously
  }
});

async function askQuestionAndRespond(question, website, sendResponse) {
  if (!question) {
    sendResponse({ success: false, error: 'Missing question' });
    return;
  }

  if (!currentTenantId) {
    sendResponse({ success: false, error: 'tenantId is not defined. Please scrape a website first.' });
    return;
  }

  try {
    console.log('Asking question:', question);

    // Call the backend server to ask a question
    const response = await fetch('http://localhost:5000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: question, tenant_id: currentTenantId }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.response) {
      console.log('Question answered successfully:', data.response);
      sendResponse({ success: true, answer: data.response });
    } else {
      console.error('Failed to answer question:', data.error);
      sendResponse({ success: false, error: 'No response from server' });
    }
  } catch (error) {
    console.error('Error answering question:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function scrapeWebsiteContent(url, sendResponse) {
  const tenantId = "tenant_" + tenantCounter;
  tenantCounter++; // Increment for the next click
  currentTenantId = tenantId; // Store the tenant ID globally
  console.log('Scraping website content:', url, tenantId);

  try {
    const response = await fetch('http://localhost:5000/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ website_url: url, tenant_id: tenantId }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
   
    if (data.status === 'success') {
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: data.error });
    }
  } catch (error) {
    console.error('Error scraping website content:', error);
    sendResponse({ success: false, error: error.message });
  }
}

