module.exports = {
  port: 8000,
  silent: true,
  services: {
    echo: require('../test_services/echo'),
    echo_async: require('../test_services/echo_async'),
    error: require('../test_services/error')
  }
};