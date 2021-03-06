const expect = require('chai').expect;
const modofun = require('../index');

console.error = function(){};

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function test(runApp) {

  function executeRequest(operation, url, handler, options, onEnd, method, body) {
    runApp(url, {
      [operation]: handler,
      wrong1: () => { throw new Error("Wrong one") },
    }, options, onEnd, method, body);
  }

  function testRouting(options={}) {
    return function() {
      function checkCall(operation, path, valid=true) {
        return function(done) {
          options.errorHandler = err => {
            !valid && expect(err).to.be.an('error');
            done();
          };
          executeRequest(operation, path, () => { valid && done() }, options);
        }
      }
      it('should pick the right route', checkCall('test', '/test/jdoe/1967'));
      it('should be case sensitive', checkCall('test', '/Test/jdoe/1967', false));
      it('should reject empty operation names', checkCall('', '//jdoe/1967', false));
      it('should reject empty paths', checkCall('test', '/', false));
    }
  }

  describe('Request/Response mode', function() {

    describe('Routing', testRouting({ mode: 'reqres' }));

    describe('Headers', function() {
      function testHeaderFunc(getHeader) {
        return function(done) {
          executeRequest('test', '/test',
            (req) => {
              req.headers['__mftest__'] = 'ok';
              expect(getHeader(req, '__mfTEST__')).to.equal('ok');
              done();
            },
            { mode: 'reqres', errorHandler: done });
        }
      }
      it('should support req.get()', testHeaderFunc((req, name) => req.get(name)));
      it('should support req.header()', testHeaderFunc((req, name) => req.header(name)));
    });

    describe('Parameters', function() {
      function checkLength(path, length) {
        return function(done) {
          executeRequest('test', path,
            (req) => expect(req.params).to.have.lengthOf(length) && done(),
            { mode: 'reqres', errorHandler: done });
        }
      }
      it('should ignore a trailing slash', checkLength('/test/jdoe/1967/', 2));
      it('should support consecutive middle slashes', checkLength('/test/jdoe//1967/', 3));
      it('should support consecutive end slashes', checkLength('/test/jdoe/1967//', 3));
      it('should support consecutive slashes right after operation', checkLength('/test///jdoe/1967', 4));
      it('should support only consecutive slashes after operation', checkLength('/test//', 1));
      it('should support no params after operation', checkLength('/test', 0));
    });

    describe('Promises', function() {
      function checkDone(handler, valid=true) {
        return function(done) {
          executeRequest('test', '/test', handler,
            {
              mode: 'reqres',
              errorHandler: err => {
                if (valid) {
                  done(err);
                } else {
                  expect(err).to.be.an('error');
                  done();
                }
              }
            });
        }
      }
      it('should trigger error handler when rejected', checkDone(() => Promise.reject(new Error('failure')), false));
    });

    describe('Response', function() {
      function checkResponse(method, value, expectedResponseData) {
        return function(done) {
          executeRequest('test', '/test', (req, res) => res[method](value),
            { mode: 'reqres', errorHandler: done },
            (status, body) => {
              expect(body).to.equal(expectedResponseData);
              done();
            }
          );
        }
      }
      it('should support res.json', checkResponse('json', { a: 1, b: 'haha' }, '{"a":1,"b":"haha"}'));
      it('should support res.send', checkResponse('send', 'haha', 'haha'));
      it('should support res.end', checkResponse('end', 'the end', 'the end'));
      it('should support res.end with no body', checkResponse('end', undefined, ''));
    });

  });


  describe('Function mode', function() {

    describe('Routing', testRouting({ mode: 'function' }));

    describe('Arguments', function() {
      function checkLength(path, length) {
        return function(done) {
          executeRequest('test', path, function() {
            expect(arguments).to.have.lengthOf(length);
            done();
          }, { mode: 'function', checkArity: false, errorHandler: done });
        }
      }
      it('should ignore a trailing slash', checkLength('/test/jdoe/1967/', 2));
      it('should support consecutive middle slashes', checkLength('/test/jdoe//1967/', 3));
      it('should support consecutive end slashes', checkLength('/test/jdoe/1967//', 3));
      it('should support consecutive slashes right after operation', checkLength('/test///jdoe/1967', 4));
      it('should support only consecutive slashes after operation', checkLength('/test//', 1));
      it('should support no params after operation', checkLength('/test', 0));
    });

    describe('Context (this)', function() {
      it('should support query string', function(done) {
        executeRequest('test', '/test?one=1&two=querystring', function() {
          expect(this.query).to.deep.equal({one: '1', two: 'querystring'});
          done();
        }, { mode: 'function', errorHandler: done });
      });
      it('should support JSON request body', function(done) {
        executeRequest('test', '/test', function() {
            expect(this.body).to.deep.equal({ one: 1, two: 'yes' });
            done();
          },
          { mode: 'function', errorHandler: done }, undefined,
          'POST', { one: 1, two: 'yes' }
        );
      });
      it('should support empty string request body', function(done) {
        executeRequest('test', '/test', function() {
            expect(this.body).to.deep.equal({});
            done();
          },
          { mode: 'function', errorHandler: done }, undefined,
          'POST', ''
        );
      });
      it('should handle non-JSON request body', function(done) {
        executeRequest('test', '/test', function() {
            expect(this.body).to.equal('this is not JSON');
            done();
          },
          { mode: 'function', errorHandler: done }, undefined,
          'POST', 'this is not JSON'
        );
      });
    });

    describe('Function arity check', function() {
      function testArityCheck(path, valid=true) {
        return function(done) {
          executeRequest('test', path, (one, two, three='optional', four) => done(!valid && new Error('Function was executed anyway')), {
            mode: 'function',
            checkArity: true,
            errorHandler: err => {
              if (valid) {
                done(err);
              } else {
                expect(err).to.be.an('error');
                done();
              }
            }
          });
        }
      }
      it('should support path params only', testArityCheck('/test/jdoe/1976'));
      it('should ignore query string parameters', testArityCheck('/test/jdoe/1976/?a=1&bee=2'));
      it('should fail on too few path params', testArityCheck('/test/jdoe?a=1&bee=2', false));
      it('should support extra path parameters (for optionals)', testArityCheck('/test/jdoe/too/many'));
    });

    describe('Function return', function() {
      function checkResponse(value, expectedResponseData, expectedResponseStatus=200) {
        return function(done) {
          executeRequest('test', '/test', () => value,
            { mode: 'function', errorHandler: done },
            (status, body) => {
              expect(body).to.equal(expectedResponseData);
              expect(status).to.equal(expectedResponseStatus);
              done();
            }
          );
        }
      }
      it('should support objects', checkResponse({ a: 1, b: 'haha', c: false }, '{"a":1,"b":"haha","c":false}'));
      it('should support arrays', checkResponse([1, 'haha', false], '[1,"haha",false]'));
      it('should support strings', checkResponse('haha', '"haha"'));
      it('should support booleans', checkResponse(true, 'true'));
      it('should support Promises', checkResponse(Promise.resolve('test'), '"test"'));
      // modofun will handle undefined and empty string as a 204 with empty body
      it('should support empty string', checkResponse('', '', 204));
      it('should support empty return', checkResponse(undefined, '', 204));
    });

  });


  describe('Default Error Handler', function() {
    function checkStatus(operation, path, handler, status) {
      return function(done) {
        executeRequest(operation, path, handler,
          { mode: 'function' },
          (actualStatus) => {
            expect(actualStatus).to.equal(status);
            done();
          });
      }
    }
    function checkError(error, status) {
      return checkStatus('test', '/test', () => { throw error }, status);
    }

    const unauthorizedError = new Error();
    unauthorizedError.name = 'UnauthorizedError';
    it('should return 401 on authorization errors', checkError(unauthorizedError, 401));
    it('should return 500 for unknown errors', checkError(new Error('ksflksjd'), 500));
    it('should return 404 when handler not found', checkStatus('test', '/other', () => {}, 404));
    it('should return 404 when function returns null', checkStatus('test', '/test', () => null, 404));
    it('should return 500 on Promise rejection', checkStatus('test', '/test', () => Promise.reject('failed'), 500));
  });


  describe('modofun.arity()', function() {
    function testArity(path, required, valid=true, maximum) {
      return function(done) {
        executeRequest('test', path, [modofun.arity(required, maximum), () => done(!valid && new Error('Function was executed anyway'))], {
          mode: 'reqres',
          errorHandler: err => {
            if (valid) {
              done(err);
            } else {
              expect(err).to.be.an('error');
              done();
            }
          }
        });
      }
    }
    it('should ignore a trailing slash', testArity('/test/jdoe/1967/', 2));
    it('should support consecutive middle slashes', testArity('/test/jdoe//1967/', 3));
    it('should support consecutive end slashes', testArity('/test/jdoe/1967//', 3));
    it('should support consecutive slashes right after operation', testArity('/test///jdoe/1967', 4));
    it('should support only consecutive slashes after operation', testArity('/test//', 1));
    it('should support no params after operation', testArity('/test', 0));
    it('should fail if too few parameters are sent', testArity('/test/jdoe', 2, false));
    it('should support extra parameters (for optionals)', testArity('/test/jdoe/1967', 1));
    it('should support ranges #1', testArity('/test/one', 1, true, 2));
    it('should support ranges #2', testArity('/test/with/two', 1, true, 2));
    it('should support min == max', testArity('/test/with/two', 2, true, 2));
    it('should fail if too many parameters are sent', testArity('/test/one/too/many', 1, false, 2));
  });


  describe('Middleware Stack', function() {
    const mwCounter = {};
    const errCounter = {};
    const handlerCounter = {};

    const mwIncr = function({path}, res, next) {
      mwCounter[path]++;
      next();
    }
    const mwHandleErr = function(err, {path}, res, next) {
      errCounter[path]++;
      next();
    }
    const mwThrowError = (req, res, next) => { throw new Error('mw error') };
    const mwNextError = (req, res, next) => next(new Error('mw error'));

    function testStack(id, middleware, mwHits, errHits, handlerHits) {
      const path = '/test/' + id;
      mwCounter[path] = 0;
      errCounter[path] = 0;
      handlerCounter[path] = 0;

      return function(done) {
        executeRequest('test', path,
          idParam => handlerCounter['/test/' + idParam]++,
          middleware,
          () => {
            expect(mwCounter[path]).to.equal(mwHits);
            expect(errCounter[path]).to.equal(errHits);
            expect(handlerCounter[path]).to.equal(handlerHits);
            done();
          });
      }
    }
    it('should run through all middleware', testStack(1, [mwIncr, mwIncr, mwIncr], 3, 0, 1));
    it('should stop after a thrown error', testStack(2, [mwIncr, mwThrowError, mwIncr, mwIncr], 1, 0, 0));
    it('should stop after an error passed in next()', testStack(3, [mwIncr, mwIncr, mwNextError, mwIncr], 2, 0, 0));
    it('should support error handling middleware', testStack(4, [mwIncr, mwThrowError, mwIncr, mwHandleErr, mwIncr], 2, 1, 1));
  });


  describe('Bad config', function() {
    function testConfig(handlers, middleware, bad=true) {
      return function(done) {
        runApp('/test', handlers, middleware, status => {
          if (bad) {
            expect(status).to.be.at.least(400);
          } else {
            expect(status).to.be.below(300);
          }
          done();
        });
      }
    }
    it('should fail if handlers is not an object', testConfig(1));
    it('should fail if handler is not a function', testConfig({ test: 'this is not a function' }));
    it('should fail if no handlers are provided', testConfig());
    it('should ignore improper middleware', testConfig({ test: () => {} }, ['this is not a middleware'], false));
  });
}

function setAzureEnv() {
  const azureEnvValue = process.env.AzureWebJobsStorage;
  const awsEnvValue = process.env.LAMBDA_TASK_ROOT;
  delete(process.env.LAMBDA_TASK_ROOT);
  process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
  return { azureEnvValue, awsEnvValue };
}
function setAwsEnv() {
  const azureEnvValue = process.env.AzureWebJobsStorage;
  const awsEnvValue = process.env.LAMBDA_TASK_ROOT;
  delete(process.env.AzureWebJobsStorage);
  process.env.LAMBDA_TASK_ROOT = '/var/task';
  return { azureEnvValue, awsEnvValue };
}
function setGcloudEnv() {
  const azureEnvValue = process.env.AzureWebJobsStorage;
  const awsEnvValue = process.env.LAMBDA_TASK_ROOT;
  delete(process.env.AzureWebJobsStorage);
  delete(process.env.LAMBDA_TASK_ROOT);
  return { azureEnvValue, awsEnvValue };
}
function restoreEnv({ azureEnvValue, awsEnvValue }) {
  if (azureEnvValue) {
    process.env.AzureWebJobsStorage = azureEnvValue;
  }
  if (awsEnvValue) {
    process.env.LAMBDA_TASK_ROOT = awsEnvValue;
  }
}

module.exports = { test, setAwsEnv, setAzureEnv, setGcloudEnv, restoreEnv };
