'use strict';

var path = require('path');
var assert = require('chai').assert;
var child_process = require('child_process');
var spawnSync = require('spawn-sync'); // node 0.10.x support
var Host = require('..');
var post = require('./utils').post;

var serviceHost = path.join(__dirname, '..', 'bin', 'service-host.js');
var pathToTestConfig = path.join(__dirname, 'test_config', 'config.js');

describe('bin/service-host.js', function() {
  it('can read in a config and start a properly configured host', function(done) {
    var process = child_process.spawn(
      'node', [serviceHost, pathToTestConfig]
    );

    var host = new Host(require('./test_config/config.js'));

    // Wait for stdout, which should indicate the server's running
    process.stdout.on('data', function(data) {
      assert.equal(data.toString(), 'Host listening at 127.0.0.1:8000\n');
      post(host, 'echo', {data: {echo: 'echo-test'}}, function(err, res, body) {
        assert.equal(body, 'echo-test');
        post(host, 'echo-async', function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.include(body, '`echo` data not provided');
          post(host, 'echo-async', {data: {echo: 'echo-async-test'}}, function(err, res, body) {
            assert.equal(body, 'echo-async-test');
            post(host, 'echo-async', function(err, res, body) {
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
  it('an error thrown in a service will not take down the process', function(done) {
    var process = child_process.spawn(
      'node', [serviceHost, pathToTestConfig]
    );

    var host = new Host(require('./test_config/config.js'));

    var stderr = '';

    process.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    // Wait for stdout, which should indicate the server's running
    process.stdout.on('data', function(data) {
      assert.equal(data.toString(), 'Host listening at 127.0.0.1:8000\n');
      post(host, 'error', function(err, res, body) {
        assert.equal(res.statusCode, 500);
        assert.include(body, 'Error: Error service');
        post(host, 'echo', {data: {echo: 'echo-test'}}, function(err, res, body) {
          assert.equal(body, 'echo-test');
          process.kill();
          assert.include(stderr, 'Error: Error service');
          done();
        });
      });
    });
  });
  it('can output the complete config of a host', function() {
    var output = spawnSync(
      'node', [serviceHost, pathToTestConfig, '--config']
    );

    var config = JSON.parse(output.stdout.toString());

    assert.isObject(config);

    assert.equal(config.address, '127.0.0.1');
    assert.equal(config.port, 8000);
    assert.isArray(config.services);
    assert.equal(config.services.length, 3);
    assert.isTrue(config.silent);
  });
  it('can start listening and output the config as JSON', function(done) {
    var process = child_process.spawn(
      'node', [serviceHost, pathToTestConfig, '--json']
    );

    process.stdout.on('data', function(data) {
      var config = JSON.parse(data.toString());
      assert.equal(config.address, '127.0.0.1');
      assert.equal(config.port, 8000);
      assert.isArray(config.services);
      assert.equal(config.services.length, 3);
      assert.isTrue(config.silent);
      process.kill();
      done();
    });
  });
  it('can override the config\'s port when starting a host', function(done) {
    var process = child_process.spawn(
      'node', [serviceHost, pathToTestConfig, '--port', '8080', '--json']
    );

    var testConfig = require(pathToTestConfig);

    assert.equal(testConfig.port, 8000);

    process.stdout.on('data', function(data) {
      var config = JSON.parse(data.toString());
      assert.equal(config.address, '127.0.0.1');
      assert.equal(config.port, '8080');
      // Ensure both ports are coerced to the same type
      assert.notEqual('' + config.port, '' + testConfig.port);
      assert.isArray(config.services);
      assert.equal(config.services.length, 3);
      assert.isTrue(config.silent);
      var host = new Host({port: config.port});
      assert.equal(host.getUrl(), 'http://127.0.0.1:8080');
      post(host, 'echo', {data: {echo: 'foo'}}, function(err, res, body) {
        assert.isNull(err);
        assert.equal(body, 'foo');
        process.kill();
        done();
      });
    });
  });
});