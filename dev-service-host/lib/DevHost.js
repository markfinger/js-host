var path = require('path');
var serveStatic = require('serve-static');
var jade = require('jade');
var _ = require('lodash');
var Host = require('../../lib/Host');
var DevService = require('./DevService');
var __clear_caches = require('./services/__clear_caches');
var __hot_load = require('./services/__hot_load');
var __shutdown = require('./services/__shutdown');
var __status = require('./services/__status');
var packageJson = require('../package');

var rootDir = path.join(__dirname, '..');

var DevHost = function DevHost(config) {
  Host.call(this, config);

  this.addService(__clear_caches);
  this.addService(__hot_load);
  this.addService(__shutdown);
  this.addService(__status);

  this.timeOfLastRequest = +new Date();
  this.shutdownIfInactiveTimer = null;
};

_.assign(DevHost.prototype, Host.prototype);

DevHost.prototype.defaultConfig = _.assign({}, DevHost.prototype.defaultConfig, {
  inactivityShutdownDelay: null
});

DevHost.prototype.Service = DevService;

DevHost.prototype.bindListener = function bindListener(listener) {
  listener.use(function(req, res, next) {
    this.timeOfLastRequest = +new Date();
    next();
  }.bind(this));
  listener.use(Host.prototype.getRequestLogMiddleware.call(this));
  listener.get('/', this.dashboard.bind(this));
  listener.use(serveStatic(path.join(rootDir, 'public')));
  return Host.prototype.bindListener.call(this, listener);
};

DevHost.prototype.dashboard = function dashboard(req, res, next) {
  if (req.method === 'GET' && req.url === '/') {
    res.end(this.renderDashboard());
  }
  next();
};

DevHost.prototype.renderDashboard = function renderDashboard() {
  return jade.renderFile(
    path.join(rootDir, 'views', 'index.jade'),
    {
      host: this,
      packageJson: packageJson
    }
  );
};

// Override the log middleware so that we can move it up the chain
DevHost.prototype.getRequestLogMiddleware = function getRequestLogMiddleware() {
  return function(req, res, next) {
    return next();
  };
};

DevHost.prototype.addService = function addService(service) {
  service = Host.prototype.addService.call(this, service);
  service.host = this;
  return service;
};

DevHost.prototype.getServiceLookupMiddleware = function getServiceLookupMiddleware() {
  // Provide more helpful messages for unknown service names
  var _serviceLookupMiddleware = Host.prototype.getServiceLookupMiddleware.call(this);
  return function serviceLookupMiddleware(req, res, next) {
    var name = req.headers['x-service'];
    if (!this.services[name]) {
      return res.status(404).end(
        'Service not found. Services available via the X-Service header: ' + JSON.stringify(Object.keys(this.services))
      );
    }
    return _serviceLookupMiddleware(req, res, next);
  }.bind(this);
};

DevHost.prototype.listen = function(cb) {
  Host.prototype.listen.call(this, function() {
    if (this.config.inactivityShutdownDelay && _.isNumber(this.config.inactivityShutdownDelay)) {
      this.shutdownIfInactive();
    }
    if (cb) {
      cb();
    }
  }.bind(this));
};

DevHost.prototype.shutdownIfInactive = function() {
  var timeSinceLastRequest = +new Date() - this.timeOfLastRequest;
  if (timeSinceLastRequest > this.config.inactivityShutdownDelay) {
    this.log('Shutting down due to ' + timeSinceLastRequest + 'ms of inactivity');
    this.callService('__shutdown', function() {});
  } else {
    this.shutdownIfInactiveTimer = setTimeout(
      this.shutdownIfInactive.bind(this),
      this.config.inactivityShutdownDelay
    );
    // Ensure that the timer doesn't block the event loop from closing
    this.shutdownIfInactiveTimer.unref();
  }
};

module.exports = DevHost;
