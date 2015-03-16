var path = require('path');
var fs = require('fs');
var Server = require('../lib/Server');
var assert = require('chai').assert;
var request = require('request');

var echo = require('./test_services/echo');
var echoAsync = require('./test_services/echo_async');

describe('Server', function() {
	describe('constructor', function() {
		it('should be a function', function() {
			assert.isFunction(Server);
		});
	});
    describe('#config', function() {
        it('the constructor should arguments and initialise properly', function() {
            var config = {};
            var services = [];
            var server = new Server(config, services);
            assert.strictEqual(server.config, config);
            assert.strictEqual(server.services, services);
            assert.isFalse(server.hasInitialized);
            assert.isFalse(server.hasStarted);
            assert.isNull(server.server);
            assert.isNull(server.app);
        });
    });
    describe('#init()', function() {
        it('can initialize', function() {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578'
            }, []);
            server.init();
            assert.isTrue(server.hasInitialized);
            assert.isDefined(server.app);
            assert.isNull(server.server);
        });
    });
    describe('#start()', function() {
        it('can start the server', function(done) {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578'
            }, []);
            server.start(function() {
                server.stop();
                done();
            });
        });
    });
    describe('#debugHandler()', function() {
        it('is not served by default', function(done) {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578'
            }, []);
            server.start(function() {
                request('http://127.0.0.1:63578', function(err, res, body) {
                    assert.equal(res.statusCode, 404);
                    server.stop();
                    done();
                });
            });
        });
        it('respects the debug flag', function(done) {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578',
                debug: true
            }, [{
                name: 'test',
                handler: function(){}
            }]);
            server.start(function() {
                request('http://127.0.0.1:63578', function(err, res, body) {
                    assert.equal(body, '<html><body><h1>Endpoints</h1><ul><li>test</li></ul></body></html>');
                    server.stop();
                    done();
                });
            });
        });
    });
    describe('services', function() {
        it('only accepts an array of services', function() {
            var config = {
                address: '127.0.0.1',
                port: '63578'
            };
            assert.throws(
                function() { new Server(config); },
                'Services must be an Array, found "undefined"'
            );
            assert.throws(
                function() { new Server(config, null); },
                'Services must be an Array, found "null"'
            );
            assert.throws(
                function() { new Server(config, {}); },
                'Services must be an Array, found "' + {}.toString() + '"'
            );
        });
        it('can map a service name to a service', function() {
            var service1 = {
                name: 'service1',
                handler: function() {}
            };
            var service2 = {
                name: 'service2',
                handler: function() {}
            };

            var server = new Server({
                address: '127.0.0.1',
                port: '63578'
            }, [service1, service2]);

            server.init();

            assert.isTrue(server.hasService('service1'));
            assert.isTrue(server.hasService('service2'));
            assert.isFalse(server.hasService('service3'));

            assert.strictEqual(server.getService('service1'), service1);
            assert.strictEqual(server.getService('service2'), service2);
            assert.isUndefined(server.getService('service3'));
        });
        it('service name collisions throw an error', function() {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578'
            }, [{
                name: 'foo',
                handler: function(){}
            }, {
                name: 'bar',
                handler: function(){}
            }, {
                name: 'foo',
                handler: function(){}
            }]);

            assert.throws(
                function() {
                    server.init();
                },
                'Multiple services named "foo"'
            );
        });
        it('requests can be mapped to a matching service', function(done) {
            var service1 = {
                name: 'service1',
                handler: function(done) {
                    done(null, 'in handler1');
                }
            };
            var service2 = {
                name: 'service2',
                handler: function(done) {
                    done(null, 'in handler2');
                }
            };

            var server = new Server({
                address: '127.0.0.1',
                port: '63578'
            }, [service1, service2]);

            server.start(function() {
                request.post('http://127.0.0.1:63578/', function(err, res, body) {
                    assert.equal(res.statusCode, '404');
                    request.post('http://127.0.0.1:63578/service1', function(err, res, body) {
                        assert.equal(body, 'in handler1');
                        request.post('http://127.0.0.1:63578/service2', function(err, res, body) {
                            assert.equal(body, 'in handler2');
                            request.post('http://127.0.0.1:63578/service3', function(err, res, body) {
                                assert.equal(res.statusCode, '404');
                                assert.equal(body, 'Not found');
                                server.stop();
                                done();
                            });
                        });
                    });
                });
            });
        });
        it('services can be handled asynchronously', function(done) {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578',
                logErrors: false
            }, [{
                name: 'echo',
                handler: echo
            }, {
                name: 'echo-async',
                handler: echoAsync
            }]);

            server.start(function() {
                request.post({url: 'http://127.0.0.1:63578/echo', form: { echo: 'echo-test' }}, function(err, res, body) {
                    assert.equal(body, 'echo-test');
                    request.post('http://127.0.0.1:63578/echo', function(err, res, body) {
                        assert.equal(res.statusCode, 500);
                        assert.include(body, '`echo` data not provided');
                        request.post({url: 'http://127.0.0.1:63578/echo-async', form: { echo: 'echo-async-test' }}, function(err, res, body) {
                            assert.equal(body, 'echo-async-test');
                            request.post('http://127.0.0.1:63578/echo-async', function(err, res, body) {
                                assert.equal(res.statusCode, 500);
                                assert.include(body, '`echo` data not provided');
                                server.stop();
                                done();
                            });
                        });
                    });
                });
            });
        });
        it('services can receive and send large data sets', function(done) {
            // A 2.5mb text file
            var testTextFile = path.join(__dirname, 'test_data', 'test.txt');
            var text = fs.readFileSync(testTextFile).toString('utf-8');

            var server = new Server({
                address: '127.0.0.1',
                port: '63578',
                logErrors: false
            }, [{
                name: 'text-test',
                handler: function(done, data) {
                    if (data.text !== text) {
                        return done('data.text does not match');
                    }
                    done(null, 'success: ' + data.text);
                }
            }]);

            server.start(function() {
                request.post({url: 'http://127.0.0.1:63578/text-test', form: { text: text }}, function(err, res, body) {
                    assert.equal(body, 'success: ' + text);
                    server.stop();
                    done();
                });
            });
        });
        it('a service\'s `done` callback can only be called once', function(done) {
            var server = new Server({
                address: '127.0.0.1',
                port: '63578',
                logErrors: false
            }, [{
                name: 'done-x1',
                handler: function(done) {
                    done(null, 'some success');
                }
            }, {
                name: 'done-x2',
                handler: function(done) {
                    done('x2');
                    done(null, 'some success x2');
                }
            }, {
                name: 'done-x3',
                handler: function(done) {
                    done(null, 'some success x3');
                    done('x3');
                    done(null, 'some other success x3');
                }
            }]);

            var errorsTriggered = 0;
            var postReceived = false;

            var triggerDone = function() {
                server.stop();
                done();
            };

            server.onError = function(err) {
                errorsTriggered++;
                assert.include([
                    'x2',
                    'x3',
                    '`done` callback was called more than once'
                ], err instanceof Error ? err.message : err);
                if (errorsTriggered === 4 && postReceived) {
                    triggerDone();
                }
            };

            server.start(function() {
                request.post('http://127.0.0.1:63578/done-x1', function(err, res, body) {
                    assert.equal(res.statusCode, 200);
                    assert.include(body, 'some success');
                    request.post('http://127.0.0.1:63578/done-x2', function(err, res, body) {
                        assert.equal(res.statusCode, 500);
                        assert.include(body, 'x2');
                        request.post('http://127.0.0.1:63578/done-x3', function(err, res, body) {
                            assert.equal(res.statusCode, 200);
                            assert.include(body, 'some success x3');
                            postReceived = true;
                            if (errorsTriggered === 4) {
                                triggerDone();
                            }
                        });
                    });
                });
            });
        });
    });
});