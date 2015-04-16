'use strict';

var request = require('request');
var _ = require('lodash');

module.exports = {
  post: function(host, serviceName, opts, cb) {
    opts = opts || {};
    if (_.isFunction(opts)) {
      cb = opts;
      opts = {};
    }
    var url = host.getUrl() + '/service/' + serviceName;
    if (opts.cacheKey) {
      url += '?cache-key=' + encodeURIComponent(opts.cacheKey);
    }
    request.post({
      url: url,
      json: true,
      body: opts.data
    }, cb);
  }
};
