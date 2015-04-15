var path = require('path');
var assert = require('chai').assert;
var child_process = require('child_process');
var Host = require('..');
var post = require('./utils').post;

describe('bin', function() {
  describe('start.js', function() {
    it('can read in a config and start a properly configured host', function(done) {
      var start_js = child_process.spawn(
        'node',
        [
          path.join(__dirname, '..', 'bin', 'start.js'),
          '-c', path.join(__dirname, 'test_config', 'config.js')
        ]
      );

      var host = new Host(require('./test_config/config.js'));

      // Wait for stdout, which should indicate the server's running
      start_js.stdout.on('data', function(data) {
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

      var host = new Host(require('./test_config/config.js'));

      var stderr = '';

      start_js.stderr.on('data', function(data) {
        stderr += data.toString();
      });

      // Wait for stdout, which should indicate the server's running
      start_js.stdout.on('data', function(data) {
        assert.equal(data.toString(), 'Host listening at 127.0.0.1:8000\n');
        post(host, 'error', function(err, res, body) {
          assert.equal(res.statusCode, 500);
          assert.include(body, 'Error: Error service');
          post(host, 'echo', {data: {echo: 'echo-test'}}, function(err, res, body) {
            assert.equal(body, 'echo-test');
            start_js.kill();
            assert.include(stderr, 'Error: Error service');
            done();
          });
        });
      });
    });
  });
});