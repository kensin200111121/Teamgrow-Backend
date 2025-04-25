var opened_form;
(function ($) {
  let lead_opened = false;
  $(document).ready(function () {
    function checkCaptureModal() {
      const delayTimes = JSON.parse($('#capture-delays').val());
      for (const formId in delayTimes) {
        let delayTime = parseInt(delayTimes[formId]);
        if (delayTime) {
          setTimeout(() => {
            if (!captured) {
              $(`#form-${formId}`).modal({
                backdrop: 'static',
                keyboard: false,
              });
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
      //const formId = $(this).attr('id');
      const formId = opened_form;
      //console.log('formId', formId);
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
              document.querySelector(
                `#form-${formId} .intro_video`
              ).muted = true;
              document.querySelector(`#form-${formId} .intro_video`).pause();
            }
            $('#contact').val(response.contact);
            $('#activity').val(response.activity);
            activity = response.activity;
            contact = response.contact;
            if (contact && activity) {
              $.ajax({
                type: 'POST',
                url: 'api/material/track-image',
                headers: {
                  'Content-Type': 'application/json',
                },
                data: JSON.stringify({ activity_id: activity }),
              });
            }
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
})(jQuery);
