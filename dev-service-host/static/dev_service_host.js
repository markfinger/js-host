(function() {
  $('.js-shutdown-btn').on('click', function() {
    $.ajax({
      url: '/',
      headers: {
        'X-Service': '__shutdown'
      },
      method: 'POST'
    });
  });
})();