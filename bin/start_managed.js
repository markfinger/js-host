var path = require('path');
var pm2 = require('pm2');
var utils = require('./utils');

var config = utils.configArg();
var name = utils.nameArg();

pm2.connect(function(err) {
  if (err) {
    throw new Error(err);
  }
  pm2.start(path.join(__dirname, 'start.js'), { name: name, scriptArgs: ['-c', config] }, function(err, proc) {
    if (err) {
      throw new Error(err);
    }
    console.log('Starting managed process...');
    pm2.disconnect(function() {
      process.exit(0)
    });
  });
});