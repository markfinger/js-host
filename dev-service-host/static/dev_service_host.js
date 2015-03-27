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

  $('.js-shutdown-btn').on('click', function() {
    $.ajax({
      url: '/',
      headers: {
        'X-Service': '__shutdown'
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
  });
});