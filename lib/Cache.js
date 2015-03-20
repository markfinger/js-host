// In-memory cache with expiring keys,
// adapted from https://github.com/ptarjan/node-cache

var Cache = function Cache() {
  this._cache = Object.create(null);
};

Cache.prototype.set = function set(key, value, expiry) {
  this.remove(key);
  var record = this._cache[key] = {
    value: value
  };
  if (!isNaN(expiry)) {
    record.timeout = setTimeout(function() {
      this.remove(key);
    }.bind(this), expiry);
  }
};

Cache.prototype.get = function get(key) {
  var record = this._cache[key];
  if (record) {
    return record.value;
  }
};

Cache.prototype.remove = function remove(key) {
  var record = this._cache[key];
  if (record) {
    clearTimeout(record.timeout);
    this._cache[key] = undefined;
    return true;
  }
  return false;
};

Cache.prototype.clear = function clear() {
  this.keys().forEach(this.remove, this);
  Cache.call(this);
};

Cache.prototype.keys = function keys() {
  return Object.keys(this._cache).filter(function(key) {
    return this._cache[key];
  }, this);
};

module.exports = Cache;