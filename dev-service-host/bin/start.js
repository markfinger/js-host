var child_process = require('child_process');
var fs = require('fs');
var argv = require('yargs').argv;
var _ = require('lodash');
var tmp = require('tmp');
var utils = require('../../bin/utils');
var DevHost = require('../lib/DevHost');

var config = utils.configArg();

var host = new DevHost(config);

var blocking = argv.b || argv.blocking;

if (blocking) {
  // Run the host in a blocking process
  host.listen();
} else {
  // Run the host in a detached process which is called with a
  // similar command & argument combination as this process was.
  // The detached process writes its stdout and stderr to temp
  // files which we watch and look for the expected output
  // before exiting this process

  var stdoutFile = tmp.tmpNameSync();
  var stdout = fs.openSync(stdoutFile, 'a');

  var stderrFile = tmp.tmpNameSync();
  var stderr = fs.openSync(stderrFile, 'a');

  var stdoutTail = child_process.spawn('tail', ['-f', stdoutFile]);
  var stderrTail = child_process.spawn('tail', ['-f', stderrFile]);

  stdoutTail.stdout.on('data', function(data) {
    var output = data.toString();
    // Has the child process's host started listening
    if (output === host.onListenOutput()) {
      process.stdout.write(output);
      process.exit();
    } else {
      process.stderr.write(output);
    }
  });

  stdoutTail.stdout.on('data', function(data) {
    process.stderr.write(data.toString());
  });

  stderrTail.stdout.on('data', function(data) {
    process.stderr.write(data.toString());
  });

  stderrTail.stderr.on('data', function(data) {
    process.stderr.write(data.toString());
  });

  var child = child_process.spawn(
    _.first(process.argv),
    // Ensure that the child starts the host within its own process
    _.rest(process.argv).concat(['--blocking']),
    {
      detached: true,
      stdio: ['ignore', stdout, stderr]
    }
  );

  child.unref();

  child.on('close', function(code) {
    console.log('child process exited with code ' + code);
    process.exit(code);
  });
}