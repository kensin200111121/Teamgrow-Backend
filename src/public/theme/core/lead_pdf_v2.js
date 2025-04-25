let pdfObj;
let lead_opened = false;
let totalPages = 0;
var track_id;
var pages = [0];
var opened_form;

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
    onChangePage: function () {
      console.log('update page');
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
  });

  function checkCaptureModal() {
    const delayTimes = JSON.parse($('#capture-delays').val());
    for (const formId in delayTimes) {
      let delayTime = parseInt(delayTimes[formId]);
      if (delayTime) {
        setTimeout(() => {
          if (!captured) {
            $(`#form-${formId}`).modal({ backdrop: 'static', keyboard: false });
            // Protect the Body Form
            $('body').addClass('is_protected');
            lead_opened = true;
            opened_form = formId;
          }
        }, delayTime * 1000);
      } else {
        $(`#form-${formId}`).modal({ backdrop: 'static', keyboard: false });
        // Protect the Body Form
        $('body').addClass('is_protected');
        lead_opened = true;
        opened_form = formId;
      }
    }
  }

  let showable = $('#capture-dialog').val();
  if (showable == 'true') {
    checkCaptureModal();
  }

  $('.info-form').submit((e) => {
    e.preventDefault();
    //const formId = $(this).attr('form-id');
    const formId = opened_form;
    const dateReg = /^\d{4}-\d{2}-\d{2}$/;
    var formData = $(`#${formId}-body`).serializeArray();
    var data = {};
    for (const e of formData) {
      const element = $(`#${formId}-body input[name='${e['name']}']`);
      const type = element.attr('type');
      const required = element.attr('required');
      if (type == 'date') {
        if (dateReg.test(e['value'])) {
          data[e['name']] = new Date(e['value']);
        } else if (required) {
          alert('Invalid date format');
          return;
        }
      } else if (e.name == 'tags' && e.value) {
        data[e['name']] = JSON.parse(e['value']);
      } else {
        data[e['name']] = e['value'];
      }
    }
    data['form'] = formId;
    $(`#${formId}-body .btn`).addClass('loading');
    $(`#${formId}-body .btn`).text('Please wait...');
    $.ajax({
      type: 'POST',
      url: 'api/contact/lead',
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(data),
      success: function (data) {
        const response = data.data;
        if (response) {
          if (document.querySelector(`#form-${formId} .intro_video`)) {
            document.querySelector(`#form-${formId} .intro_video`).muted = true;
            document.querySelector(`#form-${formId} .intro_video`).pause();
          }
          $('#contact').val(response.contact);
          $('#activity').val(response.activity);
          activity = response.activity;
          if (updateInterested) {
            updateInterested();
          }
        }
        $(`#${formId}-body .btn`).removeClass('loading');
        $(`#${formId}-body .btn`).text('Submit');
        $('body').removeClass('is_protected');
        $(`#form-${formId}`).modal('hide');
        lead_opened = false;
        captured = true;
      },
      error: function (data) {
        $(`#${formId}-body .btn`).removeClass('loading');
        $(`#${formId}-body .btn`).text('Submit');
        if (data.status == 400) {
          const response = data.responseJSON;
          if (response && response['error']) {
            alert(response['error']);
          } else {
            alert('Internal Server Error');
          }
        } else {
          alert('Internal Server Error');
        }
        lead_opened = false;
      },
    });
  });

  $('.quick-video-wrapper .volume-control').click((e) => {
    let volumnStatus = document.querySelector('.intro_video').muted;
    document.querySelector('.intro_video').muted = !volumnStatus;
    if (volumnStatus) {
      $('.quick-video-wrapper .volume-control img').attr(
        'src',
        './theme/icons/mute.png'
      );
    } else {
      $('.quick-video-wrapper .volume-control img').attr(
        'src',
        './theme/icons/unmute.png'
      );
    }
  });
});
