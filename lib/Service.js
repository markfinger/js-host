var _ = require('lodash');
var Cache = require('./Cache');

var Service = function Service(obj) {
  this.name = obj.name;
  this.handler = obj.handler;
  this.cache = new Cache();
  this.cacheTimeout = obj.cacheTimeout;
  if (this.cacheTimeout === undefined) {
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }
  this.pending = Object.create(null);

  this.validate();
};

Service.prototype.validate = function validate() {
  if (!_.isString(this.name) || !this.name.length) {
    throw new Error('"' + this.name + '" is not a valid service name');
  }
  if (!_.isFunction(this.handler)) {
    throw new Error('Service handlers must be a function');
  }
  if (!_.isNull(this.cacheTimeout) && !_.isNumber(this.cacheTimeout)) {
    throw new Error('Service cache timeouts must be either null or a number');
  }
};

Service.prototype.getCachedOutput = function getCachedOutput(cacheKey) {
  return this.cache.get(cacheKey);
};

Service.prototype.callPending = function callPending(cacheKey, err, output) {
  var pending = this.pending[cacheKey];
  this.pending[cacheKey] = [];

  pending.forEach(function(cb) {
    cb(err, output);
  });
};

Service.prototype.call = function call(data, cacheKey, cb) {
  // Allow `cacheKey` to be an optional argument
  if (cb === undefined && _.isFunction(cacheKey)) {
    cb = cacheKey;
    cacheKey = null;
  }

  if (!cacheKey) {
    return this.handler(data, cb);
  }

  var cachedOutput = this.getCachedOutput(cacheKey);
  if (cachedOutput) {
    return cb(null, cachedOutput);
  }

  var pending = this.pending[cacheKey] = this.pending[cacheKey] || [];
  pending.push(cb);

  if (pending.length === 1) {
    this.handler(data, function(err, output) {
      if (!err) {
        this.cache.set(cacheKey, output, this.cacheTimeout);
      }
      this.callPending(cacheKey, err, output);
    }.bind(this));
  }
};

module.exports = Service;