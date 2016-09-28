// define the required dependent globals for testing
global.window = {};
global.jQuery = require('jquery');
global._ = require('underscore');
global.Backbone = require('backbone');

// load the orb dependency
require('../src/all.js');

global.orb = global.window.orb;