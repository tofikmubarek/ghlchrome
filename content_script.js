// content_script.js - Injected into Gmail pages

console.log("GHL Gmail Extension: Content script loaded v3.");

let currentEmailData = null; // Store data of the currently viewed email
let allPipelinesData = []; // Store fetched pipelines and their stages

// --- Modal HTML Structure ---
function createModalHtml() {
    return `
    <div id="ghl-modal-overlay" class="ghl-modal-overlay ghl-hidden">
        <div class="ghl-modal-content">
            <h2>Create GHL Opportunity</h2>
            
            <div id="ghl-status-message" class="ghl-status-message"></div>

            <form id="ghl-opportunity-form">
                <label for="ghl-contact-name">Contact Name:</label>
                <input type="text" id="ghl-contact-name" name="contactName" required>

                <label for="ghl-contact-email">Contact Email:</label>
                <input type="email" id="ghl-contact-email" name="contactEmail" required>

                <label for="ghl-opportunity-name">Opportunity Name:</label>
                <input type="text" id="ghl-opportunity-name" name="opportunityName" required>

                <label for="ghl-pipeline">Pipeline:</label>
                <select id="ghl-pipeline" name="pipelineId" required>
                    <option value="">Loading Pipelines...</option>
                </select>

                <label for="ghl-stage">Stage:</label>
                <select id="ghl-stage" name="stageId" required> <!-- Updated name to stageId based on V1 POST body -->
                    <option value="">Select Pipeline First</option>
                </select>

                <label for="ghl-status">Status:</label>
                <select id="ghl-status" name="status" required>
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                    <option value="abandoned">Abandoned</option> 
                </select>

                <label for="ghl-value">Value ($):</label>
                <input type="number" id="ghl-value" name="monetaryValue" step="0.01">

                <!-- Hidden field for contact ID if found -->
                <input type="hidden" id="ghl-contact-id" name="contactId">

                <div class="ghl-modal-actions">
                    <button type="button" id="ghl-cancel-button" class="ghl-cancel-button">Cancel</button>
                    <button type="submit" id="ghl-submit-button" class="ghl-submit-button">Create Opportunity</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

// --- Inject Modal into the DOM ---
function injectModal() {
    if (!document.getElementById("ghl-modal-overlay")) {
        const modalHtml = createModalHtml();
        document.body.insertAdjacentHTML("beforeend", modalHtml);
        console.log("GHL Modal injected.");

        // Add event listeners
        document.getElementById("ghl-cancel-button").addEventListener("click", closeModal);
        document.getElementById("ghl-opportunity-form").addEventListener("submit", handleFormSubmit);
        document.getElementById("ghl-pipeline").addEventListener("change", handlePipelineChange);
        // Close modal if clicking outside the content area
        document.getElementById("ghl-modal-overlay").addEventListener("click", (event) => {
            if (event.target.id === "ghl-modal-overlay") {
                closeModal();
            }
        });
    }
}

injectModal(); // Inject modal as soon as script loads

// --- Modal Control Functions ---
function openModal() {
    const overlay = document.getElementById("ghl-modal-overlay");
    if (overlay) {
        resetForm();
        prefillForm();
        fetchPipelines(); // Start fetching pipelines when modal opens
        overlay.classList.remove("ghl-hidden");
        console.log("GHL Modal opened.");
    }
}

function closeModal() {
    const overlay = document.getElementById("ghl-modal-overlay");
    if (overlay) {
        overlay.classList.add("ghl-hidden");
        console.log("GHL Modal closed.");
    }
}

function showStatusMessage(message, isError = false) {
    const statusDiv = document.getElementById("ghl-status-message");
    statusDiv.textContent = message;
    statusDiv.className = `ghl-status-message ${isError ? 'error' : 'success'}`;
    statusDiv.style.display = 'block';
}

function hideStatusMessage() {
    const statusDiv = document.getElementById("ghl-status-message");
    statusDiv.style.display = 'none';
}

// --- Form Handling ---
function resetForm() {
    const form = document.getElementById("ghl-opportunity-form");
    form.reset();
    // Reset dropdowns to initial state
    document.getElementById("ghl-pipeline").innerHTML = '<option value="">Loading Pipelines...</option>';
    document.getElementById("ghl-stage").innerHTML = '<option value="">Select Pipeline First</option>';
    document.getElementById("ghl-stage").disabled = true;
    document.getElementById("ghl-contact-id").value = '';
    allPipelinesData = []; // Clear stored pipeline data
    hideStatusMessage();
}

function prefillForm() {
    // TODO: Extract actual data from Gmail DOM/InboxSDK
    // Placeholder data for now
    currentEmailData = {
        subject: "Sample Email Subject for Opportunity",
        senderName: "John Doe",
        senderEmail: "john.doe@example.com"
    };

    if (currentEmailData) {
        document.getElementById("ghl-opportunity-name").value = currentEmailData.subject || "";
        document.getElementById("ghl-contact-name").value = currentEmailData.senderName || "";
        document.getElementById("ghl-contact-email").value = currentEmailData.senderEmail || "";
        // TODO: Potentially search GHL for contact ID based on email
    }
}

function handleFormSubmit(event) {
    event.preventDefault();
    console.log("Form submitted.");
    showStatusMessage("Creating opportunity...", false);
    document.getElementById("ghl-submit-button").disabled = true;
    document.getElementById("ghl-cancel-button").disabled = true;

    const formData = new FormData(event.target);
    const opportunityData = {};
    formData.forEach((value, key) => {
        // Convert monetaryValue to number if present
        if (key === 'monetaryValue' && value) {
            opportunityData[key] = parseFloat(value);
        } else if (value) { // Only include fields with values
            opportunityData[key] = value;
        }
    });

    // Prepare data for V1 POST /v1/pipelines/:pipelineId/opportunities/
    // API expects 'name', 'stageId', 'status', 'contactId' (or email/phone), 'monetaryValue', etc.
    opportunityData.name = opportunityData.opportunityName; // API uses 'name' for opportunity title
    delete opportunityData.opportunityName;

    // Add contact details if contactId is not present
    if (!opportunityData.contactId) {
        opportunityData.email = opportunityData.contactEmail;
        // opportunityData.phone = ... // Add phone if available
        // opportunityData.firstName = ... // Add name parts if available
        opportunityData.source = "Gmail Extension"; // Example source
    }
    delete opportunityData.contactName; // Remove form fields not directly used in API
    delete opportunityData.contactEmail;

    console.log("Sending data to background:", opportunityData);

    // Send data to background script to make API call
    chrome.runtime.sendMessage({ action: "createOpportunity", data: opportunityData }, (response) => {
        document.getElementById("ghl-submit-button").disabled = false;
        document.getElementById("ghl-cancel-button").disabled = false;

        if (response && response.success) {
            console.log("Opportunity created successfully:", response.data);
            showStatusMessage("Opportunity created successfully!", false);
            setTimeout(closeModal, 2000); // Close modal after success
        } else {
            console.error("Failed to create opportunity:", response?.error);
            showStatusMessage(`Error: ${response?.error || 'Unknown error'}`, true);
        }
    });
}

// --- GHL Data Fetching ---
function fetchPipelines() {
    console.log("Requesting pipelines from background script...");
    // Use the correct V1 endpoint
    chrome.runtime.sendMessage({ action: "fetchGHL", endpoint: "/v1/pipelines/" }, (response) => {
        const pipelineSelect = document.getElementById("ghl-pipeline");
        if (response && response.success && response.data.pipelines) {
            allPipelinesData = response.data.pipelines; // Store all pipeline data
            pipelineSelect.innerHTML = '<option value="">-- Select Pipeline --</option>'; // Clear loading state
            allPipelinesData.forEach(pipeline => {
                const option = document.createElement("option");
                option.value = pipeline.id;
                option.textContent = pipeline.name;
                pipelineSelect.appendChild(option);
            });
            console.log("Pipelines loaded and stored.");
        } else {
            console.error("Failed to fetch pipelines:", response?.error);
            pipelineSelect.innerHTML = '<option value="">Error loading pipelines</option>';
            showStatusMessage(`Error loading pipelines: ${response?.error || 'Unknown error'}`, true);
            allPipelinesData = []; // Clear data on error
        }
    });
}

function handlePipelineChange() {
    const pipelineId = document.getElementById("ghl-pipeline").value;
    const stageSelect = document.getElementById("ghl-stage");
    stageSelect.innerHTML = '<option value="">-- Select Stage --</option>'; // Reset stages
    stageSelect.disabled = true;

    if (!pipelineId) {
        stageSelect.innerHTML = '<option value="">Select Pipeline First</option>';
        return;
    }

    // Find the selected pipeline in the stored data
    const selectedPipeline = allPipelinesData.find(p => p.id === pipelineId);

    if (selectedPipeline && selectedPipeline.stages) {
        selectedPipeline.stages.forEach(stage => {
            const option = document.createElement("option");
            option.value = stage.id;
            option.textContent = stage.name;
            stageSelect.appendChild(option);
        });
        stageSelect.disabled = false;
        console.log("Stages populated for pipeline:", pipelineId);
    } else {
        console.error("Could not find stages for pipeline:", pipelineId, "in data:", allPipelinesData);
        stageSelect.innerHTML = '<option value="">Error loading stages</option>';
        showStatusMessage(`Error loading stages for the selected pipeline.`, true);
    }
}

// --- Gmail Integration (Basic - Needs Improvement/InboxSDK) ---
function addGhlButtonToToolbar() {
    // Very fragile selector - likely to break with Gmail updates.
    // Use InboxSDK for reliable integration.
    const toolbars = document.querySelectorAll(".G-tF"); // Example selector for email view toolbar

    toolbars.forEach(toolbar => {
        if (toolbar.querySelector(".ghl-opportunity-button")) {
            return; // Button already exists
        }

        console.log("Attempting to add GHL button to toolbar:", toolbar);
        const button = document.createElement("button");
        button.innerText = "Create GHL Opp";
        button.className = "ghl-opportunity-button T-I J-J5-Ji T-I-Js-IF L3"; // Try to mimic Gmail styles
        button.style.marginLeft = "8px";

        button.onclick = (event) => {
            event.stopPropagation(); // Prevent potential parent handlers
            console.log("GHL Opportunity button clicked!");
            // TODO: Reliably extract email data here using DOM traversal or InboxSDK
            openModal();
        };

        // Find a suitable place to insert the button (e.g., next to other action buttons)
        const referenceButton = toolbar.querySelector(".T-I-Js-IF"); // Find an existing button
        if (referenceButton) {
            referenceButton.parentNode.insertBefore(button, referenceButton.nextSibling);
        } else {
            toolbar.appendChild(button); // Fallback append
        }
        console.log("GHL button added.");
    });
}

// --- Observer for Dynamic Content ---
// Use MutationObserver as a fallback if InboxSDK isn't used.
// Still unreliable for Gmail.
const observer = new MutationObserver((mutations) => {
    // Check if relevant elements appeared
    // This check needs to be specific to the elements containing the toolbar
    let addedNodes = false;
    mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
            addedNodes = true;
        }
    });

    if (addedNodes) {
        // Debounce or throttle this call if it triggers too often
        setTimeout(addGhlButtonToToolbar, 500); 
    }
});

// Observe the body for changes. This is broad and might impact performance.
// A more targeted observation is recommended.
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial attempt after a delay
setTimeout(addGhlButtonToToolbar, 4000); // Increased delay

console.log("GHL Content Script Setup Complete.");

