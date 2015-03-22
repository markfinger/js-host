var path = require('path');
var request = require('request');
var assert = require('chai').assert;
var child_process = require('child_process');
var pm2 = require('pm2');
var _ = require('lodash');

describe('bin commands', function() {
  describe('#start.js', function() {
    it('can read in a config and start a properly configured host', function(done) {
      var start_js = child_process.spawn(
        'node',
        [path.join(__dirname, '..', 'bin', 'start.js'), '-c', path.join(__dirname, 'test_config', 'config.js')]
      );

      // Wait for stdout, which should indicate the server's running
      start_js.stdout.on('data', function(data) {
        assert.equal(data.toString(), 'Server listening at 127.0.0.1:8000\n');
        request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo'}, json: true, body: {echo: 'echo-test'}}, function(err, res, body) {
          assert.equal(body, 'echo-test');
          request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo-async'}}, function(err, res, body) {
            assert.equal(res.statusCode, 500);
            assert.include(body, '`echo` data not provided');
            request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo-async'}, json: true, body: {echo: 'echo-async-test'}}, function(err, res, body) {
              assert.equal(body, 'echo-async-test');
              request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo-async'}}, function(err, res, body) {
                assert.equal(res.statusCode, 500);
                assert.include(body, '`echo` data not provided');
                start_js.kill();
                done();
              });
            });
          });
        });
      });

      start_js.stderr.on('data', function(data) {
        start_js.kill();
        throw data.toString();
      });
    });
    it('an error thrown in a service will not take down the process', function(done) {
      var start_js = child_process.spawn(
        'node',
        [path.join(__dirname, '..', 'bin', 'start.js'), '-c', path.join(__dirname, 'test_config', 'config.js')]
      );

      // Wait for stdout, which should indicate the server's running
      start_js.stdout.on('data', function(data) {
        assert.equal(data.toString(), 'Server listening at 127.0.0.1:8000\n');
        request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'error'}}, function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.include(body, 'Error: Error service');
          request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo'}, json: true, body: {echo: 'echo-test'}}, function(err, res, body) {
            assert.equal(body, 'echo-test');
            start_js.kill();
            done();
          });
        });
      });

      start_js.stderr.on('data', function(data) {
        var err = data.toString();
        if (err.indexOf('Error: Error service') !== 0) {
          start_js.kill();
          throw err;
        }
      });
    });
  });
  describe('#start_managed.js', function() {
    it('starts a process managed by PM2', function(done) {
      var start_managed_js = child_process.spawn(
        'node',
        [path.join(__dirname, '..', 'bin', 'start_managed.js'), '-n', 'test-service-host', '-c', path.join(__dirname, 'test_config', 'config.js')]
      );

      // Wait for stdout, which should indicate that the process is starting
      start_managed_js.stdout.on('data', function(data) {
        assert.equal(data.toString(), 'Starting managed process...\n');
        // Wait a moment for the process to start up
        setTimeout(function() {
          request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo'}, json: true, body: {echo: 'echo-test'}}, function(err, res, body) {
            assert.equal(body, 'echo-test');
            pm2.connect(function(err) {
              if (err) {
                throw new Error(err);
              }
              pm2.list(function(err, processList) {
                if (err) {
                  throw new Error(err);
                }
                assert.notEqual(processList.length, 0);
                assert.include(_.pluck(processList, 'name'), 'test-service-host');
                pm2.delete('test-service-host', function(err) {
                  if (err) {
                    throw new Error(err);
                  }
                  pm2.list(function(err, processList) {
                    if (err) {
                      throw new Error(err);
                    }
                    assert.notInclude(_.pluck(processList, 'name'), 'test-service-host');
                    pm2.disconnect(function() {
                      done();
                    });
                  });
                });
              });
            });
          });
        }, 500);
      });

      start_managed_js.stderr.on('data', function(data) {
        throw data.toString();
      });
    });
  });
  describe('#stop_managed.js', function() {
    it('stops a process managed by PM2', function(done) {
      var start_managed_js = child_process.spawn(
        'node',
        [path.join(__dirname, '..', 'bin', 'start_managed.js'), '-n', 'test-service-host', '-c', path.join(__dirname, 'test_config', 'config.js')]
      );

      // Wait for stdout, which should indicate that the process has been started
      start_managed_js.stdout.on('data', function(data) {
        assert.equal(data.toString(), 'Starting managed process...\n');

        var stop_managed_js = child_process.spawn(
          'node',
          [path.join(__dirname, '..', 'bin', 'stop_managed.js'), '-n', 'test-service-host']
        );

        // Wait for stdout, which should indicate that the process has been stopped
        stop_managed_js.stdout.on('data', function(data) {
          assert.equal(data.toString(), 'Stopping managed process...\n');

          pm2.connect(function(err) {
            if (err) {
              throw new Error(err);
            }
            pm2.list(function(err, processList) {
              if (err) {
                throw new Error(err);
              }
              assert.notEqual(processList.length, 0);
              assert.include(_.pluck(processList, 'name'), 'test-service-host');
              var process = _.find(processList, {name: 'test-service-host'});
              assert.equal(process.pm2_env.status, 'stopped');
              pm2.delete('test-service-host', function(err) {
                if (err) {
                  throw new Error(err);
                }
                pm2.list(function(err, processList) {
                  if (err) {
                    throw new Error(err);
                  }
                  assert.notInclude(_.pluck(processList, 'name'), 'test-service-host');
                  pm2.disconnect(function() {
                    // Make sure that the server is not responding
                    request.post({url: 'http://127.0.0.1:8000', headers: {'X-SERVICE': 'echo'}, json: true, body: {echo: 'echo-test'}}, function(err, res, body) {
                      assert.equal(err.toString(), 'Error: connect ECONNREFUSED');
                      done();
                    });
                  });
                });
              });
            });
          });
        });

        stop_managed_js.stderr.on('data', function(data) {
          throw data.toString();
        });
      });

      start_managed_js.stderr.on('data', function(data) {
        throw data.toString();
      });
    });
  });
});