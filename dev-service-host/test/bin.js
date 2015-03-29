var path = require('path');
var request = require('request');
var assert = require('chai').assert;
var child_process = require('child_process');
var DevHost = require('../lib/DevHost');

describe('bin', function() {
  describe('start.js', function() {
    it('blocks until a detached process has started listening', function(done) {
      var startJs = child_process.spawnSync(
        'node', [path.join(__dirname, '..', 'bin', 'start.js')]
      );

      var host = new DevHost();

      assert.equal(startJs.stdout.toString(), host.onListenOutput());

      request.post({url: host.getUrl(), headers: {'X-Service': '__status'}}, function(err, res, body) {
        var status = JSON.parse(body);
        assert.isTrue(status.isListening);
        request.post({url: host.getUrl(), headers: {'X-Service': '__shutdown'}}, function(err, res, body) {
          assert.equal(body, 'Starting shutdown...');
          setTimeout(done, 200);
        });
      });
    });
    it('accepts a --blocking argument to run a blocking process', function(done) {
      var child = child_process.spawn(
        'node', [path.join(__dirname, '..', 'bin', 'start.js'), '--blocking']
      );

      var host = new DevHost();

      var hasStarted = false;

      child.stdout.on('data', function(data) {
        if (hasStarted) {
          return;
        }
        hasStarted = true;
        assert.equal(data.toString(), host.onListenOutput());
        request.post({url: host.getUrl(), headers: {'X-Service': '__status'}}, function(err, res, body) {
          var status = JSON.parse(body);
          assert.isTrue(status.isListening);
          child.kill();
          done();
        });
      });
    });
  });
  describe('stop.js', function() {
    it('can stop a detached process', function(done) {
      this.timeout(4000);
      var startJs = child_process.spawnSync(
        'node', [path.join(__dirname, '..', 'bin', 'start.js')]
      );
      var host = new DevHost();
      assert.equal(startJs.stdout.toString(), host.onListenOutput());
      request.post({url: host.getUrl(), headers: {'X-Service': '__status'}}, function(err, res, body) {
        var status = JSON.parse(body);
        assert.isTrue(status.isListening);
        var stopJs = child_process.spawnSync(
          'node', [path.join(__dirname, '..', 'bin', 'stop.js')]
        );
        assert.equal(stopJs.stdout.toString(), 'Stopped the host at ' + host.getAddress() + '\n');
        done();
      });
    });
  });
});