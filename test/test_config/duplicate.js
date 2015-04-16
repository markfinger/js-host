module.exports = {
  port: 8000,
  silent: true,
  services: [
    {
      name: 'echo',
      handler: require('../test_services/echo')
    }, {
      name: 'echo-async',
      handler: require('../test_services/echo_async')
    }, {
      name: 'error',
      handler: require('../test_services/error')
    }
  ]
};