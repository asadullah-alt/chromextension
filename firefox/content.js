// Content script to extract LinkedIn profile data
async function extractProfileData() {
  const data = {};

  try {
    // Extract profile URL
    data.profileUrl = window.location.href;

    // Extract name
    const nameElement = document.querySelector('h1.text-heading-xlarge');
    data.name = nameElement ? nameElement.innerText.trim() : '';

    // Extract headline/title
    const headlineElement = document.querySelector('div.text-body-medium.break-words');
    data.headline = headlineElement ? headlineElement.innerText.trim() : '';

    // Extract location
    const locationElement = document.querySelector('span.text-body-small.inline.t-black--light.break-words');
    data.location = locationElement ? locationElement.innerText.trim() : '';

    // Extract about section
    const aboutSection = document.querySelector('#about ~ div.display-flex.ph5.pv3');
    data.about = aboutSection ? aboutSection.innerText.trim() : '';

    // Extract experience
    const experienceSection = document.querySelector('#experience');
    const experiences = [];
    if (experienceSection) {
      const expItems = experienceSection.closest('section').querySelectorAll('ul li.artdeco-list__item');
      expItems.forEach(item => {
        const titleEl = item.querySelector('span[aria-hidden="true"]');
        const companyEl = item.querySelector('span.t-14.t-normal span[aria-hidden="true"]');
        const dateEl = item.querySelector('span.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        
        if (titleEl) {
          experiences.push({
            title: titleEl.innerText.trim(),
            company: companyEl ? companyEl.innerText.trim() : '',
            duration: dateEl ? dateEl.innerText.trim() : ''
          });
        }
      });
    }
    data.experience = experiences;

    // Extract education
    const educationSection = document.querySelector('#education');
    const educations = [];
    if (educationSection) {
      const eduItems = educationSection.closest('section').querySelectorAll('ul li.artdeco-list__item');
      eduItems.forEach(item => {
        const schoolEl = item.querySelector('span[aria-hidden="true"]');
        const degreeEl = item.querySelector('span.t-14.t-normal span[aria-hidden="true"]');
        const dateEl = item.querySelector('span.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        
        if (schoolEl) {
          educations.push({
            school: schoolEl.innerText.trim(),
            degree: degreeEl ? degreeEl.innerText.trim() : '',
            duration: dateEl ? dateEl.innerText.trim() : ''
          });
        }
      });
    }
    data.education = educations;

    // Extract skills
    const skillsSection = document.querySelector('#skills');
    const skills = [];
    if (skillsSection) {
      const skillItems = skillsSection.closest('section').querySelectorAll('span[aria-hidden="true"]');
      skillItems.forEach(item => {
        const skillText = item.innerText.trim();
        if (skillText && skillText.length < 50) {
          skills.push(skillText);
        }
      });
    }
    data.skills = skills;

    return data;
  } catch (error) {
    console.error('Error extracting profile data:', error);
    return null;
  }
}



// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractProfile') {
    (async () => {
      const profileData = await extractProfileData();
      
      console.log('Extracted profile data:', profileData);
   try {
        const url = window.location.href;
        const baseMatch = url.match(/^https?:\/\/(?:www\.)?linkedin\.com\/in\/([^\/]+)\/?$/i);
        if (baseMatch) {
          const handle = baseMatch[1];
          const details = 'details'
          const base = `https://www.linkedin.com/in/${handle}`;
          const paths = ['experience', 'education', 'certifications', 'projects', 'skills'];
          //const paths = ['experience'];

          // Notify UI that pages are starting
          paths.forEach(p => chrome.runtime.sendMessage({ type: 'pageStatus', page: p, status: 'pending', statusType: 'info' }));

          // Ask background to open hidden tabs for all paths and return results in one response
          const batchResp = await new Promise((res) => chrome.runtime.sendMessage({ action: 'fetchMultipleDetails', base, paths }, res));
          if (batchResp && batchResp.success && batchResp.results) {
            for (const p of paths) {
              const entry = batchResp.results[p];
              if (entry && entry.success && entry.html) {
                profileData[`details_${p}_main`] = entry.html;
                chrome.runtime.sendMessage({ type: 'pageStatus', page: p, status: 'done', statusType: 'success' ,data:entry});
              } else {
                profileData[`details_${p}_main`] = null;
                chrome.runtime.sendMessage({ type: 'pageStatus', page: p, status: 'failed', statusType: 'error' });
              }
            }
          } else {
            paths.forEach(p => {
              profileData[`details_${p}_main`] = null;
              chrome.runtime.sendMessage({ type: 'pageStatus', page: p, status: 'done', statusType: 'error' });
            });
          }
        }
      } catch (e) {
        console.warn('Error while fetching details pages:', e);
      }

   

      const token = request.token;
      if (!token) {
        sendResponse({ success: false, message: 'Missing Bhai Kaam Do token. Please provide a token in the popup and try again.' });
        return;
      }

      // Attach token in Authorization header and include in body as well
      const payload = Object.assign({}, profileData, { token });

      try {
        const resp = await fetch('https://careerback.bhaikaamdo.com/api/saveProfile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        sendResponse({ success: true, message: 'Profile saved successfully!', data });
      } catch (error) {
        sendResponse({ success: false, message: 'Error saving profile: ' + (error.message || error) });
      }

    })();

    // Keep the message channel open for async response
    return true;
  }
});

// Handle fetchJobApplication: send full page HTML to databack SaveJobApplication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchJobApplication') {
    (async () => {
      try {
        const token = request.token;
        if (!token) {
          sendResponse({ success: false, message: 'Missing token. Provide token in the popup and try again.' });
          return;
        }

        // Extract full page HTML (including head) and page URL
        const html = document.documentElement.outerHTML;
        const url = window.location.href;

        const payload = { job_url:url, job_descriptions:html, token:token };

        const resp = await fetch('https://resume.bhaikaamdo.com/api/v1/jobs/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(payload)
        });

        let data = null;
        try { data = await resp.json(); } catch (err) { data = null; }

        if (resp.ok) {
          sendResponse({ success: true, message: 'Job application HTML saved successfully.', data });
        } else {
          sendResponse({ success: false, message: (data && data.message) ? data.message : resp.status, data });
        }
      } catch (error) {
        console.error('Error saving job application HTML:', error);
        sendResponse({ success: false, message: 'Error saving job application: ' + (error.message || error) });
      }
    })();

    // Keep channel open for async response
    return true;
  }
});