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

  // set default plugin settings
  if (!this.plugin.settings) {
    this.plugin.settings = {
      vm: {
        needs_reprovision: true,
      }
    };
  }

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
  if (!this.plugin.settings.vm.needs_reprovision) {
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
  if (this.plugin.settings.vm.needs_reprovision) {
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

  this.plugin.settings.vm.needs_reprovision = status;

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

module.exports = DrupalVM;
