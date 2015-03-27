var _ = require('lodash');
var Service = require('../DevService');

module.exports = {
  name: '__hotload',
  handler: function(data, done) {
    var services = data.services;

    if (!_.isArray(services) || !services.length) {
      done('Malformed services: "' + JSON.stringify(services) + '"');
    }

    for (var i=0; i<services.length; i++) {
      var obj = services[i];
      if (!obj.name) {
        return done('Service missing name.');
      }
      if (!obj.file) {
        return done('Service "' + obj.name + '" missing file.');
      }
      if (!this.host.services[obj.name]) {
        try {
          obj.handler = require(obj.file);
          this.host.addService(obj);
        } catch(err) {
          return done(err);
        }
      }
    }

    done(null, 'Success');
  }
};


