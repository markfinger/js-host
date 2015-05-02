'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('chai').assert;
var child_process = require('child_process');
var _ = require('lodash');
var spawnSync = require('spawn-sync'); // node 0.10.x support
var request = require('request');
var tmp = require('tmp');
var Host = require('..');
var Manager = require('../lib/Manager');
var utils = require('./utils');
var version = require('../package').version;

var postToHost = utils.postToHost;
var postToManager = utils.postToManager;

var pathToBin = path.join(__dirname, '..', 'bin', 'js-host.js');
var pathToTestConfig = path.join(__dirname, 'test_config', 'config.js');
var pathToEmptyConfig = path.join(__dirname, 'test_config', 'empty.js');
var pathToLogfileConfig = path.join(__dirname, 'test_config', 'logfile.js');

// Node 0.10.x seems to provide few details when reporting errors across processes,
// so we need to assume less helpful behaviour when testing it
var IS_NODE_ZERO_TEN = _.startsWith(process.version, 'v0.10');

describe('bin/js-host.js', function() {
  it('can read in a config and start a properly configured host', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig]
    );

    var host = new Host(
      _.defaults({silent: true}, require('./test_config/config.js'))
    );

    // Wait for stdout, which should indicate the server's running
    process.stdout.once('data', function(data) {
      assert.equal(data.toString(), 'Host listening at 127.0.0.1:8008\n');
      postToHost(host, 'echo', {data: {echo: 'echo-test'}}, function(err, res, body) {
        assert.isNull(err);
        assert.equal(body, 'echo-test');
        postToHost(host, 'echo_async', function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.include(body, '`echo` data not provided');
          postToHost(host, 'echo_async', {data: {echo: 'echo_async-test'}}, function(err, res, body) {
            assert.isNull(err);
            assert.equal(body, 'echo_async-test');
            postToHost(host, 'echo_async', function(err, res, body) {
              assert.isNull(err);
              assert.equal(res.statusCode, 500);
              assert.include(body, '`echo` data not provided');
              process.kill();
              done();
            });
          });
        });
      });
    });

    var stderr = '';

    process.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    process.on('exit', function(data) {
      if (stderr) {
        throw new Error(stderr);
      }
    });
  });
  it('an error thrown within a function will not take down the process', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig]
    );

    var host = new Host(
      _.defaults({silent: true}, require('./test_config/config.js'))
    );

    var stderr = '';

    process.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    // Wait for stdout, which should indicate the server's running
    process.stdout.once('data', function(data) {
      assert.equal(data.toString(), 'Host listening at 127.0.0.1:8008\n');
      postToHost(host, 'error', function(err, res, body) {
        assert.equal(res.statusCode, 500);
        assert.include(body, 'Error: Error function');
        postToHost(host, 'echo', {data: {echo: 'echo-test'}}, function(err, res, body) {
          assert.equal(body, 'echo-test');
          process.kill();
          assert.include(stderr, 'Error: Error function');
          done();
        });
      });
    });
  });
  it('an uncaught error thrown will take down the process', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig]
    );

    var host = new Host(
      _.defaults({silent: true}, require('./test_config/config.js'))
    );

    var stderr = '';

    process.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    var hasExited = false;
    process.on('exit', function() {
      hasExited = true;
    });

    // Wait for stdout, which should indicate the server's running
    process.stdout.once('data', function(data) {
      assert.equal(data.toString(), 'Host listening at 127.0.0.1:8008\n');
      postToHost(host, 'error_async', function(err, res, body) {
        assert.instanceOf(err, Error);
        setTimeout(function() {
          assert.isTrue(hasExited);
          assert.include(stderr, 'Error: Error function');
          done();
        }, 10);
      });
    });
  });
  it('can output the config of a host', function() {
    var output = spawnSync(
      'node', [pathToBin, pathToTestConfig, '--config']
    );

    var obj = JSON.parse(output.stdout.toString());

    assert.equal(obj.version, version);
    assert.equal(obj.type, 'Host');
    assert.isObject(obj.config);
    assert.equal(obj.config.address, '127.0.0.1');
    assert.equal(obj.config.port, 8008);
    assert.isArray(obj.config.functions);
    assert.equal(obj.config.functions.length, 5);
  });
  it('can start listening and output the config as JSON', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig, '--json']
    );

    process.stdout.once('data', function(data) {
      var obj = JSON.parse(data.toString());
      assert.equal(obj.version, version);
      assert.equal(obj.type, 'Host');
      assert.equal(obj.config.address, '127.0.0.1');
      assert.equal(obj.config.port, 8008);
      assert.isArray(obj.config.functions);
      assert.equal(obj.config.functions.length, 5);
      process.kill();
      done();
    });
  });
  it('can override the config\'s port when starting a host', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig, '--port', '8080', '--json']
    );

    var testConfig = require(pathToTestConfig);

    assert.equal(testConfig.port, 8008);

    process.stdout.once('data', function(data) {
      var obj = JSON.parse(data.toString());
      assert.equal(obj.version, version);
      assert.equal(obj.type, 'Host');
      assert.equal(obj.config.address, '127.0.0.1');
      assert.equal(obj.config.port, '8080');
      assert.notEqual(
        // Ensure both ports are coerced to the same type
        '' + obj.config.port,
        '' + testConfig.port
      );
      assert.isArray(obj.config.functions);
      assert.equal(obj.config.functions.length, 5);
      var host = new Host({
        silent: true,
        port: obj.config.port
      });
      assert.equal(host.getUrl(), 'http://127.0.0.1:8080');
      postToHost(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
        assert.isNull(err);
        assert.equal(body, 'foo');
        process.kill();
        done();
      });
    });
  });
  it('can start a manager process which can start/host/stop hosts', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig, '--manager', '--json']
    );

    process.stdout.once('data', function(data) {
      var output = data.toString();
      var obj = JSON.parse(output);
      obj.config.functions = null;
      var manager = new Manager(obj.config);
      postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
        assert.isNull(err);
        assert.notEqual(body, output);
        var hostConfig = JSON.parse(body.output).config;
        assert.equal(hostConfig.address, '127.0.0.1');
        assert.isNumber(hostConfig.port);
        var host = new Host(_.omit(hostConfig, 'functions'));
        postToHost(host, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(body, 'test');
          postToManager(manager, '/host/stop', {config: pathToTestConfig}, function(err, res, body) {
            assert.isNull(err);
            assert.deepEqual(JSON.parse(body.output).config, hostConfig);
            setTimeout(function() {
              postToHost(host, 'echo', {data: {echo: 'test'}}, function(err, res, body) {
                assert.instanceOf(err, Error);
                process.kill();
                done();
              });
            }, 50);
          });
        });
      });
    });
  });
  it('can have a manager process automatically exit once the final connection to a host has closed', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig, '--manager', '--json']
    );

    var hasExited = false;
    process.once('exit', function() {
      hasExited = true;
    });

    process.stdout.once('data', function(data) {
      var output = data.toString();
      var config = JSON.parse(output).config;
      var manager = new Manager(config);
      postToManager(manager, '/host/start', {config: pathToTestConfig}, function(err, res, body) {
        assert.isNull(err);
        assert.notEqual(body, output);
        var hostConfig = JSON.parse(body.output).config;
        assert.equal(hostConfig.address, '127.0.0.1');
        assert.isNumber(hostConfig.port);
        var host = new Host(_.omit(hostConfig, 'functions'));
        postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
          assert.isNull(err);
          var connection1 = body.connection;
          assert.isString(connection1);
          postToManager(manager, '/host/connect', {config: pathToTestConfig}, function(err, res, body) {
            assert.isNull(err);
            var connection2 = body.connection;
            assert.isString(connection2);
            postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: connection1}, function(err, res, body) {
              assert.isNull(err);
              assert.isObject(body);
              assert.equal(body.config, pathToTestConfig);
              assert.isTrue(body.started);
              assert.equal(body.status, 'Disconnected');
              assert.isNull(body.stopTimeout);
              postToManager(manager, '/host/disconnect', {config: pathToTestConfig, connection: connection2}, function(err, res, body) {
                assert.isNull(err);
                assert.isObject(body);
                assert.equal(body.config, pathToTestConfig);
                assert.isTrue(body.started);
                assert.equal(body.status, 'Disconnected. Stopping host in 200ms');
                assert.equal(body.stopTimeout, 200);
                setTimeout(function () {
                  postToHost(host, 'echo', {data: {echo: 'test'}}, function (err, res, body) {
                    assert.instanceOf(err, Error);
                    request(manager.getUrl() + '/status', function (err, res, body) {
                      assert.instanceOf(err, Error);
                      assert.isTrue(hasExited);
                      done();
                    });
                  });
                }, 250);
              });
            });
          });
        });
      });
    });
  });
  it('can stop a manager process at the /manager/stop endpoint', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToTestConfig, '--manager', '--json']
    );

    var hasExited = false;
    process.once('exit', function() {
      hasExited = true;
    });

    process.stdout.once('data', function(data) {
      var output = data.toString();
      var config = JSON.parse(output).config;
      config.functions = null;
      var manager = new Manager(config);
      postToManager(manager, '/manager/stop', function(err, res, body) {
        assert.isNull(err);
        assert.equal(body, 'Stopping...');
        setTimeout(function() {
          assert.isTrue(hasExited);
          done();
        }, 20);
      });
    });
  });
  it('throws an error if a config file does not exist', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, '/missing/file.js']
    );

    process.stderr.once('data', function(data) {
      var output = data.toString();
      if (!IS_NODE_ZERO_TEN) {
        assert.include(output, '/missing/file.js');
      }
      process.kill();
      done();
    });
  });
  it('throws an error if a config file does not export an object', function(done) {
    var process = child_process.spawn(
      'node', [pathToBin, pathToEmptyConfig]
    );

    process.stderr.once('data', function(data) {
      var output = data.toString();
      if (!IS_NODE_ZERO_TEN) {
        assert.include(output, 'Config file does not export an object');
        assert.include(output, pathToEmptyConfig);
      }
      process.kill();
      done();
    });
  });
  it('can write the logger output to a particular file', function(done) {
    var filename = tmp.fileSync().name;

    var process = child_process.spawn(
      'node', [pathToBin, pathToLogfileConfig, '--json', '--logfile', filename]
    );

    var config = require(pathToLogfileConfig);

    var initialOutput;

    process.stderr.on('data', function(data) {
      throw new Error(data.toString());
    });

    process.stdout.once('data', function(data) {
      initialOutput = data.toString();
      var host = new Host({
        silent: true,
        port: config.port
      });
      assert.equal(host.getUrl(), 'http://127.0.0.1:8008');
      postToHost(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
        assert.isNull(err);
        assert.equal(body, 'foo');
        setTimeout(function() {
          var contents = fs.readFileSync(filename).toString();
          assert.include(contents, 'POST /function/echo');
          assert.include(contents, 'Calling function "echo"');
          assert.include(contents, 'Function: echo completed');
          process.kill();
          done();
        }, 50);
      });
    });
  });
});