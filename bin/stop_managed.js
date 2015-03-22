var pm2 = require('pm2');
var _ = require('lodash');
var utils = require('./utils');

var name = utils.nameArg();

pm2.connect(function(err) {
  if (err) {
    throw new Error(err);
  }
  pm2.stop(name, function(err) {
    if (err) {
      if (_.isObject(err)) {
        err = JSON.stringify(err);
      }
      throw new Error(err);
    }
    console.log('Stopping managed process...');
    pm2.disconnect(function() {
      process.exit(0)
    });
  });
});