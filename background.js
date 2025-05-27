// background.js - Service Worker for Gmail to GHL Extension

// Listen for messages from content scripts or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);

  if (request.action === "getApiKey") {
    chrome.storage.sync.get(["ghlApiKey"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error retrieving API key:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, apiKey: result.ghlApiKey });
      }
    });
    return true; // Indicates that the response is sent asynchronously
  }

  if (request.action === "fetchGHL") {
    handleFetchGHL(request.endpoint, request.options, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  if (request.action === "createOpportunity") {
    handleCreateOpportunity(request.data, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  // Default response if action is not handled
  // sendResponse({ success: false, error: "Unknown action" });
  // return false; // No async response
});

async function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["ghlApiKey"], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.ghlApiKey);
      }
    });
  });
}

async function handleFetchGHL(endpoint, options = {}, sendResponse) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ success: false, error: "API Key not set. Please configure it in the extension options." });
      return;
    }

    const GHL_BASE_URL = "https://rest.gohighlevel.com"; // Updated base URL for V1 API
    const url = `${GHL_BASE_URL}${endpoint}`;

    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
        // Removed 'Version' header as it's not specified in V1 docs
      },
      ...options // Spread any additional options like body
    };

    console.log("Fetching GHL API:", url, fetchOptions);
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let errorBody = 'Could not read error body';
      try {
          errorBody = await response.text();
      } catch (e) { /* ignore */ }
      console.error("GHL API Error:", response.status, response.statusText, errorBody);
      throw new Error(`GHL API request failed: ${response.status} ${response.statusText}. ${errorBody}`);
    }

    // For GET /v1/pipelines/, the response might be directly the array or nested.
    // Need to check the actual response structure later.
    const data = await response.json();
    console.log("GHL API Success Response:", data);
    sendResponse({ success: true, data: data });

  } catch (error) {
    console.error("Error fetching GHL data:", error);
    sendResponse({ success: false, error: error.message || "An unknown error occurred during API fetch." });
  }
}

async function handleCreateOpportunity(opportunityData, sendResponse) {
  // V1 endpoint: POST /v1/pipelines/:pipelineId/opportunities/
  // Ensure opportunityData includes pipelineId and other required fields for V1.
  // The content script needs to pass the selected pipelineId.
  if (!opportunityData.pipelineId) {
      sendResponse({ success: false, error: "Pipeline ID is missing in the request data." });
      return;
  }
  const endpoint = `/v1/pipelines/${opportunityData.pipelineId}/opportunities/`;
  const options = {
    method: 'POST',
    body: JSON.stringify(opportunityData) // Ensure opportunityData structure matches V1 requirements
  };
  // Reuse the generic fetch handler
  await handleFetchGHL(endpoint, options, sendResponse);
}

console.log("Background service worker started.");

// Optional: Add listeners for extension installation/update to guide users
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        // Open options page on first install to prompt for API key
        chrome.runtime.openOptionsPage();
    }
});

