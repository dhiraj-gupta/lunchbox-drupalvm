var Q = require('q');

var boot = require('./js/boot.js');

/**
 * Constructor.
 * 
 * @param {[type]} plugin [description]
 * @param {[type]} dialog [description]
 */
var DrupalVM = function (plugin, dialog) {
  // call parent constructor
  LunchboxPlugin.call(this, plugin, dialog);

  // load CSS dependencies
  this.addCSS('css/drupalvm.css');

  // global notices wrapper dom name
  this.gn_name = 'global-notices-' + this.getUniqueName();

  // create reprovision alert DOM
  var global_notices = $('#global-notices');
  if (global_notices.length) {
    global_notices.append('<div id="' + this.gn_name + '"></div>');

    var template =  '<div class="reprovision-alert alert alert-warning" style="display: none;" role="alert">';
        template +=   '<strong>' + this.plugin.name_nice + '</strong> needs to be re-provisioned with your new settings. ';
        template +=   '<a href="#" id="reprovision-trigger">Run this now.</a>';
        template += '</div>';

    $('#' + this.gn_name).append(template);
  }

  // possible VM states
  this._STOPPED = 1;
  this._RUNNING = 2;
  this._NEEDS_REPROVISION = 4;

  // default state
  this.status = this._STOPPED;

  // set default settings structure
  if (!this.plugin.settings) {
    this.plugin.settings = {
      needs_reprovision: false
    };
  }

  // show the reprovision notice
  if (this.plugin.settings.needs_reprovision) {
    this.showReprovisionNotice();
  }

  // promises for later use
  this.detected = Q.defer();
  this.loadedConfig = Q.defer();
  this.checkedStatus = Q.defer();
};

DrupalVM.prototype = Object.create(LunchboxPlugin.prototype);
DrupalVM.prototype.constructor = DrupalVM;

/**
 * Return an array of bootup operations.
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.getBootOps = function () {
  var operations = [
    boot.checkPrerequisites,
    boot.detectVM,
    boot.loadVMConfig
    // , boot.checkVMStatus
  ];

  return operations;
};

/**
 * Shows alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.showReprovisionNotice = function () {
  if (!this.plugin.settings.needs_reprovision) {
    this.setReprovision(true);
  }

  $('#' + this.gn_name + ' .reprovision-alert').show('fast');
};

/**
 * Hides alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.hideReprovisionNotice = function () {
  if (this.plugin.settings.needs_reprovision) {
    this.setReprovision(false);
  }

  $('#' + this.gn_name + ' .reprovision-alert').hide('fast');
};

/**
 * Updates reprovision status in settings.
 * 
 * @param {[type]}   status   [description]
 * @param {Function} callback [description]
 */
DrupalVM.prototype.setReprovision = function (status, callback) {
  callback = callback || function () {};

  this.plugin.settings.needs_reprovision = status;

  window.lunchbox.settings.save(callback);
};

/**
 * Returns an array describing the plugin's navigation.
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.getNav = function () {
  var nav = {
    title: 'Drupal VM',
    items: [
      {
        href: 'views/dashboard/dashboard.html',
        name: 'dashboard',
        text: '<i class="fa fa-drupal"></i> Dashboard',
      },
      {
        href: 'views/settings/settings.html',
        name: 'settings',
        text: '<i class="fa fa-cogs"></i> Settings',
      },
      {
        href: 'views/sites/sites.html',
        name: 'sites',
        text: '<i class="fa fa-globe"></i> Sites',
      },
      {
        href: 'views/tools/tools.html',
        name: 'tools',
        text: '<i class="fa fa-wrench"></i> Tools',
      }
    ],
  };

  return nav;
};

/**
 * Called during save operations. We remove items from settings that we
 * do not want to save.
 * 
 * @param  {[type]} settings [description]
 * @return {[type]}          [description]
 */
DrupalVM.prototype.preSave = function (settings) {
  if (settings) {
    //
  }
};

/**
 * Sets vagrant-related variables based on output of "vagrant global-status"
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.detect = function () {
  var spawn = require('child_process').spawn;
  var child = spawn('vagrant', ['global-status']);

  // save buffer output
  var stdout = '';
  var write = function (buffer) {
    stdout += buffer.toString('utf8');
  };

  child.stdout.on('data', write);
  child.stderr.on('data', write);

  var self = this;
  child.on('exit', function (exitCode) {
    if (exitCode !== 0) {
      self.detected.reject('Encountered problem while running "vagrant global-status".');
      return;
    }

    // search for the drupalvm entry and parse it
    var lines = stdout.split("\n");
    for (var x in lines) {
      var parts = lines[x].split(/\s+/);

      // Sample: d21e8e6  drupalvm virtualbox poweroff /home/nate/Projects/drupal-vm
      if (parts.length >= 5 && parts[1] == 'drupalvm') {
        self.id = parts[0];
        self.name = parts[1];
        self.state = parts[3] == 'running' ? self._RUNNING : self._STOPPED;
        self.home = parts[4];

        self.detected.resolve();

        return;
      }
    }

    self.detected.reject('Could not find "drupalvm" VM.');
  });

  return this.detected.promise;
};

/**
 * Loads configuration file for current VM.
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.loadConfig = function () {
  var self = this;

  // VM must first be detected so we have the home path
  this.detected.promise.then(function () {
    self.config = new GenericSettings(self.home + '/config.yml');

    self.config.load(function (error, data) {
      if (error !== null) {
        self.loadedConfig.reject(error);
        return;
      }

      self.loadedConfig.resolve();
    });
  });

  return this.loadedConfig.promise;
};

/**
 * Checks whether the VM is currently running or not.
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.checkStatus = function () {
  var self = this;

  // VM must first be detected so we have its ID
  this.detected.promise.then(function () {
    var spawn = require('child_process').spawn;
    var child = spawn('vagrant', ['status', self.id]);

    // save buffer output
    var stdout = '';
    var write = function (buffer) {
      stdout += buffer.toString('utf8');
    };

    child.stdout.on('data', write);
    child.stderr.on('data', write);

    child.on('exit', function (exitCode) {
      if (exitCode !== 0) {
        self.checkedStatus.reject('Encountered problem while running "vagrant status".');
        return;
      }

      // Search for the status
      if (stdout.indexOf('poweroff') > -1) {
        $('#drupalvm_start').removeClass('disabled');
        $('#drupalvm_stop').addClass('disabled');
        $('.drupalVMHeaderStatus').text("Stopped");

        drupalvm_running = false;
      }
      else {
        $('#drupalvm_start').addClass('disabled');
        $('#drupalvm_stop').removeClass('disabled');
        $('.drupalVMHeaderStatus').text("Running");

        drupalvm_running = true;
      }

      self.checkedStatus.resolve();
    });
  });

  return this.checkedStatus.promise;
};

module.exports = DrupalVM;
