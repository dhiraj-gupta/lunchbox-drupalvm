var Q = require('q');
var fs = require('fs');

var boot = require('./js/boot.js');

/**
 * Constructor.
 * 
 * @param {[type]} plugin [description]
 * @param {[type]} dialog [description]
 */
var DrupalVM = function (plugin, dialog) {
  if (typeof plugin.settings == 'undefined') {
    plugin.settings = {};
  }

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
        template +=   '<a href="#" class="drupalvm-provision">Run this now.</a>';
        template += '</div>';

    $('#' + this.gn_name).append(template);
  }

  // control actions; must be unique relative to each other
  this.CONTROL_START = 0;
  this.CONTROL_STOP = 1;
  this.CONTROL_PROVISION = 2;
  this.CONTROL_RELOAD = 3;

  // possible VM states; binary flags - must be unique powers of 2
  this._RUNNING = 1;
  this._NEEDS_PROVISION = 2;

  // default state
  this.state = 0;

  // set default settings structure
  if (!this.plugin.settings) {
    this.plugin.settings = {
      needs_provision: false
    };
  }

  // do we need to run provision?
  if (this.plugin.settings.needs_provision) {
    this.state += this._NEEDS_PROVISION;
  }

  // promises for later use
  this.detected = Q.defer();
  this.loadedConfig = Q.defer();
  this.checkedState = Q.defer();
  this.controlChain = Q.fcall(function (){});

  // associate actions with their respective events
  this.bindEvents();
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
  ];

  return operations;
};

/**
 * Shows alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.showProvisionNotice = function () {
  if (!this.plugin.settings.needs_provision) {
    this.setProvision(true);
  }

  $('#' + this.gn_name + ' .reprovision-alert').show('fast');
};

/**
 * Hides alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.hideProvisionNotice = function () {
  if (this.plugin.settings.needs_provision) {
    this.setProvision(false);
  }

  $('#' + this.gn_name + ' .reprovision-alert').hide('fast');
};

/**
 * Updates reprovision status in settings.
 * 
 * @param {[type]}   status   [description]
 * @param {Function} callback [description]
 */
DrupalVM.prototype.setProvision = function (status, callback) {
  callback = callback || function () {};

  this.plugin.settings.needs_provision = status;

  window.lunchbox.settings.save(callback);
};

/**
 * Returns an array describing the plugin's navigation.
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.getNav = function () {
  var status_text = this.state & this._RUNNING ? 'Running' : 'Stopped';

  var nav = {
    title: 'Drupal VM <span class="drupalvm-status">' + status_text + '</span>',
    items: [
      {
        href: 'views/dashboard/dashboard.html',
        name: 'dashboard',
        text: '<i class="fa fa-drupal"></i> Dashboard'
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
        self.home = parts[4];

        self.state += parts[3] == 'running' ? self._RUNNING : 0;
        self.stateChange();

        self.detected.resolve();

        return;
      }
    }

    var boxLog = function(message) {
      $('#drupalvm_plugin_dialog_log').append(message + '\n');
    };

    var resolveSetup = function(home_path) {
      boxLog('Done setting up DrupalVM');
      self.home = home_path;
      self.detected.resolve();
      setTimeout(function() {
        box.modal('hide'); // only close if everything succeeds
      }, 1000);
    };

    var cloneDrupalVM = function() {
      boxLog('Cloning DrupalVM');
      var clone_path = window.lunchbox.user_data_path + '/drupalvm';
      var git_path = 'https://github.com/geerlingguy/drupal-vm.git';

      boxLog('Cloning DrupalVM from ' + git_path);

      var child = spawn('git', ['clone', git_path, clone_path]);

      child.on('exit', function (exit_code) {
        if (exit_code) {
          boxLog('Could not clone DrupalVM Git repository to ' + clone_path);
          return;
        }

        boxLog('Cloned DrupalVM to ' + clone_path);
        var setupConfigFile = function() {
          boxLog('Setting up config file');
          fs.readFile(clone_path + '/example.config.yml', 'utf-8', function(err, data) {
            if (err) {
              boxLog(err);
            }
            else {
              var newValue = data.replace('~/Sites/drupalvm', window.lunchbox.user_data_path + '/drupalvm');
              newValue = newValue.replace('build_makefile: true', 'build_makefile: false');
              fs.writeFile(clone_path + '/config.yml', newValue, 'utf-8', function(err) {
                if (err) {
                  boxLog(err);
                }
                else {
                  setupMakeFile();
                }
              });
            }
          });
        };

        var setupMakeFile = function() {
          boxLog('Setting up make file');
          fs.readFile(clone_path + '/example.drupal.make.yml', 'utf-8', function(err, data) {
            if (err) {
              boxLog(err);
              return;
            }

            fs.writeFile(clone_path + '/drupal.make.yml', data, 'utf-8', function(err) {
              if (err) {
                boxLog(err);
                return;
              }

              resolveSetup(clone_path);
            });
          });
        };

        setupConfigFile();
      });
    };

    var setDrupalVMLocation = function() {
      bootbox.prompt('Please enter the full path to your DrupalVM directory.', function(path) {
        if (path === null) {
          return;
        }

        if (path.charAt(path.length - 1) == '/' || path.charAt(path.length - 1) == '\\') {
          path = path.slice(0, -1);
        }

        var checkPath = function() {
          boxLog('Checking if ' + path + ' is a valid directory');
          fs.lstat(path, function(err, stats) {
            if (err) {
              boxLog(err);
            }
            else if (!stats.isDirectory()) {
              boxLog(path + ' is not a valid directory');
            }
            else {
              checkVagrantfile();
            }
          });
        }; // checkPath

        // make sure Vagrantfile exists
        var checkVagrantfile = function() {
          boxLog('Checking if Vagrantfile exists');
          fs.lstat(path + '/Vagrantfile', function(err, stats) {
            if (err) {
              boxLog(err);
            }
            else if (!stats.isFile()) {
              boxLog('Vagrantfile does not exist at ' + path);
            }
            else {
              checkConfigFile();
            }
          });
        }; // checkVagrantfile

        // check if config file is already set up
        var checkConfigFile = function() {
          boxLog('Checking if configuration file exists');
          fs.lstat(path + '/config.yml', function(err, stats) {
            if (err) {
              boxLog(err);
            }
            else if (!stats.isFile()) {
              checkExampleConfigFile();
            }
            else {
              checkMakeFile();
            }
          });
        }; // checkConfigFile

        // make sure the example config file exists
        var checkExampleConfigFile = function() {
          boxLog('Checking if example configuration file exists');
          fs.lstat(path + '/example.config.yml', function(err, stats) {
            if (err) {
              boxLog(err);
            }
            else if (!stats.isFile()) {
              boxLog('Could not locate configuration file at ' + path);
            }
            else {
              generateConfigFile();
            }
          });
        }; // checkExampleConfigFile

        // generate config file from example
        var generateConfigFile = function() {
          boxLog('Setting up configuration file from example file');
          fs.readFile(path + '/example.config.yml', 'utf-8', function(err, data) {
            if (err) {
              boxLog(err);
              return;
            }

            var newValue = data.replace('~/Sites/drupalvm', process.cwd() + '/drupalvm');
            newValue = newValue.replace('build_makefile: true', 'build_makefile: false');
            fs.writeFile(path + '/config.yml', newValue, 'utf-8', function(err) {
              if (err) {
                boxLog(err);
                return;
              }

              checkMakeFile();
            })
          });
        }; // generateConfigFile

        // check if make file is already set up
        var checkMakeFile = function() {
          boxLog('Checking if make file exists');
          fs.lstat(path + '/drupal.make.yml', function(err, stats) {
            if (err) {
              boxLog(err);
            }
            else if (!stats.isFile()) {
              checkExampleMakeFile();
            }
            else {
              resolveSetup(path);
            }
          });
        }; // checkMakeFile

        // make sure the example make file exists
        var checkExampleMakeFile = function() {
          boxLog('Checking if example make file exists');
          fs.lstat(path + '/example.drupal.make.yml', function(err, stats) {
            if (err) {
              boxLog(err);
            }
            else if (!stats.isFile()) {
              boxLog('Could not locate make file at ' + path);
            }
            else {
              generateMakeFile();
            }
          });
        }; // checkExampleMakeFile

        // generate make file from example
        var generateMakeFile = function() {
          boxLog('Setting up make file from example file');
          fs.readFile(path + '/example.drupal.make.yml', 'utf-8', function(err, data) {
            if (err) {
              boxLog(err);
              return;
            }

            fs.writeFile(path + '/drupal.make.yml', data, 'utf-8', function(err) {
              if (err) {
                boxLog(err);
                return;
              }

              resolveSetup(path);
            });
          });
        }; // generateMakeFile

        checkPath();
      }); // bootbox.prompt
    };

    var box = bootbox.dialog({
      closeButton: false,
      title: 'Could not find "drupalvm" virtualbox.',
      message: ''
        + '<div>'
        +   '<label for="btnClone">Clone DrupalVM from GitHub? </label>'
        +   '<button id="btnClone" class="btn btn-primary" style="float: right;">Clone</button>'
        + '</div>'
        + '<hr/>'
        + '<div>'
        +   '<label for="btnSetLoc">Show us where DrupalVM is installed? </label>'
        +   '<button id="btnSetLoc" class="btn btn-primary" style="float: right;">Set Location</button>'
        + '</div>'
        + '<hr/>'
        + '<pre id="drupalvm_plugin_dialog_log"></pre>'
        + '',
      buttons: {
        cancel: {
          label: "Cancel",
          className: "btn-default",
          callback: function () {
            self.detected.reject('Could not find "drupalvm" VM.');
          }
        }
      }
    });

    $('#btnClone').on('click', function() {
      cloneDrupalVM();
    });
    
    $('#btnSetLoc').on('click', function() {
      setDrupalVMLocation();
    });
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
DrupalVM.prototype.checkState = function () {
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
        self.checkedState.reject('Encountered problem while running "vagrant status".');
        return;
      }

      self.state += (stdout.indexOf('running') !== -1) ? self._RUNNING : 0;
      self.stateChange();

      self.checkedState.resolve();
    });
  });

  return this.checkedState.promise;
};

/**
 * Binds event handlers for common actions.
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.bindEvents = function () {
  var self = this;

  $('.drupalvm-start').off('click');
  $('.drupalvm-start').click(function (e) {
    e.preventDefault();

    self.start();
  });

  $('.drupalvm-stop').off('click');
  $('.drupalvm-stop').click(function (e) {
    e.preventDefault();

    self.stop();
  });

  $('.drupalvm-provision').off('click');
  $('.drupalvm-provision').click(function (e) {
    e.preventDefault();

    self.provision();
  });
};

/**
 * Updates UI elements based on current VM state
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.stateChange = function () {
  // sanity check
  if (this.state < 0) {
    this.state = 0;
  }

  // check running state
  var status_el = $('#nav-' + this.unique_name + ' .title .drupalvm-status')
  if (this.state & this._RUNNING) {
    $('.drupalvm-start').addClass('disabled');
    $('.drupalvm-stop').removeClass('disabled');

    status_el.text('Running');
  }
  else {
    $('.drupalvm-start').removeClass('disabled');
    $('.drupalvm-stop').addClass('disabled');
    
    status_el.text('Stopped');
  }

  // check provisioning state
  if (this.state & this._NEEDS_PROVISION) {
    this.showProvisionNotice();
  }
};

/**
 * Starts VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.start = function () {
  var self = this;

  if (!(this.state & this._RUNNING)) {
    this.control(this.CONTROL_STOP).then(function () {
      console.log('started');

      self.state += self._RUNNING;
      self.stateChange();
    });
  }
};

/**
 * Stops VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.stop = function () {
  var deferred = Q.defer();

  var self = this;
  if (this.state & this._RUNNING) {
    var dialog = load_mod('components/dialog').create('Stopping VM');

    var sudo = require('sudo-prompt');

    var options = {
      name: 'DrupalVM',
      onChildProcess: function (child) {
        child.on('exit', function (exitCode) {
          if (exitCode !== 0) {
            deferred.reject('Could not stop VM. Exit code:' + exitCode);
            return;
          }

          console.log('Finished STOP. Exit code: ' + exitCode);

          self.state -= self._RUNNING;
          self.stateChange();

          deferred.resolve();
        });
      }
    };

    sudo.exec('vagrant halt ' + this.id, options, function (error, stdout, stderr) {
      console.log('error:');
      console.log(error);

      console.log('');

      console.log('stdout:');
      console.log(stdout);

      console.log('');

      console.log('stderr:');
      console.log(stderr);
    });
  }

  return deferred.promise;
};

/**
 * Provisions VM
 * 
 * @return {[type]} [description]
 */
DrupalVM.prototype.provision = function () {
  var self = this;

  if (this.state & this._NEEDS_PROVISION) {
    this.control(this.CONTROL_PROVISION).then(function () {
      console.log('finished provisioning');

      self.state -= self._NEEDS_PROVISION;
      self.stateChange();

      self.hideProvisionNotice();
    });
  }
};

DrupalVM.prototype.control = function (action) {
  var deferred = Q.defer();
  this.controlChain = this.controlChain.then(deferred.promise);

  // var creator_uid_path = this.home + '/.vagrant/machines/drupalvm/virtualbox/creator_uid';
  // var creator_uid = fs.readFileSync(creator_uid_path);

  // fs.writeFileSync(creator_uid_path, '0');

  var self = this;
  var title = '';
  var cmd = '';

  switch (action) {
    case this.CONTROL_START:
      cmd = 'up'
      title = 'Starting VM';
      break;

    case this.CONTROL_STOP:
      cmd = 'halt';
      title = 'Stopping VM';
      break;

    case this.CONTROL_PROVISION:
      cmd = 'provision';
      title = 'Re-provisioning VM';
      break;

    case this.CONTROL_RELOAD:
      cmd = 'reload';
      title = 'Reloading VM';
      break;
  }

  var spawn = require('child_process').spawn;
  var child = spawn('sudo', ['-S', 'vagrant', cmd, this.id]);

  console.log('running: vagrant ' + cmd + ' ' + this.id);

  var dialog = load_mod('components/dialog').create(title);
  dialog.setChildProcess(child);
  dialog.logProcess(child);

  child.on('exit', function (exitCode) {
    if (exitCode !== 0) {
      deferred.reject('Encountered problem while running "vagrant ' + cmd + ' ' + self.id + '".');
      return;
    }

    switch (action) {
      case self.CONTROL_START:
        if (!(self.state & self._NEEDS_PROVISION)) {
          self.checkState();
          deferred.resolve();

          break;
        }

        self.controlChain = self.controlChain.then(self.control(self.CONTROL_PROVISION));
        deferred.resolve();

        break;

      case self.CONTROL_STOP:
      case self.CONTROL_RELOAD:
        self.checkState();
        deferred.resolve();

        break;

      case self.CONTROL_PROVISION:
        self.hideProvisionNotice();

        self.checkState();
        deferred.resolve();

        break;
    }
  });

  // fs.writeFileSync(creator_uid_path, creator_uid);

  return this.controlChain;
};

module.exports = DrupalVM;
