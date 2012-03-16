(function() {
  var VerticaDate, VerticaInterval, VerticaTime, VerticaTimestamp, binaryDecoders, binaryEncoders, padWithZeroes, stringDecoders, stringEncoders;

  padWithZeroes = function(str, length) {
    var res;
    res = "" + str;
    while (res.length < length) {
      res = "0" + res;
    }
    return res;
  };

  exports.typeOIDs = {
    4: "string",
    5: "boolean",
    6: "integer",
    7: "real",
    8: "string",
    9: "string",
    10: "date",
    11: "time",
    12: "timestamp",
    13: "timestamp",
    14: "interval",
    15: "time",
    16: "numeric",
    25: "string",
    1043: "string",
    20: "integer",
    21: "integer",
    23: "integer",
    26: "integer",
    700: "integer",
    701: "integer",
    1700: "real"
  };

  VerticaDate = (function() {

    function VerticaDate(year, month, day) {
      this.year = +year;
      this.month = +month;
      this.day = +day;
    }

    VerticaDate.prototype.toDate = function() {
      return new Date(this.year, this.month - 1, this.day);
    };

    VerticaDate.prototype.toString = function() {
      return "" + (padWithZeroes(this.year, 4)) + "-" + (padWithZeroes(this.month, 2)) + "-" + (padWithZeroes(this.day, 2));
    };

    VerticaDate.prototype.sqlQuoted = function() {
      return "'" + (this.toString()) + "'::date";
    };

    VerticaDate.prototype.toJSON = function() {
      return this.toString();
    };

    return VerticaDate;

  })();

  VerticaDate.fromStringBuffer = function(buffer) {
    var matches;
    if (matches = buffer.toString('ascii').match(/^(\d{4})-(\d{2})-(\d{2})$/)) {
      return new VerticaDate(matches[1], matches[2], matches[3]);
    } else {
      throw 'Invalid date format!';
    }
  };

  VerticaDate.fromDate = function(date) {
    return new VerticaDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  };

  exports.Date = VerticaDate;

  VerticaTime = (function() {

    function VerticaTime(hour, minute, second) {
      this.hour = +hour;
      this.minute = +minute;
      this.second = +second;
    }

    VerticaTime.prototype.toString = function() {
      return "" + (padWithZeroes(this.hour, 2)) + ":" + (padWithZeroes(this.minute, 2)) + ":" + (padWithZeroes(this.second, 2));
    };

    VerticaTime.prototype.sqlQuoted = function() {
      return "'" + (this.toString()) + "'::time";
    };

    VerticaTime.prototype.toJSON = function() {
      return this.toString();
    };

    return VerticaTime;

  })();

  VerticaTime.fromStringBuffer = function(buffer) {
    var matches;
    if (matches = buffer.toString('ascii').match(/^(\d{2}):(\d{2}):(\d{2})$/)) {
      return new VerticaTime(matches[1], matches[2], matches[3]);
    } else {
      throw 'Invalid time format!';
    }
  };

  exports.Time = VerticaTime;

  VerticaTimestamp = {
    fromStringBuffer: function(buffer) {
      var matches, timestampRegexp, timezoneOffset, utc;
      timezoneOffset = require('./vertica');
      timestampRegexp = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?(?:([\+\-])(\d{2})(?:\:(\d{2}))?)?$/;
      if (matches = buffer.toString('ascii').match(timestampRegexp)) {
        utc = Date.UTC(+matches[1], +matches[2] - 1, +matches[3], +matches[4], +matches[5], +matches[6], Math.round(+matches[7] * 1000) || 0);
        if (matches[8]) {
          timezoneOffset = +matches[9] * 60 + (+matches[10] || 0);
          if (matches[8] === '-') timezoneOffset = 0 - timezoneOffset;
          utc -= timezoneOffset * 60 * 1000;
        } else if (VerticaTimestamp.timezoneOffset) {
          utc -= VerticaTimestamp.timezoneOffset;
        }
        return new Date(utc);
      } else {
        throw 'Invalid timestamp string returned';
      }
    },
    setTimezoneOffset: function(offset) {
      var matches, timezoneOffset;
      if (!(offset != null)) {
        return VerticaTimestamp.timezoneOffset = null;
      } else if (matches = offset.match(/^([\+\-])(\d{1,2})(?:\:(\d{2}))?$/)) {
        timezoneOffset = +matches[2] * 60 + (+matches[3] || 0);
        if (matches[1] === '-') timezoneOffset = 0 - timezoneOffset;
        return VerticaTimestamp.timezoneOffset = timezoneOffset * 60 * 1000;
      } else {
        throw "Invalid timezone offset string: " + offset + "!";
      }
    }
  };

  exports.Timestamp = VerticaTimestamp;

  VerticaInterval = (function() {

    function VerticaInterval(days, hours, minutes, seconds) {
      if (days != null) this.days = +days;
      if (hours != null) this.hours = +hours;
      if (minutes != null) this.minutes = +minutes;
      if (seconds != null) this.seconds = +seconds;
    }

    VerticaInterval.prototype.inDays = function() {
      var days;
      days = 0;
      if (this.days) days += this.days;
      if (this.hours) days += this.hours / 24;
      if (this.minutes) days += this.minutes / (24 * 60);
      if (this.seconds) return days += this.seconds / (24 * 60 / 60);
    };

    VerticaInterval.prototype.inSeconds = function() {
      var seconds;
      seconds = 0;
      if (this.days) seconds += this.days * 60 * 60 * 24;
      if (this.hours) seconds += this.hours * 60 * 60;
      if (this.minutes) seconds += this.minutes * 60;
      if (this.seconds) return seconds += this.seconds;
    };

    VerticaInterval.prototype.inMilliseconds = function() {
      return this.inSeconds() * 1000;
    };

    VerticaInterval.prototype.inMicroseconds = function() {
      return this.inSeconds() * 1000000;
    };

    VerticaInterval.prototype.toJSON = function() {
      return {
        days: this.days,
        hours: this.hours,
        minutes: this.minutes,
        seconds: this.seconds
      };
    };

    VerticaInterval.prototype.sqlQuoted = function() {
      throw 'Not yet implemented';
    };

    return VerticaInterval;

  })();

  VerticaInterval.fromStringBuffer = function(buffer) {
    var matches;
    if (matches = buffer.toString('ascii').match(/^(\d+)?\s?(?:(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?$/)) {
      return new VerticaInterval(matches[1], matches[2], matches[3], matches[4]);
    } else {
      throw 'Invalid interval format!';
    }
  };

  exports.Interval = VerticaInterval;

  stringDecoders = {
    string: function(buffer) {
      return buffer.toString();
    },
    integer: function(buffer) {
      return +buffer;
    },
    real: function(buffer) {
      return parseFloat(buffer);
    },
    numeric: function(buffer) {
      return parseFloat(buffer);
    },
    boolean: function(buffer) {
      return buffer.toString() === 't';
    },
    date: function(buffer) {
      return VerticaDate.fromStringBuffer(buffer);
    },
    time: function(buffer) {
      return VerticaTime.fromStringBuffer(buffer);
    },
    interval: function(buffer) {
      return VerticaInterval.fromStringBuffer(buffer);
    },
    timestamp: function(buffer) {
      return VerticaTimestamp.fromStringBuffer(buffer);
    },
    "default": function(buffer) {
      return buffer.toString();
    }
  };

  binaryDecoders = {
    string: function(buffer) {
      return buffer.toString();
    },
    "default": function(buffer) {
      throw 'Binary decoders not yet supported!';
    }
  };

  exports.decoders = {
    0: stringDecoders,
    1: binaryDecoders,
    'string': stringDecoders,
    'binary': binaryDecoders
  };

  stringEncoders = {
    string: function(value) {
      return value.toString();
    },
    boolean: function(value) {
      if (value) {
        return 't';
      } else {
        return 'f';
      }
    },
    "default": function(value) {
      return value.toString();
    }
  };

  binaryEncoders = {
    "default": function(buffer) {
      throw 'Binary encoders not yet supported!';
    }
  };

  exports.encoders = {
    0: stringEncoders,
    1: binaryEncoders,
    'string': stringEncoders,
    'binary': binaryEncoders
  };

}).call(this);