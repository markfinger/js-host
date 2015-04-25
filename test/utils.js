'use strict';

var request = require('request');
var _ = require('lodash');

module.exports = {
  post: function(host, funcName, opts, cb) {
    opts = opts || {};
    if (_.isFunction(opts)) {
      cb = opts;
      opts = {};
    }
    var url = host.getUrl() + '/function/' + funcName;
    if (opts.key) {
      url += '?key=' + encodeURIComponent(opts.key);
    }
    request.post({
      url: url,
      json: true,
      body: opts.data
    }, cb);
  }
};
