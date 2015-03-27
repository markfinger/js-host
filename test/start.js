var path = require('path');
var request = require('request');
var assert = require('chai').assert;
var child_process = require('child_process');

describe('start.js', function() {
  it('can read in a config and start a properly configured host', function(done) {
    var start_js = child_process.spawn(
      'node',
      [
        path.join(__dirname, '..', 'bin', 'start.js'),
        '-c', path.join(__dirname, 'test_config', 'config.js')
      ]
    );

    // Wait for stdout, which should indicate the server's running
    start_js.stdout.on('data', function(data) {
      assert.equal(data.toString(), 'Server listening at 127.0.0.1:8000\n\n');
      request.post({url: 'http://127.0.0.1:8000', headers: {'X-Service': 'echo'}, json: true, body: {echo: 'echo-test'}}, function(err, res, body) {
        assert.equal(body, 'echo-test');
        request.post({url: 'http://127.0.0.1:8000', headers: {'X-Service': 'echo-async'}}, function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.include(body, '`echo` data not provided');
          request.post({url: 'http://127.0.0.1:8000', headers: {'X-Service': 'echo-async'}, json: true, body: {echo: 'echo-async-test'}}, function(err, res, body) {
            assert.equal(body, 'echo-async-test');
            request.post({url: 'http://127.0.0.1:8000', headers: {'X-Service': 'echo-async'}}, function(err, res, body) {
              assert.equal(res.statusCode, 500);
              assert.include(body, '`echo` data not provided');
              start_js.kill();
              done();
            });
          });
        });
      });
    });

    var stderr = '';

    start_js.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    start_js.on('exit', function(data) {
      if (stderr) {
        throw new Error(stderr);
      }
    });
  });
  it('an error thrown in a service will not take down the process', function(done) {
    var start_js = child_process.spawn(
      'node',
      [
        path.join(__dirname, '..', 'bin', 'start.js'),
        '-c', path.join(__dirname, 'test_config', 'config.js')
      ]
    );

    var stderr = '';

    start_js.stderr.on('data', function(data) {
      stderr += data.toString();
    });

    // Wait for stdout, which should indicate the server's running
    start_js.stdout.on('data', function(data) {
      assert.equal(data.toString(), 'Server listening at 127.0.0.1:8000\n\n');
      request.post({url: 'http://127.0.0.1:8000', headers: {'X-Service': 'error'}}, function(err, res, body) {
        assert.equal(res.statusCode, 500);
        assert.include(body, 'Error: Error service');
        request.post({url: 'http://127.0.0.1:8000', headers: {'X-Service': 'echo'}, json: true, body: {echo: 'echo-test'}}, function(err, res, body) {
          assert.equal(body, 'echo-test');
          start_js.kill();
          assert.include(stderr, 'Error: Error service');
          done();
        });
      });
    });
  });
});