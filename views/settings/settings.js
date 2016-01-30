var storage = load_mod('internal/storage');

var settings = null;

$(document).ready(function () {
  console.log('loaded settings.js in DrupalVM plugin');

  settings = window.lunchbox.settings;

  // populate settings vm form
  var vagrant_ip = $("input[name=vagrant_ip]");
  vagrant_ip.val(settings.vm.config.vagrant_ip);

  var vagrant_hostname = $("input[name=vagrant_hostname]");
  vagrant_hostname.val(settings.vm.config.vagrant_hostname);

  var vagrant_synced_folders = $("input[name=vagrant_synced_folders]");
  vagrant_synced_folders.val(settings.vm.config.vagrant_synced_folders[0].local_path);
  
  var vagrant_memory = $("input[name=vagrant_memory]");
  vagrant_memory.val(settings.vm.config.vagrant_memory);
  
  var vagrant_cpus = $("input[name=vagrant_cpus]");
  vagrant_cpus.val(settings.vm.config.vagrant_cpus);

  /*
  // setup filesync method widget & activate selected item
  var filesync_wrap = $('#filesync_method')
  if (filesync_wrap) {
    var filesync = settings.vm.config.vagrant_synced_folders[0].type;
    if (!filesync) {
      filesync = 'default';
    }

    setFilesync(filesync);
    function setFilesync(value) {
      filesync_wrap.find('label').removeClass('active');
      filesync_wrap.find('label input[type=radio]').removeAttr('checked');

      var input = filesync_wrap.find('label input[type=radio][value=' + value + ']');
      input.attr('checked', 'checked');
      input.parent().addClass('active');
    }

    filesync_wrap.find('label').each(function (i, label) {
      label = $(label);
      label.click(function (e) {
        e.preventDefault();

        setFilesync(label.find('input[type=radio]').attr('value'));
      });
    });
  }

  // populate installed extras form
  var extras = $('#installed_extras');
  extras.find('input[name=installed_extras]').removeAttr('checked'); // reset
  if (settings.vm.config.installed_extras) {
    settings.vm.config.installed_extras.forEach(function (item) {
      extras.find('input[type=checkbox][value=' + item + ']').attr('checked', 'checked');
    });
  }

  // callback for use with storage.save();
  var save_callback = function (error, data) {
    storage_save_callback(error, data);

    if (error !== null) {
      return;
    }

    // reload view & show notice
    $('#menu_drupalvm_settings a').click();
    show_reprovision_notice();
  };

  // form actions
  $('#save_settings').click(function (e) {
    e.preventDefault();

    // set general vagrant info
    settings.vm.config.vagrant_ip = vagrant_ip.val();
    settings.vm.config.vagrant_hostname = vagrant_hostname.val();
    settings.vm.config.vagrant_synced_folders[0].local_path = vagrant_synced_folders.val();
    settings.vm.config.vagrant_memory = vagrant_memory.val();
    settings.vm.config.vagrant_cpus = vagrant_cpus.val();

    // set synced folders
    var synced_folders = $('input[name=filesync_method]:checked').val();
    if (synced_folders == 'default') {
      synced_folders = '';
    }

    settings.vm.config.vagrant_synced_folders[0].type = synced_folders;

    // set installed extras
    settings.vm.config.installed_extras = [];
    $('input[name=installed_extras]:checked').each(function (i, item) {
      item = $(item);
      settings.vm.config.installed_extras.push(item.val());
    });

    // save
    storage.save(settings, save_callback);
  });

  $('#reset_settings').click(function (e) {
    e.preventDefault();

    bootbox.confirm('Reset all settings?', function (result) {
      if (result) {
        var yaml = require('yamljs');

        // reset config object & save
        var config_filepath = settings.vm.home + '/example.config.yml';
        settings.vm.config = yaml.load(config_filepath);
        storage.save(settings, save_callback);
      }
    });
  });
  */
});