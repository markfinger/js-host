'use strict';

var argv = require('yargs')
  .usage('Usage: $0 <file>')
  .demand(1)
  .example('$0 services.config.js', 'start a service host using the specified config file')
  .option('p', {
    alias: 'port',
    description: 'run the host at the specified port'
  })
  .option('c', {
    alias: 'config',
    description: 'output the host\'s config as JSON'
  })
  .option('j', {
    alias: 'json',
    description: 'output the host\'s config as JSON once it has started listening'
  })
  .help('h').alias('h', 'help')
  .strict()
  .argv;

var path = require('path');
var absolutePath = require('absolute-path'); // node 0.10.x support
var Host = require('../lib/Host');

var config = argv._[0];

if (!absolutePath(config)) {
  config = path.join(process.cwd(), config);
}

config = require(config);

var host = new Host(config);

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

process.on('uncaughtException', function(err) {
  console.error('uncaughtException', err);
  if (err && err.stack) {
    console.error(err.stack);
  }
  process.exit();
});