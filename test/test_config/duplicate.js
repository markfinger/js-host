module.exports = {
  port: 8008,
  silent: true,
  functions: {
    echo: require('../test_functions/echo'),
    echo_async: require('../test_functions/echo_async'),
    error: require('../test_functions/error')
  }
};