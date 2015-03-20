var path = require('path');
var fs = require('fs');
var request = require('request');
var assert = require('chai').assert;
var child_process = require('child_process');
var tmp = require('tmp');

describe('start', function() {
  it('can read in a config and start a properly configured host', function(done) {
    var pathToConfigFile = tmp.tmpNameSync();
    fs.writeFileSync(pathToConfigFile, JSON.stringify({
      port: 8000,
      logErrors: false,
      services: [
        {
          name: 'echo',
          file: path.join(__dirname, 'test_services', 'echo')
        }, {
          name: 'echo-async',
          file: path.join(__dirname, 'test_services', 'echo_async')
        }
      ]
    }));

    var testSubprocess = function() {
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
              subprocess.kill();
              done();
            });
          });
        });
      });
    };

    var subprocess = child_process.spawn('node', [path.join(__dirname, '..', 'bin', 'start.js'), '-c', pathToConfigFile]);

    // Wait for stdout, which should indicate the server's running
    subprocess.stdout.on('data', testSubprocess);

    subprocess.stderr.on('data', function(data) {
      console.log('stderr:', data.toString());
    });
  });
});