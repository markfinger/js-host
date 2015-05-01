module.exports = {
  port: 8008,
  silent: true,
  functions: {
    echo: require('../test_functions/echo'),
    echo_async: require('../test_functions/echo_async'),
    error: require('../test_functions/error'),
    error_async: require('../test_functions/error_async'),
    counter: (function() {
      var count = 0;
      return function(data, cb) {
        cb(null, ++count);
      }
    })()
  },
  disconnectTimeout: 200
};