var fs = require('fs');
var argv = require('yargs').argv;
var Host = require('../lib/Host');

var readConfigFile = function readConfigFile(pathToFile, cb) {
  fs.readFile(pathToFile, function(err, json) {
    if (err) {
      throw new Error(err);
    }
    var config = JSON.parse(json);
    cb(config);
  });
};

var pathToFile = argv.c || argv.config;
if (!pathToFile) {
  throw new Error('No config file specified. Use -c or --config to specify a path to a json file');
}

readConfigFile(pathToFile, function(config) {
  new Host(config).listen();
});