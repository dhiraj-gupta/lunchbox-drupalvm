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

  // set default settings structure
  if (!this.plugin.settings) {
    this.plugin.settings = {
      needs_reprovision: false
    };
  }

  this.vm = new VM(this);
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
    boot.checkProvisionStatus,
    boot.checkPrerequisites,
    boot.detectDrupalVM,
    boot.updateVMStatus
  ];

  return operations;
};

/**
 * Shows alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.showReprovisionNotice = function () {
  if (!this.vm.needs_reprovision) {
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
  if (this.vm.needs_reprovision) {
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

  this.vm.needs_reprovision = status;

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
 * VM Class. An instance of this is created in DrupalVM's constructor.
 * 
 * @param {[type]} drupalvm [description]
 */
var VM = function (drupalvm) {
  this.drupalvm = drupalvm;
  this.plugin_settings = this.drupalvm.plugin.settings;

  if (this.plugin_settings.needs_reprovision) {
    this.showReprovisionNotice();
  }
};

/**
 * Shows alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
VM.prototype.showReprovisionNotice = function () {
  console.log('called this');
};

VM.prototype.detect = function () {
  var self = this;
  var deferred = Q.defer();

  var spawn = require('child_process').spawn;
  var child = spawn('vagrant', ['global-status']);

  var stdout = '';
  var write = function (buffer) {
    stdout += buffer.toString('utf8');
  };

  child.stdout.on('data', write);
  child.stderr.on('data', write);

  child.on('exit', function (exitCode) {
    if (exitCode !== 0) {
      deferred.reject('Encountered problem while running "vagrant global-status".');
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
        self.state = parts[3];
        self.home = parts[4];

        deferred.resolve();

        return;
      }
    }

    deferred.reject('Could not find "drupalvm" VM.');
  });

  return deferred.promise;
};



// DrupalVM.prototype.vm = (function (plugin) {
//   console.log('vm obj');


//   const STATE_STOPPED = 0;
//   const STATE_RUNNING = 1;
//   const STATE_NEEDS_REPROVISION = 2;

//   var state = STATE_STOPPED;

//   function control (new_state) {

//   };

//   return {
//     /**
//      * Checks VM status from the VM.
//      * 
//      * @return {[type]} [description]
//      */
//     getStatus: function () {
//       var spawn = require('child_process').spawn;
//       var child = spawn('vagrant', ['status', plugin.settings.vm.id]);

//       var stdout = '';
//       dialog.logProcess(child, function (output) {
//         stdout += output;
//       }, false);
//     },

//     stop: function () {
//       control(STATE_STOPPED);
//     },

//     start: function () {
//       control(STATE_RUNNING);
//     },

//     provision: function () {
//       control(STATE_NEEDS_REPROVISION);
//     }
//   };
// })(this);

module.exports = DrupalVM;
