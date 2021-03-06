(function() {
  var Authentication, BackendMessage, Connection, EventEmitter, FrontendMessage, Query, net, util;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  util = require('util');

  net = require('net');

  EventEmitter = require('events').EventEmitter;

  FrontendMessage = require('./frontend_message');

  BackendMessage = require('./backend_message');

  Authentication = require('./authentication');

  Query = require('./query');

  Connection = (function() {

    __extends(Connection, EventEmitter);

    function Connection(connectionOptions) {
      var _base, _base2, _base3, _ref, _ref2, _ref3;
      this.connectionOptions = connectionOptions;
      if ((_ref = (_base = this.connectionOptions).host) == null) {
        _base.host = 'localhost';
      }
      if ((_ref2 = (_base2 = this.connectionOptions).port) == null) {
        _base2.port = 5433;
      }
      if ((_ref3 = (_base3 = this.connectionOptions).ssl) == null) {
        _base3.ssl = 'optional';
      }
      this.connected = false;
      this.busy = true;
      this.queue = [];
      this.parameters = {};
      this.key = null;
      this.pid = null;
      this.transactionStatus = null;
      this.incomingData = new Buffer(0);
    }

    Connection.prototype.connect = function(callback) {
      var _this = this;
      this.connectedCallback = callback;
      this.connection = net.createConnection(this.connectionOptions.port, this.connectionOptions.host);
      return this.connection.on('connect', function() {
        _this.connected = true;
        _this._bindEventListeners();
        if (_this.connectionOptions.ssl) {
          _this._writeMessage(new FrontendMessage.SSLRequest);
          return _this.connection.once('data', function(buffer) {
            var conn, sslOptions;
            if ('S' === buffer.toString('utf-8')) {
              sslOptions = {
                key: _this.connectionOptions.sslKey,
                cert: _this.connectionOptions.sslCert,
                ca: _this.connectionOptions.sslCA
              };
              return conn = require('./starttls')(_this.connection, sslOptions, function() {
                if (!conn.authorized && _this.connectionOptions.ssl === 'verified') {
                  conn.end();
                  _this.disconnect();
                  return _this.emit('error', new Error(conn.authorizationError));
                } else {
                  if (!conn.authorized) {
                    _this.emit('warn', conn.authorizationError);
                  }
                  _this.connection = conn;
                  _this._bindEventListeners();
                  return _this._handshake();
                }
              });
            } else if (_this.connectionOptions.ssl === true || _this.connectionOptions.ssl === 'required') {
              return _this.emit('error', new Error("The server does not support SSL connection"));
            } else {
              return _this._handshake();
            }
          });
        } else {
          return _this._handshake();
        }
      });
    };

    Connection.prototype._bindEventListeners = function() {
      this.connection.on('close', this._onClose.bind(this));
      this.connection.on('error', this._onError.bind(this));
      return this.connection.on('timeout', this._onTimeout.bind(this));
    };

    Connection.prototype.disconnect = function() {
      this._writeMessage(new FrontendMessage.Terminate());
      return this.connection.end();
    };

    Connection.prototype.isSSL = function() {
      return (this.connection.pair != null) && (this.connection.encrypted != null);
    };

    Connection.prototype._scheduleJob = function(job) {
      if (this.busy) {
        this.queue.push(job);
        this.emit('queuejob', job);
      } else {
        this._runJob(job);
      }
      return job;
    };

    Connection.prototype._runJob = function(job) {
      if (!this.connected) throw "Connection is closed";
      if (this.busy) throw "Connection is busy";
      this.busy = true;
      job.run();
      return job;
    };

    Connection.prototype._processJobQueue = function() {
      if (this.queue.length > 0) {
        return this._runJob(this.queue.shift());
      } else {
        return this.emit('ready', this);
      }
    };

    Connection.prototype.query = function(sql, callback) {
      return this._scheduleJob(new Query(this, sql, callback));
    };

    Connection.prototype._queryDirect = function(sql, callback) {
      return this._runJob(new Query(this, sql, callback));
    };

    Connection.prototype.copy = function(sql, source, callback) {
      var q;
      q = new Query(this, sql, callback);
      q.copyInSource = source;
      return this._scheduleJob(q);
    };

    Connection.prototype._handshake = function() {
      var authenticationFailureHandler, authenticationHandler;
      var _this = this;
      authenticationFailureHandler = function(err) {
        if (_this.connectedCallback) {
          return _this.connectedCallback(err.message);
        } else {
          return _this.emit('error', err);
        }
      };
      authenticationHandler = function(msg) {
        switch (msg.method) {
          case Authentication.methods.OK:
            return _this.once('ReadyForQuery', function(msg) {
              _this.removeListener('ErrorResponse', authenticationFailureHandler);
              return _this._initializeConnection();
            });
          case Authentication.methods.CLEARTEXT_PASSWORD:
          case Authentication.methods.MD5_PASSWORD:
            _this._writeMessage(new FrontendMessage.Password(_this.connectionOptions.password, msg.method, {
              salt: msg.salt,
              user: _this.connectionOptions.user
            }));
            return _this.once('Authentication', authenticationHandler);
          default:
            throw new Error("Autentication method " + msg.method + " not supported.");
        }
      };
      this.connection.on('data', this._onData.bind(this));
      this._writeMessage(new FrontendMessage.Startup(this.connectionOptions.user, this.connectionOptions.database));
      this.once('ErrorResponse', authenticationFailureHandler);
      this.once('Authentication', authenticationHandler);
      this.on('ParameterStatus', function(msg) {
        return _this.parameters[msg.name] = msg.value;
      });
      this.on('BackendKeyData', function(msg) {
        var _ref;
        return _ref = [msg.pid, msg.key], _this.pid = _ref[0], _this.key = _ref[1], _ref;
      });
      this.on('ReadyForQuery', function(msg) {
        _this.busy = false;
        return _this.transactionStatus = msg.transactionStatus;
      });
      return this.on('ErrorResponse', function(msg) {
        return _this.busy = false;
      });
    };

    Connection.prototype._initializeConnection = function() {
      var chain, initializer, initializers, _i, _len;
      initializers = [];
      if (this.connectionOptions.role != null) {
        initializers.push(this._initializeRoles);
      }
      if (this.connectionOptions.searchPath != null) {
        initializers.push(this._initializeSearchPath);
      }
      if (this.connectionOptions.timezone != null) {
        initializers.push(this._initializeTimezone);
      }
      if (this.connectionOptions.initializer != null) {
        initializers.push(this.connectionOptions.initializer);
      }
      chain = this._initializationSuccess.bind(this);
      for (_i = 0, _len = initializers.length; _i < _len; _i++) {
        initializer = initializers[_i];
        chain = initializer.bind(this, chain, this._initializationFailure.bind(this));
      }
      return chain();
    };

    Connection.prototype._initializeRoles = function(next, fail) {
      var roles;
      var _this = this;
      roles = this.connectionOptions.role instanceof Array ? this.connectionOptions.role : [this.connectionOptions.role];
      return this._queryDirect("SET ROLE " + (roles.join(', ')), function(err, result) {
        if (err != null) {
          return fail(err);
        } else {
          return next();
        }
      });
    };

    Connection.prototype._initializeSearchPath = function(next, fail) {
      var searchPath;
      var _this = this;
      searchPath = this.connectionOptions.searchPath instanceof Array ? this.connectionOptions.searchPath : [this.connectionOptions.searchPath];
      return this._queryDirect("SET SEARCH_PATH TO " + (searchPath.join(', ')), function(err, result) {
        if (err != null) {
          return fail(err);
        } else {
          return next();
        }
      });
    };

    Connection.prototype._initializeTimezone = function(next, fail) {
      var _this = this;
      return this._queryDirect("SET TIMEZONE TO '" + this.connectionOptions.timezone + "'", function(err, result) {
        if (err != null) {
          return fail(err);
        } else {
          return next();
        }
      });
    };

    Connection.prototype._initializationSuccess = function() {
      this.on('ReadyForQuery', this._processJobQueue.bind(this));
      this._processJobQueue();
      if (this.connectedCallback) return this.connectedCallback(null, this);
    };

    Connection.prototype._initializationFailure = function(err) {
      if (this.connectedCallback) {
        return this.connectedCallback(err);
      } else {
        return this.emit('error', err);
      }
    };

    Connection.prototype._onData = function(buffer) {
      var bufferedData, message, size, _results;
      if (this.incomingData.length === 0) {
        this.incomingData = buffer;
      } else {
        bufferedData = new Buffer(this.incomingData.length + buffer.length);
        this.incomingData.copy(bufferedData);
        buffer.copy(bufferedData, this.incomingData.length);
        this.incomingData = bufferedData;
      }
      size = this.incomingData.readUInt32(1);
      _results = [];
      while (this.incomingData.length >= 5 && size + 1 <= this.incomingData.length) {
        message = BackendMessage.fromBuffer(this.incomingData.slice(0, size + 1));
        if (this.debug) console.log('<=', message.event, message);
        this.emit('message', message);
        this.emit(message.event, message);
        this.incomingData = this.incomingData.slice(size + 1);
        _results.push(size = this.incomingData.readUInt32(1));
      }
      return _results;
    };

    Connection.prototype._onClose = function(error) {
      this.connected = false;
      return this.emit('close', error);
    };

    Connection.prototype._onTimeout = function() {
      return this.emit('timeout');
    };

    Connection.prototype._onError = function(exception) {
      return this.emit('error', exception);
    };

    Connection.prototype._writeMessage = function(msg, callback) {
      if (this.debug) console.log('=>', msg.__proto__.constructor.name, msg);
      return this.connection.write(msg.toBuffer(), null, callback);
    };

    return Connection;

  })();

  module.exports = Connection;

}).call(this);
