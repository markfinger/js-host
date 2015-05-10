module.exports = {
  port: 8008,
  functions: {
    echo: require('../test_functions/echo'),
    echo_async: require('../test_functions/echo_async'),
    error: require('../test_functions/error'),
    error_async: require('../test_functions/error_async')
  },
  silent: true
};