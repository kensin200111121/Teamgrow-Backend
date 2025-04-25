let pdfObj;
let totalPages = 0;
var track_id;
var pages = [0];

const activity = document.querySelector('#activity').value;
const extension = document.querySelector('#extension').value;

$(document).ready(function () {
  pdfObj = $('#pdf-container').flipBook({
    pdfUrl: $('#pdfpath').val(),
    lightBox: true,
    lightboxBackground: 'rgba(220,225,229,1)',
    onfullscreenenter: function () {
      console.log('onfullscreenenter()');
    },
    onfullscreenexit: function () {
      console.log('onfullscreenexit()');
    },
  });
  $(pdfObj).on('pagechange', (e) => {
    totalPages = pdfObj.options.pages.length;
    e.target.cPage.forEach((e) => {
      if (pages.indexOf(e) == -1) {
        pages.push(e);
      }
    });
    if (pages.length == 1) {
      if (extension == 'true') {
        $.ajax({
          type: 'POST',
          url: 'api/material/extension-track-pdf',
          headers: {
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({
            activity_id: activity,
            total_pages: totalPages,
          }),
          success: function (data) {
            const response = data.data;
            if (response) {
              track_id = response;
            }
          },
        });
      } else {
        $.ajax({
          type: 'POST',
          url: 'api/material/track-pdf',
          headers: {
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({
            activity_id: activity,
            total_pages: totalPages,
          }),
          success: function (data) {
            const response = data.data;
            if (response) {
              track_id = response;
            }
          },
        });
      }
    } else {
      if (extension == 'true') {
        $.ajax({
          type: 'PUT',
          url: 'api/material/extension-track-pdf-update/' + track_id,
          headers: {
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({ read_pages: pages.length }),
        });
      } else {
        $.ajax({
          type: 'PUT',
          url: 'api/material/track-pdf-update/' + track_id,
          headers: {
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({ read_pages: pages.length }),
        });
      }
    }
  });
});
