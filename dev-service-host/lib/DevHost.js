var path = require('path');
var serveStatic = require('serve-static');
var jade = require('jade');
var _ = require('lodash');
var Host = require('../../lib/Host');
var DevService = require('./DevService');
var __hotload = require('./services/__hotload');
var __shutdown = require('./services/__shutdown');

var DevHost = function(config) {
  Host.call(this, config);

  this.addService(__hotload);
  this.addService(__shutdown);
};

_.assign(DevHost.prototype, Host.prototype);

DevHost.prototype.Service = DevService;

DevHost.prototype.getMiddleware = function getMiddelware() {
  var middleware = [
    function(req, res, next) {
      if (req.method === 'GET' && req.url === '/') {
        var html = jade.renderFile(
          path.join(__dirname, '..', 'views', 'index.jade'),
          {
            host: this,
            packageJson: require('../package')
          }
        );
        res.end(html);
      }
      next();
    }.bind(this),
    serveStatic(path.join(__dirname, '..', 'static'))
  ];

  return middleware.concat(Host.prototype.getMiddleware.call(this));
};

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
        'Service not found. Services available via the X-Service header: ' + JSON.stringify(Object.keys(this.services))
      );
    }
    return serviceLookupMiddleware(req, res, next);
  }.bind(this);
};

module.exports = DevHost;
