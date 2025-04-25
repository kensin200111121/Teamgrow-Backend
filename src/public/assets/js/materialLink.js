$(document).ready(function (e) {
  let location = this.location.href;

  let hostingUrl = 'https://material.crmgrow.com';
  if (
    location.includes('https://ecsbe.crmgrow.com') ||
    location.includes('https://api.crmgrow.com')
  ) {
    hostingUrl = 'https://material.crmgrow.com';
  } else if (location.includes('https://stg-api.crmgrow.com')) {
    hostingUrl = 'https://stg-material.crmgrow.com';
  } else if (
    location.includes('hhttps://dev-api.crmgrow.com') ||
    location.includes('http://localhost:3000')
  ) {
    hostingUrl = 'https://dev-material.crmgrow.com';
  }

  document.addEventListener('click', function (e) {
    const target = e.target.closest('.material-object');
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      const dataType = target.getAttribute('data-type');
      const dataId = target.getAttribute('href').replace(/{{|}}/g, '');
      const url = `${hostingUrl}/${dataType}/${dataId}`;
      window.open(url, '_blank');
    }
  });
});
