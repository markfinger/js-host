$(function() {
  var alertsContainer = $('.js-alerts-container');

  var alertCloseButton = (
    '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
      '<span aria-hidden="true">&times;</span>' +
    '</button>'
  );

  var addAlert = function(msg, type) {
    type = type || 'success';
    var alert = $('<div class="alert alert-' + type + '">' + alertCloseButton + msg + '</div>');
    alert.hide();
    alertsContainer.append(alert);
    alert.slideDown();
  };

  var callService = function(name) {
    $.ajax({
      url: '/',
      headers: {
        'X-Service': name
      },
      method: 'POST',
      success: function(data) {
        addAlert(data);
      },
      error: function(jqXHR, textStatus, errorThrown) {
        var message = jqXHR.responseText;
        if (message) {
          message = message.replace('\n', '<br>')
        } else {
          message = 'Error: ' + (errorThrown || textStatus);
        }
        addAlert(
          'Status code: ' + jqXHR.status + '<br>' + message,
          'danger'
        );
      }
    });
  };

  $('.js-clear-caches-btn').on('click', function() {
    callService('__clear_caches');
  });

  $('.js-shutdown-btn').on('click', function() {
    callService('__shutdown');
  });
});