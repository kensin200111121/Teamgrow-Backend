$(function () {
  const contact = document.querySelector('#contact').value;
  const activity = document.querySelector('#activity').value;
  const extension = document.querySelector('#extension').value;
  if (contact && activity) {
    if (extension == 'true') {
      $.ajax({
        type: 'POST',
        url: 'api/material/extension-track-image',
        headers: {
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({ activity_id: activity }),
      });
    } else {
      $.ajax({
        type: 'POST',
        url: 'api/material/track-image',
        headers: {
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({ activity_id: activity }),
      });
    }
  }

  Galleria.loadTheme('./theme/plugins/galleria/galleria.classic.min.js');

  // Initialize Galleria
  Galleria.run('#galleria');

  $('#galleria').on(
    'click',
    '.galleria-stage .galleria-image img',
    function (e) {
      let currentIndex = $('#galleria .galleria-current').html();
      $('#gallery-container a:nth-child(' + currentIndex + ') img').click();
    }
  );
});
