(function ($) {
  $(document).ready(function () {
    document.querySelector('.button').addEventListener(
      'click',
      function () {
        let params = new URL(document.location).searchParams;
        let activity = params.get('activity');
        let url = `api/email/unsubscribe/${activity}`;
        if ($(this).val() === 'resubscribe')
          url = `api/email/resubscribe/${activity}`;
        $.ajax({
          type: 'GET',
          url,
          headers: {
            'Content-Type': 'application/json',
          },
          success: function (data) {
            $('#unsubscribe-content').removeClass('content-hide');
            $('#subscribe-content').addClass('content-hide');
          },
        });
      },
      true
    );
  });
})(jQuery);
