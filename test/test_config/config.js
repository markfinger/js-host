module.exports = {
  port: 8000,
  silent: true,
  services: {
    echo: require('../test_services/echo'),
    'echo-async': require('../test_services/echo_async'),
    error: require('../test_services/error')
  },
  logger: {
    log: function() {},
    info: function() {},
    warn: function() {},
    error: function() {}
  }
};