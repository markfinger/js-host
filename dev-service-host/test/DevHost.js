var path = require('path');
var child_process = require('child_process');
var assert = require('chai').assert;
var request = require('request');
var _ = require('lodash');
var DevHost = require('../lib/DevHost');
var DevService = require('../lib/DevService');

describe('DevHost', function() {
  describe('constructor', function() {
    it('should be a function', function() {
      assert.isFunction(DevHost);
    });
    it('should instantiate with properties set correctly', function() {
      var host = new DevHost();
      assert.isObject(host.config);
      assert.notStrictEqual(host.config, host.defaultConfig);
      assert.deepEqual(host.config, host.defaultConfig);
      assert.isObject(host.services);
    });
    it('the constructor should accept a config', function() {
      var config = {};
      var host = new DevHost(config);
      assert.notStrictEqual(host.config, host.defaultConfig);
      assert.strictEqual(host.config, config);
      assert.deepEqual(host.config, host.defaultConfig);
    });
  });
  describe('#Service', function() {
    it('the prototype\'s prop should be DevService', function() {
      assert.strictEqual(DevHost.prototype.Service, DevService);
    });
    it('an instance\'s prop should be DevService', function() {
      assert.strictEqual(new DevHost().Service, DevService);
    });
    it('created services should have a `host` prop bound', function() {
      var host = new DevHost();
      host.addService({name: 'echo', handler: function(){}});
      assert.strictEqual(host.services.echo.host, host);
    });
  });
  describe('#dashboard', function() {
    it('The dashboard is served to GET requests at /', function(done) {
      this.timeout(5000);
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });
      host.listen(function() {
        request(host.getUrl(), function(err, res, body) {
          assert.equal(body, host.renderDashboard());
          host.stopListening();
          done();
        });
      });
    });
  });
  describe('#getServiceLookupMiddleware()', function() {
    it('Failed service lookups respond with a list of available services', function(done) {
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });

      host.addService({
        name: 'service1',
        handler: function(data, done) {}
      });
      host.addService({
        name: 'service2',
        handler: function(data, done) {}
      });

      host.listen(function() {
        request.post('http://127.0.0.1:63578/', function(err, res, body) {
          assert.equal(res.statusCode, '404');
          assert.include(res.body.toLowerCase(), 'services available');
          assert.include(res.body, 'service1');
          assert.include(res.body, 'service2');
          host.stopListening();
          done();
        });
      });
    });
  });
  describe('__clear_caches', function() {
    it('is added on startup', function() {
      var host = new DevHost();
      assert.isDefined(host.services.__clear_caches);
    });
    it('can clear caches', function() {
      var host = new DevHost({
        silent: true
      });

      var count = 0;

      host.addService({
        name: 'test',
        handler: function(data, done) {
          count++;
          done(null, count);
        }
      });

      host.callService('test', {}, 'test-key', function(err, output) {
        assert.equal(output, 1);
      });

      host.callService('test', {}, 'test-key', function(err, output) {
        assert.equal(output, 1);
      });

      host.callService('__clear_caches', {}, 'test-key', function(err, output) {
        assert.equal(output, 'Cleared caches');
      });

      host.callService('test', {}, 'test-key', function(err, output) {
        assert.equal(output, 2);
      });

      host.callService('test', {}, 'test-key', function(err, output) {
        assert.equal(output, 2);
      });
    });
    it('can clear caches via the network', function(done) {
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });

      var count = 0;

      host.addService({
        name: 'test',
        handler: function(data, done) {
          count++;
          done(null, count);
        }
      });

      host.listen(function() {
        request.post({url: host.getUrl(), headers: {'X-Service': 'test', 'X-Cache-Key': 'test-key'}}, function(err, res, body) {
          assert.equal(body, '1');
          request.post({url: host.getUrl(), headers: {'X-Service': 'test', 'X-Cache-Key': 'test-key'}}, function(err, res, body) {
            assert.equal(body, '1');
            request.post({url: host.getUrl(), headers: {'X-Service': '__clear_caches'}}, function(err, res, body) {
              assert.equal(body, 'Cleared caches');
              request.post({url: host.getUrl(), headers: {'X-Service': 'test', 'X-Cache-Key': 'test-key'}}, function(err, res, body) {
                assert.equal(body, '2');
                request.post({url: host.getUrl(), headers: {'X-Service': 'test', 'X-Cache-Key': 'test-key'}}, function(err, res, body) {
                  assert.equal(body, '2');
                  host.stopListening();
                  done();
                });
              });
            });
          });
        });
      });
    });
  });
  describe('__hot_load', function() {
    it('is added on startup', function() {
      var host = new DevHost();
      assert.isDefined(host.services.__hot_load);
    });
    it('can hot load new services', function(done) {
      var host = new DevHost();

      host.callService(
        '__hot_load',
        {
          services: [
            {
              name: 'echo',
              file: path.join(__dirname, 'test_services', 'echo.js')
            },
            {
              name: 'echo-async',
              file: path.join(__dirname, 'test_services', 'echo_async.js')
            }
          ]
        },
        function(err, output) {
          assert.isNull(err);
          assert.equal(output, 'Success');
        }
      );

      assert.isDefined(host.services.echo);
      assert.isDefined(host.services['echo-async']);

      host.callService('echo', {echo: 'test1'}, function(err, output) {
        assert.equal(output, 'test1');
      });

      host.callService('echo-async', {echo: 'test2'}, function(err, output) {
        assert.equal(output, 'test2');
        done();
      });
    });
    it('can hot load new services via the network', function(done) {
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });

      var services = [
        {
          name: 'echo',
          file: path.join(__dirname, 'test_services', 'echo.js')
        },
        {
          name: 'echo-async',
          file: path.join(__dirname, 'test_services', 'echo_async.js')
        }
      ];

      host.listen(function() {
        request.post({url: host.getUrl(), headers: {'X-Service': '__hot_load'}, json: true, body: {services: services}}, function(err, res, body) {
          assert.equal(body, 'Success');
          request.post({url: host.getUrl(), headers: {'X-Service': 'echo'}, json: true, body: {echo: 'test1'}}, function(err, res, body) {
            assert.equal(body, 'test1');
            request.post({url: host.getUrl(), headers: {'X-Service': 'echo-async'}, json: true, body: {echo: 'test2'}}, function(err, res, body) {
              assert.equal(body, 'test2');
              host.stopListening();
              done();
            });
          });
        });
      });
    });
  });
  describe('__shutdown', function() {
    it('is added on startup', function() {
      var host = new DevHost();
      assert.isDefined(host.services.__shutdown);
    });
    it('can shutdown via the network', function(done) {
      var start_js = child_process.spawn(
        'node',
        [path.join(__dirname, '..', 'bin', 'start.js'), '--blocking']
      );

      var hasStarted = false;
      var finalRequestCompleted = false;

      // Wait for stdout, which should indicate the server's running
      start_js.stdout.on('data', function(data) {
        if (hasStarted) {
          return;
        }
        assert.equal(data.toString(), 'Host listening at 127.0.0.1:63578\n');
        hasStarted = true;
        request.post({url: 'http://127.0.0.1:63578', headers: {'X-Service': '__shutdown'}}, function(err, res, body) {
          assert.isNull(err);
          assert.equal(res.statusCode, 200);
          assert.equal(body, 'Starting shutdown...');
          request.post({url: 'http://127.0.0.1:63578', headers: {'X-Service': '__shutdown'}}, function(err) {
            assert.isNotNull(err);
            finalRequestCompleted = true;
          });
        });
      });

      var stderr = '';

      start_js.stderr.on('data', function(data) {
        stderr += data.toString();
      });

      start_js.on('exit', function() {
        if (stderr) {
          throw new Error(stderr);
        }
        assert.isTrue(hasStarted);
        assert.isTrue(finalRequestCompleted);
        done();
      });
    });
  });
  describe('__status', function() {
    it('is added on startup', function() {
      var host = new DevHost();
      assert.isDefined(host.services.__status);
    });
    it('indicates the list of available services', function() {
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });

      host.callService('__status', function(err, output) {
        var status = JSON.parse(output);
        assert.isArray(status.services);
        assert.notEqual(status.services.length, 0);
        var unexpectedServices = _.difference(status.services, Object.keys(host.services));
        assert.equal(unexpectedServices.length, 0);
      });
    });
    it('indicates if the server is listening', function(done) {
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });

      host.callService('__status', function(err, output) {
        var status = JSON.parse(output);
        assert.isFalse(status.isListening);
      });

      host.listen(function() {
        host.callService('__status', function(err, output) {
          var status = JSON.parse(output);
          assert.isTrue(status.isListening);
        });
        host.stopListening();
        host.callService('__status', function(err, output) {
          var status = JSON.parse(output);
          assert.isFalse(status.isListening);
        });
        done();
      });
    });
    it('can indicate via the network if the server is listening', function(done) {
      var host = new DevHost({
        outputOnListen: false,
        silent: true
      });

      host.listen(function() {
        request.post({url: host.getUrl(), headers: {'X-Service': '__status'}}, function(err, res, body) {
          var status = JSON.parse(body);
          assert.isTrue(status.isListening);
          host.stopListening();
          host.callService('__status', function(err, output) {
            var status = JSON.parse(output);
            assert.isFalse(status.isListening);
            done();
          });
        });
      });
    });
  });
  describe('#inactivityShutdownDelay', function() {
    it('should default to null', function() {
      var host = new DevHost();
      assert.isNull(host.config.inactivityShutdownDelay);
    });
  });
  describe('#shutdownIfInactive()', function() {
    it('should not start the inactivity checker if inactivityShutdownDelay is a valid number', function() {
      var host = new DevHost();
      assert.isNull(host.shutdownIfInactiveTimer);
      host = new DevHost({inactivityShutdownDelay: null});
      assert.isNull(host.shutdownIfInactiveTimer);
      host = new DevHost({inactivityShutdownDelay: false});
      assert.isNull(host.shutdownIfInactiveTimer);
      host = new DevHost({inactivityShutdownDelay: []});
      assert.isNull(host.shutdownIfInactiveTimer);
      host = new DevHost({inactivityShutdownDelay: 0});
      assert.isNull(host.shutdownIfInactiveTimer);
    });
    it('should start the inactivity timer if inactivityShutdownDelay is set and the host is listening', function(done) {
      var host = new DevHost({
        outputOnListen: false,
        silent: true,
        inactivityShutdownDelay: 10 * 60 * 1000 // 10 minutes
      });
      assert.isNull(host.shutdownIfInactiveTimer);
      host.listen(function() {
        assert.isNotNull(host.shutdownIfInactiveTimer);
        clearTimeout(host.shutdownIfInactiveTimer);
        host.stopListening();
        done();
      });
    });
    it('should shutdown the process if the process has been inactive', function() {
      var startJs = child_process.spawnSync(
        'node', [
          path.join(__dirname, '..', 'bin', 'start.js'),
          '--blocking',
          '--config', path.join(__dirname, 'test_config', 'inactiveTimerConfig.js')
        ]
      );

      var stdout = startJs.stdout.toString();
      assert.include(stdout, 'Shutting down due to ');
      assert.include(stdout, 'ms of inactivity');
    });
  });
});