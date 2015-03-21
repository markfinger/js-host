var path = require('path');

module.exports = {
  port: 8000,
  logErrors: false,
  debug: true,
  services: [
    {
      name: 'echo',
      file: path.join(__dirname, '..', 'test_services', 'echo')
    }, {
      name: 'echo-async',
      file: path.join(__dirname, '..', 'test_services', 'echo_async')
    }, {
      name: 'error',
      file: path.join(__dirname, '..', 'test_services', 'error')
    }
  ]
};