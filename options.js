// options.js - Logic for the extension options page

const apiKeyInput = document.getElementById("apiKey");
const saveButton = document.getElementById("save");
const statusDiv = document.getElementById("status");

// Load the saved API key when the options page opens
function loadApiKey() {
    chrome.storage.sync.get(["ghlApiKey"], (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error loading API key:", chrome.runtime.lastError);
            statusDiv.textContent = "Error loading API key.";
            statusDiv.style.color = "red";
        } else if (result.ghlApiKey) {
            apiKeyInput.value = result.ghlApiKey;
            statusDiv.textContent = "API Key loaded.";
            statusDiv.style.color = "green";
        } else {
            statusDiv.textContent = "API Key not set.";
            statusDiv.style.color = "orange";
        }
    });
}

// Save the API key
function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        statusDiv.textContent = "API Key cannot be empty.";
        statusDiv.style.color = "red";
        return;
    }

    chrome.storage.sync.set({ "ghlApiKey": apiKey }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving API key:", chrome.runtime.lastError);
            statusDiv.textContent = `Error saving API key: ${chrome.runtime.lastError.message}`;
            statusDiv.style.color = "red";
        } else {
            console.log("API Key saved successfully.");
            statusDiv.textContent = "API Key saved successfully!";
            statusDiv.style.color = "green";
        }
        // Clear status after a few seconds
        setTimeout(() => { statusDiv.textContent = ""; }, 3000);
    });
}

// Add event listener to the save button
saveButton.addEventListener("click", saveApiKey);

// Load the key when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", loadApiKey);

