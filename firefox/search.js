// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Restore any saved form state
  restoreFormState();

  // Handle search form submission
  document.getElementById('searchBtn').addEventListener('click', handleSearch);
});

// Handle search button click
async function handleSearch() {
  const jobTitle = document.getElementById('jobTitle').value.trim();
  const location = document.getElementById('location').value.trim();
  
  // Get selected job sites
  const selectedSites = Array.from(document.querySelectorAll('input[name="sites"]:checked'))
    .map(cb => cb.value);

  if (!jobTitle) {
    // Show error - require job title
    return;
  }

  if (selectedSites.length === 0) {
    // Show error - require at least one site
    return;
  }

  // Save form state
  saveFormState({
    jobTitle,
    location,
    selectedSites
  });

  // Open each selected site in a new tab with search query
  for (const site of selectedSites) {
    let searchUrl;
    const encodedJob = encodeURIComponent(jobTitle);
    const encodedLoc = encodeURIComponent(location);

    switch (site) {
      case 'rozee.pk':
        searchUrl = `https://www.rozee.pk/job/jsearch/q/${encodedJob}${location ? `/loc/${encodedLoc}` : ''}`;
        break;
      case 'mustakbil.com':
        searchUrl = `https://www.mustakbil.com/jobs/?q=${encodedJob}${location ? `&l=${encodedLoc}` : ''}`;
        break;
      case 'jobz.pk':
        searchUrl = `https://www.jobz.pk/search/${encodedJob.replace(/\s+/g, '-')}-jobs/${location ? `in-${encodedLoc}/` : ''}`;
        break;
      case 'bayt.com':
        searchUrl = `https://www.bayt.com/en/pakistan/jobs/?q=${encodedJob}${location ? `&location=${encodedLoc}` : ''}`;
        break;
      case 'pk.indeed.com':
        searchUrl = `https://pk.indeed.com/jobs?q=${encodedJob}${location ? `&l=${encodedLoc}` : ''}`;
        break;
      case 'jobs.gov.pk':
        searchUrl = `https://jobs.gov.pk/search-result?search_api_fulltext=${encodedJob}`;
        break;
      case 'jobs.oec.gov.pk':
        searchUrl = `https://jobs.oec.gov.pk/jobs/search?q=${encodedJob}`;
        break;
      case 'beoe.gov.pk':
        searchUrl = `https://beoe.gov.pk/?s=${encodedJob}+jobs`;
        break;
    }

    if (searchUrl) {
      chrome.tabs.create({ url: searchUrl });
    }
  }
}

// Save form state to storage
function saveFormState(state) {
  chrome.storage.local.set({
    jobSearchState: state
  });
}

// Restore form state from storage
async function restoreFormState() {
  try {
    const { jobSearchState } = await chrome.storage.local.get('jobSearchState');
    if (jobSearchState) {
      const { jobTitle, location, selectedSites } = jobSearchState;
      
      // Restore text inputs
      document.getElementById('jobTitle').value = jobTitle || '';
      document.getElementById('location').value = location || '';
      
      // Restore checkboxes
      if (selectedSites && Array.isArray(selectedSites)) {
        selectedSites.forEach(site => {
          const cb = document.querySelector(`input[name="sites"][value="${site}"]`);
          if (cb) cb.checked = true;
        });
      }
    }
  } catch (err) {
    console.error('Error restoring form state:', err);
  }
}