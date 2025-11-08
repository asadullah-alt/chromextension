// Background service worker to navigate tabs and extract <main> HTML from details pages
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function removeClassesAndStyles(element) {
  if (!element) {
    console.error('No element provided');
    return null;
  }

  // Remove classes and style from the main element
  element.removeAttribute('class');
  element.removeAttribute('style');

  // Get all descendant elements
  const allElements = element.querySelectorAll('*');

  // Remove classes and styles from all descendants
  allElements.forEach(el => {
    el.removeAttribute('class');
    el.removeAttribute('style');
  });

  console.log(`Removed classes and styles from ${allElements.length + 1} elements`);
  
  // Return the modified element
  return element;
}

function waitForTabComplete(tabId, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function checkStatus(tab) {
      if (!tab) return reject(new Error('Tab not found'));
      if (tab.status === 'complete') {
        // Add 5 second delay after tab reports complete status
        setTimeout(() => {
          chrome.tabs.get(tabId, (finalTab) => {
            if (!finalTab) return reject(new Error('Tab not found'));
            resolve(finalTab);
          });
        }, 25000);
        return;
      }
      if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for tab load'));
      setTimeout(() => chrome.tabs.get(tabId, checkStatus), 200);
    }
    chrome.tabs.get(tabId, checkStatus);
  });
}

function extractLinkedInExperience(mainElement) {
  // Find all list items in the experience section using stable selectors
  const experienceItems = mainElement.querySelectorAll('li.pvs-list__paged-list-item');
  
  const experiences = [];
  
  experienceItems.forEach((item) => {
    const experience = {};
    
    // Extract job title
    const titleElement = item.querySelector('.t-bold span[aria-hidden="true"]');
    experience.title = titleElement ? titleElement.textContent.trim() : '';
    
    // Extract company name and employment type
    const companyElement = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
    if (companyElement) {
      const companyText = companyElement.textContent.trim();
      const parts = companyText.split(' · ');
      experience.company = parts[0] || '';
      experience.employmentType = parts[1] || '';
    }
    
    // Extract duration
    const durationElement = item.querySelector('.pvs-entity__caption-wrapper[aria-hidden="true"]');
    experience.duration = durationElement ? durationElement.textContent.trim() : '';
    
    // Extract location
    const locationElements = item.querySelectorAll('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
    if (locationElements.length > 1) {
      experience.location = locationElements[1].textContent.trim();
    }
    
    // Extract description/responsibilities
    const descriptionElement = item.querySelector('.t-14.t-normal.t-black span[aria-hidden="true"]');
    experience.description = descriptionElement ? descriptionElement.textContent.trim() : '';
    
    // Extract company logo URL
    const logoImg = item.querySelector('img.ivm-view-attr__img--centered');
    experience.companyLogoUrl = logoImg ? logoImg.src : '';
    
    // Extract company URL
    const companyLink = item.querySelector('a[href*="/company/"]');
    experience.companyUrl = companyLink ? companyLink.href : '';
    
    experiences.push(experience);
  });
  
  return experiences;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  

  // New handler: fetch multiple details pages SEQUENTIALLY (one at a time)
  if (message && message.action === 'fetchMultipleDetails') {
    const { base, paths } = message;
    (async () => {
      try {
        if (!base || !paths || !Array.isArray(paths)) {
          sendResponse({ success: false, message: 'Missing base or paths' });
          return;
        }

        // Helper that creates a hidden tab, extracts <main>, then closes it
        const extractInHiddenTab = async (url, p) => {
          const created = await chrome.tabs.create({ url, active: true });
          const tabId = created.id;
          try {
            // Wait 15 seconds for the page to fully load
            await waitForTabComplete(tabId, 15000);
            
            const results = await chrome.scripting.executeScript({
              target: { tabId },
              func: (timeoutMs, pathURL) => {
                 return new Promise((resolve) => {
              const start = Date.now();
              function check() {
            
                   const main = document.querySelector('main');
                   
                   resolve(main ? main.innerHTML : null);
                  return;
                
                setTimeout(check, 15000);
              }
              check();
            });
              },
              args: [15000, p]
            });
            
            const html = (results && results[0] && results[0].result) ? results[0].result : null;
            return { success: true, html };
          } catch (e) {
            return { success: false, message: e.message || String(e) };
          } finally {
            try { 
              await chrome.tabs.remove(tabId); 
            } catch (e) { 
              /* ignore */ 
            }
          }
        };

        // Process each path SEQUENTIALLY instead of in parallel
        const out = {};
        
        for (const p of paths) {
          const url = `${base}/details/${p}/`;
          
          try {
            const result = await extractInHiddenTab(url, p);
            out[p] = result;
          } catch (error) {
            out[p] = { 
              success: false, 
              message: error.message || String(error) 
            };
          }
          
          // Optional: Add a small delay between tabs to be extra safe
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        sendResponse({ success: true, results: out });
      } catch (e) {
        sendResponse({ success: false, message: e.message || String(e) });
      }
    })();

    return true;
  }
});