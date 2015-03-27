var argv = require('yargs').argv;
var absolutePath = require('absolute-path'); // node 0.10.x support
var Host = require('../lib/Host');

var config = argv.c || argv.config;

if (!config) {
  throw new Error('No config file specified. Use -c or --config to specify a file');
}

if (!absolutePath(config)) {
  config = path.join(process.cwd(), config);
}

config = require(config);

new Host(config).listen();