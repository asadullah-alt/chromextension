// Global variable to store validated token
let validatedToken = null;
let lastSavedJobUrl = null;
// Freeze tracking of tab/url changes while a save to CareerForge is in progress
let freezeUrlUpdates = false;
let freezeTimeoutId = null;
const FREEZE_TIMEOUT_MS = 60000; // 60s fallback

function setFreezeUntilSaveComplete(enable) {
  if (enable) {
    freezeUrlUpdates = true;
    if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
    freezeTimeoutId = setTimeout(() => {
      freezeUrlUpdates = false;
      freezeTimeoutId = null;
      console.warn('freezeUrlUpdates auto-unfroze after timeout');
    }, FREEZE_TIMEOUT_MS);
  } else {
    freezeUrlUpdates = false;
    if (freezeTimeoutId) {
      clearTimeout(freezeTimeoutId);
      freezeTimeoutId = null;
    }
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  // Setup navigation
  setupNavigation();
  
  // Check URL hash for initial navigation - default to search
  const hash = window.location.hash.slice(1) || 'search';
  navigateTo(hash);
  
  // Try to get cookie and validate it
  await checkAndValidateCookie();
  
  // Setup job application page
  setupJobApplicationPage();
});

// Function to check cookie and validate
async function checkAndValidateCookie() {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://bhaikaamdo.com',
      name: 'cf_auth'
    });
    
    if (cookie && cookie.value) {
      const tokenInput = document.getElementById('tokenInput');
      if (tokenInput) {
        tokenInput.value = cookie.value;
      }
      
      // Show loading state on token page
      showTokenStatus('Validating token...', 'info');
      
      // Validate the token
      const validationResult = await validateToken(cookie.value);
      
      if (validationResult.success && validationResult.valid) {
        validatedToken = cookie.value;
        // Store token in chrome.storage.local
        await chrome.storage.local.set({ 
          careerforgeToken: cookie.value,
          username: validationResult.username 
        });
        
        // Show success
        showTokenStatus('Token validated successfully!', 'success');
      } else {
        // Token is invalid
        showTokenStatus('Invalid or expired token. Please log in to CareerForge.', 'error');
        validatedToken = null;
        await chrome.storage.local.remove(['careerforgeToken', 'username']);
      }
    } else {
      // No cookie found
      showTokenStatus('No authentication token found. Please log in to CareerForge first.', 'error');
      validatedToken = null;
      await chrome.storage.local.remove(['careerforgeToken', 'username']);
    }
  } catch (error) {
    console.error('Error checking cookie:', error);
    showTokenStatus('Error checking authentication: ' + error.message, 'error');
  }
}

// Setup Job Application Page
async function setupJobApplicationPage() {
  // Get current tab URL and populate the input
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const jobLinkInput = document.getElementById('jobLinkInput');
    if (tab && tab.url && jobLinkInput) {
      jobLinkInput.value = tab.url;
      
      // Check if URL changed from last saved job
      if (lastSavedJobUrl && lastSavedJobUrl !== tab.url) {
        hideJobappActionsAndStatus();
      }
    }
  } catch (error) {
    console.error('Error getting current tab:', error);
  }
  
  // Setup save button handler
  const saveJobLinkBtn = document.getElementById('saveJobLinkBtn');
  if (saveJobLinkBtn) {
    saveJobLinkBtn.addEventListener('click', handleSaveJobLink);
  }
  
  // Setup action button handlers
  const checkCompatibilityBtn = document.getElementById('checkCompatibilityBtn');
  const createCVBtn = document.getElementById('createCVBtn');
  
  if (checkCompatibilityBtn) {
    checkCompatibilityBtn.addEventListener('click', handleCheckCompatibility);
  }
  
  if (createCVBtn) {
    createCVBtn.addEventListener('click', handleCreateCV);
  }
}

// Hide action buttons and status when URL changes
function hideJobappActionsAndStatus() {
  const actionsContainer = document.getElementById('jobappActions');
  const statusContainer = document.getElementById('jobappStatus');
  
  if (actionsContainer) {
    actionsContainer.classList.remove('show');
  }
  
  if (statusContainer) {
    statusContainer.classList.remove('show');
  }
  
  lastSavedJobUrl = null;
}

// Handle Check Job Compatibility
async function handleCheckCompatibility() {
  // TODO: Implement job compatibility check
  // This would likely open a new page or show compatibility results
  const url = 'https://bhaikaamdo.com/dashboard'; // Update with actual compatibility URL
  await chrome.tabs.create({ url });
}

// Handle Create CV
async function handleCreateCV() {
  // TODO: Implement CV creation
  // This would likely open the CV builder page
  const url = 'https://bhaikaamdo.com/cv-builder'; // Update with actual CV builder URL
  await chrome.tabs.create({ url });
}

// Handle Save Job Link
async function handleSaveJobLink() {
  // Freeze URL updates so the job link field stays the same while saving
  setFreezeUntilSaveComplete(true);
  try {
    // Check if token is validated
    if (!validatedToken) {
      showJobappStatus('Please authenticate first. Go to Auth tab.', 'error');
      return;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showJobappStatus('Unable to locate active tab.', 'error');
      return;
    }
    
    // Disable button and show progress
    const saveBtn = document.getElementById('saveJobLinkBtn');
    const saveIcon = document.getElementById('saveJobIcon');
    const saveText = document.getElementById('saveJobText');
    const progressContainer = document.getElementById('jobappProgress');
    
    saveBtn.disabled = true;
    saveText.textContent = 'Saving...';
    saveIcon.classList.add('spinning');
    saveIcon.innerHTML = '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>';
    
    // Show progress bar
    progressContainer.classList.add('show');
    
    // Hide any previous status and action buttons
    document.getElementById('jobappStatus').classList.remove('show');
    document.getElementById('jobappActions').classList.remove('show');
    
    const payload = { action: 'fetchJobApplication', token: validatedToken };
    
    const send = () => new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, payload, (response) => {
        const lastError = chrome.runtime.lastError ? { message: chrome.runtime.lastError.message } : null;
        resolve({ response, lastError });
      });
    });
    
    let { response, lastError } = await send();
    if (lastError && lastError.message && lastError.message.includes('Could not establish connection')) {
      // try injecting content script then retry
      try {
        if (chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        } else if (chrome.tabs && chrome.tabs.executeScript) {
          await new Promise((resolve, reject) => chrome.tabs.executeScript(tab.id, { file: 'content.js' }, (res) => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(res)));
        }
      } catch (e) {
        progressContainer.classList.remove('show');
        resetSaveButton();
        showJobappStatus('Failed to inject content script: ' + e.message, 'error');
        return;
      }
      
      const retry = await send();
      response = retry.response;
      lastError = retry.lastError;
    }
    
    // Hide progress bar
    progressContainer.classList.remove('show');
    resetSaveButton();
    
    if (lastError) {
      showJobappStatus('Error saving job application: ' + (lastError.message || 'unknown'), 'error');
      return;
    }
    
    if (!response) {
      showJobappStatus('No response from page when saving job application.', 'error');
      return;
    }
    
    if (response.success) {
      // Store the current URL as the last saved job
      lastSavedJobUrl = tab.url;
      
      showJobappStatus('Job application saved successfully to CareerForge!', 'success');
      
      // Show action buttons
      const actionsContainer = document.getElementById('jobappActions');
      if (actionsContainer) {
        actionsContainer.classList.add('show');
      }
    } else {
      showJobappStatus(response.message || 'Failed to save job application.', 'error');
    }
    
  } catch (err) {
    // Hide progress bar and reset button on error
    document.getElementById('jobappProgress').classList.remove('show');
    resetSaveButton();
    showJobappStatus('Error: ' + (err.message || err), 'error');
  } finally {
    // Unfreeze now that we got a response (success or failure)
    setFreezeUntilSaveComplete(false);
  }
}

// Reset Save Job Button
function resetSaveButton() {
  const saveBtn = document.getElementById('saveJobLinkBtn');
  const saveIcon = document.getElementById('saveJobIcon');
  const saveText = document.getElementById('saveJobText');
  
  saveBtn.disabled = false;
  saveText.textContent = 'Save Link to CareerForge';
  saveIcon.classList.remove('spinning');
  saveIcon.innerHTML = `
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  `;
}

// Listen for status updates from background/content
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'pageStatus') {
    updatePageStatus(msg.page, msg.status, msg.statusType || 'info',msg.data||null);
  }
});

// Initialize search form functionality
const searchBtn = document.getElementById('searchBtn');

if (searchBtn) {
  searchBtn.addEventListener('click', async () => {
    // Get form values
    const jobTitle = document.getElementById('jobTitle')?.value?.trim() || '';
    const location = document.getElementById('location')?.value?.trim() || '';
    
    // Get selected job sites
    const selectedSites = Array.from(document.querySelectorAll('input[name="sites"]:checked'))
      .map(checkbox => checkbox.value);
    
    if (!jobTitle) {
      showSearchStatus('Please enter a job title.', 'error');
      return;
    }
    
    if (selectedSites.length === 0) {
      showSearchStatus('Please select at least one job site.', 'error');
      return;
    }
    
    // Show searching status
    showSearchStatus('Opening job searches...', 'info');
    searchBtn.disabled = true;
    
    try {
      // Open each selected job site in a new tab
      for (const site of selectedSites) {
        let searchUrl;
        const encodedTitle = encodeURIComponent(jobTitle);
        const encodedLocation = encodeURIComponent(location);
        
        switch (site) {
          case 'rozee.pk':
            searchUrl = `https://www.rozee.pk/job/jsearch/q/${encodedTitle}/stype/title`;
            if (location) {
              searchUrl += `/fc/${encodedLocation}`;
            }
            break;
            
          case 'mustakbil.com':
            searchUrl = `https://www.mustakbil.com/jobs/search?keywords=${encodedTitle}`;
            if (location) {
              searchUrl += `&city=${encodedLocation}`;
            }
            break;
            
          case 'pk.indeed.com':
            const indeedTitle = jobTitle.replace(/\s+/g, '+');
            searchUrl = `https://pk.indeed.com/jobs?q=${indeedTitle}`;
            if (location) {
              searchUrl += `&l=${encodedLocation}`;
            }
            break;
        }
        
        if (searchUrl) {
          await chrome.tabs.create({ url: searchUrl });
        }
      }
      
      showSearchStatus(`Opened ${selectedSites.length} job search page${selectedSites.length > 1 ? 's' : ''} successfully!`, 'success');
    } catch (error) {
      showSearchStatus('Error opening job searches: ' + error.message, 'error');
    } finally {
      searchBtn.disabled = false;
    }
  });
}

// Refresh token button
document.getElementById('refreshTokenBtn').addEventListener('click', async () => {
  showTokenStatus('Checking for token...', 'info');
  await checkAndValidateCookie();
});

// Submit token button
const submitBtnEl = document.getElementById('submitTokenBtn');
if (submitBtnEl) {
  submitBtnEl.addEventListener('click', async () => {
    const tokenInput = document.getElementById('tokenInput');
    if (!tokenInput) return;
    const token = tokenInput.value && tokenInput.value.trim();
    if (!token) {
      showTokenStatus('Please paste a token before submitting.', 'error');
      return;
    }

    showTokenStatus('Validating token...', 'info');
    const res = await validateToken(token);
    if (res.success && res.valid) {
      validatedToken = token;
      await chrome.storage.local.set({ careerforgeToken: token, username: res.username });
      showTokenStatus('Token validated successfully!', 'success');
      setTimeout(() => showPage('search'), 600);
    } else {
      validatedToken = null;
      await chrome.storage.local.remove(['careerforgeToken','username']);
      showTokenStatus('Token is invalid. Please check and try again.', 'error');
    }
  });
}

// Change token button
document.getElementById('changeTokenBtn').addEventListener('click', async () => {
  validatedToken = null;
  await chrome.storage.local.remove(['careerforgeToken', 'username']);
  document.getElementById('tokenInput').value = '';
  showPage('token');
  await checkAndValidateCookie();
});

// Extract profile button
document.getElementById('extractBtn').addEventListener('click', async () => {
  const btn = document.getElementById('extractBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
  const status = document.getElementById('status');
  
  btn.disabled = true;
  btn.classList.add('loading');
  btnText.textContent = 'Extracting...';
  
  btnIcon.classList.add('spinning');
  btnIcon.innerHTML = '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>';
  
  status.classList.remove('show');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('linkedin.com/in/')) {
      showStatus(
        'Please navigate to your LinkedIn profile page first.',
        'error',
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" x2="12" y1="8" y2="12"></line>
          <line x1="12" x2="12.01" y1="16" y2="16"></line>
        </svg>`
      );
      resetButton();
      return;
    }
    
    const pages = ['experience','education','certifications','projects','skills'];
    initPageStatus(pages);
    document.getElementById('pageStatus').style.display = 'block';

    (async () => {
      if (!tab || !tab.id) {
        showStatus('Unable to determine the active tab.', 'error', `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`);
        resetButton();
        return;
      }
     
      const sendMessageOnce = () => new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'extractProfile', token: validatedToken }, (response) => {
          const lastError = chrome.runtime.lastError ? { message: chrome.runtime.lastError.message } : null;
          resolve({ response, lastError });
        });
      });

      const injectContentScript = (tabId) => new Promise((resolve, reject) => {
        if (chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, (injectionResults) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve(injectionResults);
          });
        } else if (chrome.tabs && chrome.tabs.executeScript) {
          chrome.tabs.executeScript(tabId, { file: 'content.js' }, (injectionResults) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve(injectionResults);
          });
        } else {
          reject(new Error('No available API to inject content script.'));
        }
      });

      let { response, lastError } = await sendMessageOnce();

      if (lastError && lastError.message && lastError.message.includes('Could not establish connection')) {
        try {
          await injectContentScript(tab.id);
        } catch (e) {
          showStatus(`Failed to inject content script: ${e.message}`, 'error', `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`);
          resetButton();
          return;
        }

        const retryResult = await sendMessageOnce();
        response = retryResult.response;
        lastError = retryResult.lastError;
      }

      if (lastError) {
        const errMsg = lastError.message || 'Unknown runtime error';
        showStatus(`Something went wrong: ${errMsg}`, 'error', `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`);
        resetButton();
        return;
      }

      if (!response) {
        showStatus(
          'No response from content script.',
          'error',
          `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`
        );
        resetButton();
        return;
      }

      if (response.success) {
        showStatus(
          response.message,
          'success',
          `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
        );
      } else {
        showStatus(
          response.message,
          'error',
          `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`
        );
      }

      resetButton();
    })();
    
  } catch (error) {
    showStatus(
      'An error occurred: ' + error.message,
      'error',
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" x2="9" y1="9" y2="15"></line>
        <line x1="9" x2="15" y1="9" y2="15"></line>
      </svg>`
    );
    resetButton();
  }
});

// Helper Functions

async function validateToken(token) {
  try {
    const response = await fetch('https://careerback.bhaikaamdo.com/api/checkExtensionToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json();
    
    if (response.ok && data.success && data.valid) {
      return {
        success: true,
        valid: true,
        username: data.username || ''
      };
    } else {
      return {
        success: false,
        valid: false,
        username: ''
      };
    }
  } catch (error) {
    console.error('Error validating token:', error);
    return {
      success: false,
      valid: false,
      username: ''
    };
  }
}

function showPage(pageName) {
  navigateTo(pageName);
}

function showTokenStatus(message, type) {
  const status = document.getElementById('tokenStatus');
  const statusText = document.getElementById('tokenStatusText');
  const statusIcon = document.getElementById('tokenStatusIcon');
  
  let iconSvg;
  if (type === 'success') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'info') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
  } else {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`;
  }
  
  statusText.textContent = message;
  statusIcon.innerHTML = iconSvg;
  
  status.classList.remove('success', 'error', 'info');
  status.classList.add(type);
  status.classList.add('show');
}

function showJobappStatus(message, type) {
  const status = document.getElementById('jobappStatus');
  const statusText = document.getElementById('jobappStatusText');
  const statusIcon = document.getElementById('jobappStatusIcon');
  
  let iconSvg;
  if (type === 'success') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'info') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
  } else {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`;
  }
  
  statusText.textContent = message;
  statusIcon.innerHTML = iconSvg;
  
  status.classList.remove('success', 'error', 'info');
  status.classList.add(type);
  status.classList.add('show');
}

function resetButton() {
  const btn = document.getElementById('extractBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
  
  btn.disabled = false;
  btn.classList.remove('loading');
  btnText.textContent = 'Extract & Save Profile';
  
  btnIcon.classList.remove('spinning');
  btnIcon.innerHTML = `
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" x2="12" y1="15" y2="3"></line>
  `;
}

function showStatus(message, type, iconSvg) {
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const statusIcon = document.getElementById('statusIcon');
  
  statusText.innerHTML = message;
  statusIcon.innerHTML = iconSvg;
  
  status.classList.remove('success', 'error');
  status.classList.add(type);
  status.classList.add('show');
}

function showSearchStatus(message, type) {
  const status = document.getElementById('searchStatus');
  const statusText = document.getElementById('searchStatusText');
  const statusIcon = document.getElementById('searchStatusIcon');
  
  let iconSvg;
  if (type === 'success') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'info') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
  } else {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" x2="9" y1="9" y2="15"></line><line x1="9" x2="15" y1="9" y2="15"></line></svg>`;
  }
  
  statusText.textContent = message;
  statusIcon.innerHTML = iconSvg;
  
  status.classList.remove('success', 'error', 'info');
  status.classList.add(type);
  status.classList.add('show');
}

// Page status helpers
function initPageStatus(pages) {
  const list = document.getElementById('pageStatusList');
  if (!list) return;
  list.innerHTML = '';
  pages.forEach(p => {
    const li = document.createElement('li');
    li.id = `page-status-${p}`;
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.innerHTML = `<span style="font-size:13px;color:#334155;">${p}</span><span style="font-size:13px;color:#64748b;">pending</span>`;
    list.appendChild(li);
  });
}

function updatePageStatus(page, statusText, statusType, data) {
  console.log(data);
  const el = document.getElementById(`page-status-${page}`);
  if (!el) return;
  const spans = el.querySelectorAll('span');
  if (!spans || spans.length < 2) return;
  spans[1].textContent = statusText;
  if (statusType === 'success') spans[1].style.color = '#16a34a';
  else if (statusType === 'error') spans[1].style.color = '#dc2626';
  else spans[1].style.color = '#64748b';
}

// Navigation Functions
function setupNavigation() {
  const navLinks = {
    'tokenNav': 'token',
    'extractNav': 'extract',
    'searchNav': 'search',
    'jobappNav': 'jobapp'
  };

  // Add click handlers for nav links
  Object.entries(navLinks).forEach(([id, page]) => {
    const link = document.getElementById(id);
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(page);
        
        // Update current tab URL when navigating to job app page
        if (page === 'jobapp') {
          setupJobApplicationPage();
        }
      });
    }
  });

  // Listen for hashchange events
  window.addEventListener('hashchange', handleHashNavigation);
}

function handleHashNavigation() {
  const hash = window.location.hash.slice(1) || 'search';
  navigateTo(hash);
}

function navigateTo(pageName) {
  // Update URL hash
  window.location.hash = pageName;

  // Update navigation links
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${pageName}`) {
      link.classList.add('active');
    }
  });

  // Show appropriate page
  const pages = ['tokenPage', 'extractPage', 'searchPage', 'jobappPage'];
  pages.forEach(pageId => {
    const page = document.getElementById(pageId);
    if (page) {
      if (pageId.startsWith(pageName)) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    }
  });
  
  // Update current tab URL when navigating to job app page
  if (pageName === 'jobapp') {
    updateJobApplicationURL();
  }
}

// Update the job application URL field
async function updateJobApplicationURL() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const jobLinkInput = document.getElementById('jobLinkInput');
    if (tab && tab.url && jobLinkInput) {
      jobLinkInput.value = tab.url;
    }
  } catch (error) {
    console.error('Error getting current tab URL:', error);
  }
}

function handleTabActivated(activeInfo) {
  // activeInfo object contains:
  // - tabId: The ID of the tab that has become active.
  // - windowId: The ID of the window containing the tab.
  // - previousTabId (optional in Manifest V3): The ID of the previous active tab.
  // If we're frozen (a save is in progress), ignore tab changes so the displayed
  // job link remains the same even if the user switches tabs.
  if (freezeUrlUpdates) {
    console.log('Tab activation ignored because freezeUrlUpdates is true');
    return;
  }
  const jobLinkInput = document.getElementById('jobLinkInput');
  console.log(`Tab activated. New active Tab ID: ${activeInfo.tabId}`);
  console.log(`Window ID: ${activeInfo.windowId}`);

  // To get more details about the newly active tab (like its URL or title),
  // you need to use chrome.tabs.get()
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    if (tab && tab.url && jobLinkInput) {
      jobLinkInput.value = tab.url;
    }
    console.log(`Active Tab URL: ${tab.url}`);
    console.log(`Active Tab Title: ${tab.title}`);

    // Your logic goes here: e.g., run a script, update the extension icon, etc.
  });
}

// Attach the listener to the onActivated event
chrome.tabs.onActivated.addListener(handleTabActivated);

// Listen for URL changes on tabs and update the job link input when appropriate
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // ignore updates while frozen
  if (freezeUrlUpdates) return;

  // if the URL changed or the tab finished loading, and the jobapp page is visible,
  // update the jobLinkInput to reflect the active tab URL
  if (changeInfo.url || changeInfo.status === 'complete') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (!tabs || !tabs.length) return;
      const active = tabs[0];
      const jobLinkInput = document.getElementById('jobLinkInput');
      // only update when the changed tab is the active one
      if (active && active.id === tabId && jobLinkInput) {
        jobLinkInput.value = active.url || '';
      }
    }).catch(() => {});
  }
});