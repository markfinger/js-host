var argv = require('yargs').argv;
var Host = require('../lib/Host');
var utils = require('./utils');

if (!(argv.c || argv.config)) {
  throw new Error('No config file specified. Use -c or --config to specify a file');
}
var config = utils.configArg();
new Host(config).listen();