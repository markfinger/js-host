module.exports = {
  port: 8000,
  silent: true,
  functions: {
    echo: require('../test_functions/echo'),
    echo_async: require('../test_functions/echo_async'),
    error: require('../test_functions/error')
  },
  logger: {
    log: function() {},
    info: function() {},
    warn: function() {},
    error: function() {}
  }
};