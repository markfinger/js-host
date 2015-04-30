#!/usr/bin/env node

'use strict';

var argv = require('yargs')
  .usage('Usage: $0 <file>')
  .demand(1)
  .example('$0 host.config.js', 'Start a host using the specified config file')
  .option('p', {
    alias: 'port',
    description: 'Run the host or manager at the specified port'
  })
  .option('c', {
    alias: 'config',
    description: 'Read in the config file and output its generated config as JSON'
  })
  .option('j', {
    alias: 'json',
    description: 'Once the process has started, output its generated config as JSON'
  })
  .option('m', {
    alias: 'manager',
    description: 'Run a manager process'
  })
  .option('d', {
    alias: 'detached',
    description: 'Run in a detached process'
  })
  .option('l', {
    alias: 'logfile',
    description: 'Adds a logger file transport that writes to the specified file'
  })
  .version(function() {
    return require('../package').version;
  }).alias('v', 'version')
  .help('h').alias('h', 'help')
  .strict()
  .argv;

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var absolutePath = require('absolute-path'); // node 0.10.x support
var tmp = require('tmp');
var _ = require('lodash');
var winston = require('winston');
var Host = require('../lib/Host');
var Manager = require('../lib/Manager');

var configFile = argv._[0];

if (!absolutePath(configFile)) {
  configFile = path.join(process.cwd(), configFile);
}

var config = require(configFile);

if (!_.isObject(config) || _.isEqual({}, config)) {
  throw Error('Config file does not export an object. "' + configFile + '"');
}

var runAsDetachedProcess = false;
if (argv.detached) {
  argv.j = argv.json = true;
  runAsDetachedProcess = true;
}

var server;
if (argv.manager) {
  server = new Manager(config);
} else {
  server = new Host(config);
}

if (argv.port !== undefined) {
  config.port = argv.port;
}

if (argv['logfile']) {
  var logFile = argv.logfile;
  if (!_.isString(logFile)) {
    throw new Error('-l --logfile should only be specified once');
  }
  if (!absolutePath(logFile)) {
    logFile = path.join(process.cwd(), logFile);
  }
  server.logger.add(winston.transports.File, {
    filename: logFile,
    handleExceptions: true,
    colorize: true,
    timestamp: true,
    prettyPrint: true,
    showLevel: true,
    json: false
  });
}

if (argv.config) {
  var status = JSON.stringify(server.getStatus());
  return console.log(status);
}

var onListen;
if (argv.json) {
  config.outputOnListen = false;
  onListen = function(server) {
    console.log(JSON.stringify(server.getStatus()));
  };
}

if (!runAsDetachedProcess) {
  return server.listen(onListen);
}

// Run the host/manager in a detached process which is called
// with a similar command + argument combination as this process
// was. The detached process writes its stdout and stderr to temp
// files which we watch and look for the expected output before
// exiting this process

var stdoutFile = tmp.tmpNameSync();
var stdout = fs.openSync(stdoutFile, 'a');

var stderrFile = tmp.tmpNameSync();
var stderr = fs.openSync(stderrFile, 'a');

var stdoutTail;
var stderrTail;
var detached;

var expectedOutput = JSON.stringify(server.getStatus());

var onOutput = function(output) {
  output = output.toString().trim();
  if (output === expectedOutput) {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
    if (detached) detached.kill();
  }
  if (stderrTail) stdoutTail.kill();
  if (stderrTail) stderrTail.kill();
};

stdoutTail = child_process.spawn('tail', ['-f', stdoutFile]);
stderrTail = child_process.spawn('tail', ['-f', stderrFile]);

stdoutTail.stdout.once('data', onOutput);
stdoutTail.stderr.once('data', onOutput);
stderrTail.stdout.once('data', onOutput);
stderrTail.stderr.once('data', onOutput);

var command = _.first(process.argv);
var args = _.rest(process.argv);
args = _.without(args, '-d', '--detached');
args.push('--json');

detached = child_process.spawn(
  command,
  args,
  {
    detached: true,
    stdio: ['ignore', stdout, stderr]
  }
);

detached.unref();