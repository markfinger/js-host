'use strict';

var argv = require('yargs')
  .usage('Usage: $0 <file>')
  .demand(1)
  .example('$0 services.config.js', 'Start a host using the specified config file')
  .option('p', {
    alias: 'port',
    description: 'Run the host or manager at the specified port'
  })
  .option('c', {
    alias: 'config',
    description: 'Output the host\'s config as JSON and exit'
  })
  .option('j', {
    alias: 'json',
    description: 'Output the host\'s config as JSON, once it has started'
  })
  .option('m', {
    alias: 'manager',
    description: 'Run a manager process'
  })
  .help('h').alias('h', 'help')
  .strict()
  .argv;

var path = require('path');
var absolutePath = require('absolute-path'); // node 0.10.x support
var Host = require('../lib/Host');
var Manager = require('../lib/Manager');

var config = argv._[0];

if (!absolutePath(config)) {
  config = path.join(process.cwd(), config);
}

config = require(config);

var host;
if (argv.manager) {
  host = new Manager(config);
} else {
  host = new Host(config);
}

if (argv.port !== undefined) {
  config.port = argv.port;
}

if (argv.config) {
  console.log(JSON.stringify(host.config));
  return;
}

var onListen;
if (argv.json) {
  config.outputOnListen = false;
  onListen = function(host) {
    console.log(JSON.stringify(host.config));
  };
}

host.listen(onListen);