var path = require('path');
var _ = require('lodash');
var Host = require('../../lib/Host');
var DevService = require('./DevService');
var __hotload = require('./services/__hotload');

var DevHost = function(config) {
  Host.call(this, config);

  this.addService(__hotload);

  this.listener.set('view engine', 'jade');
  this.listener.set('views', path.join(__dirname, 'views'));
  this.listener.get('/', function(req, res) {
    res.render('index', { title: 'Hey', message: 'Hello there!'});
  });
};

_.assign(DevHost.prototype, Host.prototype);

DevHost.prototype.Service = DevService;

DevHost.prototype.addService = function(service) {
  service = Host.prototype.addService.call(this, service);
  service.host = this;
};

DevHost.prototype.getServiceLookupMiddleware = function getServiceLookupMiddleware() {
  var serviceLookupMiddleware = Host.prototype.getServiceLookupMiddleware.call(this);
  return function devHostServiceLookupMiddleware(req, res, next) {
    var name = req.headers['x-service'];
    if (!this.services[name]) {
      return res.status(404).end(
        'Service not found. Services available via the X-SERVICE header: ' + JSON.stringify(Object.keys(this.services))
      );
    }
    return serviceLookupMiddleware(req, res, next);
  }.bind(this);
};

module.exports = DevHost;
