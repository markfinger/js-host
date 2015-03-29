var _ = require('lodash');

module.exports = {
  name: '__clear_caches',
  handler: function(data, done) {
    this.log('Clearing caches');

    _.forOwn(this.host.services, function(service) {
      if (service.cache) {
        service.cache.clear();
      }
    });

    this.log('Cleared caches');
    done(null, 'Cleared caches');
  }
};


