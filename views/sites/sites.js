var Q = require('q');

$(document).ready(function () {
  console.log('loaded sites.js in DrupalVM plugin');

  var drupalvm = window.active_plugin;
  var vm_config = drupalvm.instance.vm.config;

  settings = window.lunchbox.settings;

  // handle adding new site
  $('#drupalvm-sites .add-site').click(function (e) {
    e.preventDefault();

    var template = $('#add-site-template');
    if (template.length) {
      bootbox.dialog({
        title: 'New project',
        message: template.html(),
        buttons: {
          success: {
            label: 'Create',
            className: 'btn-primary',
            callback: function () {
              var wrapper   = $('.bootbox .bootbox-body');

              var name      = wrapper.find('input[name="name"]').val();
              var git_url   = wrapper.find('input[name="git_url"]').val();
              var composer  = wrapper.find('input[name="composer"]:checked').val() == 'true' ? true : false;
              var webroot   = wrapper.find('input[name="webroot"]').val();

              createSite(name.toLowerCase(), git_url, composer, webroot);
            }
          }
        }
      });
    }
  });

  // build table containing existings sites
  var sites_wrapper = $('#drupalvm-sites-list');
  if (sites_wrapper.length) {
    $('#drupalvm-sites-list').html('');

    // We don't want to include these default entries.
    var exclude = ['{{ drupal_domain }}', 'adminer.drupalvm.dev', 'xhprof.drupalvm.dev', 'pimpmylog.drupalvm.dev'];
    for (var x in vm_config.apache_vhosts) {
      var servername = vm_config.apache_vhosts[x].servername;

      if (exclude.indexOf(servername) !== -1) {
        continue;
      }
      
      sites_wrapper.append(buildRow(servername));
    }
  }

  /**
   * Returns a <tr> element built for specified server.
   * 
   * @param  {[type]} servername [description]
   * @return {[type]}            [description]
   */
  function buildRow(servername) {
    var shell = require('shell');

    // TODO: will this work with subdomains?
    var name = servername.split(".")[0];
    
    var tr = $('<tr>');

    var template = '';
    template += '<td><a href="http://' + servername + '" class="openExternal">' + servername + '</a></td>';
    template += '<td>' + name + '</td>';
    template += '<td class="drupalvm_sites_icons">';
    template += '  <a href="https://github.com" class="openExternal"><i class="fa fa-2 fa-git"></i></a>';
    template += '  <a href="#" class="placeholder" placeholder="When implemented, this will run \'composer install\' to initialize the project."><i class="fa fa-2 fa-arrow-down"></i></a>'; // TODO: implement composer install
    template += '</td>';
    template += '<td class="drupalvm_sites_icons">';
    template += '  <a href="#" class="placeholder" placeholder="When implemented, this button will allow you to edit this site entry."><i class="fa fa-2 fa-pencil"></i></a>';
    template += '  <a href="#" class="remove"><i class="fa fa-2 fa-ban"></i></a>';
    template += '</td>';

    tr.append(template);

    tr.find('.remove').click(function (e) {
      promptDeleteDetails(name);
    });

    return tr;
  }

  /**
   * Creates new site (file structure, vhost, database).
   * 
   * @param  {[type]} name     [description]
   * @param  {[type]} git_url  [description]
   * @param  {[type]} composer [description]
   * @param  {[type]} webroot  [description]
   * @return {[type]}          [description]
   */
  function createSite (name, git_url, composer, webroot) {
    // create the directory
    var fs = require('fs');
    var dir = vm_config.vagrant_synced_folders[0].local_path + '/' + name;

    if (git_url) {
      cloneGIT(dir, git_url).then(function () {
        if (composer) {
          runComposer(dir);
        }
      });
    }
    else {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
    }

    // Create the apache vhost
    var vhost = new Object();
    vhost.servername = name + "." + vm_config.vagrant_hostname;
    vhost.projectroot = "/var/www/" + name;
    vhost.documentroot = "/var/www/" + name + "/" + webroot;
    vm_config.apache_vhosts.push(vhost);

    // Create the database
    var db = new Object();
    db.name = name;
    db.encoding = "utf8";
    db.collation = "utf8_general_ci";
    vm_config.mysql_databases.push(db);

    vm_config.save(function (error) {
      if (error !== null) {
        console.log('Error: ' + error);
        return;
      }

      reloadCurrentView();
    });
  }
  
  /**
   * Clones GIT URL to dir.
   * 
   * @param  {[type]} dir      [description]
   * @param  {[type]} git_url  [description]
   * @param  {[type]} composer [description]
   * @return {[type]}          [description]
   */
  function cloneGIT (dir, git_url) {
    var deferred = Q.defer();

    var spawn = require('child_process').spawn;
    var child = spawn('git', ['clone', git_url, dir]);

    var stdout = '';
    var dialog = load_mod('components/dialog').create('Cloning from git ...');
    dialog.logProcess(child, function (output) {
      stdout += output;
    });

    child.on('exit', function (exit_code) {
      if (exit_code) {
        deferred.reject('Error cloning from GIT. Error code: ' + exit_code + '.');
        return;
      }

      deferred.resolve();
      dialog.hide();

    });

    return deferred.promise;
  }

  /**
   * Runs 'composer install' in given directory.
   * 
   * @param  {[type]} dir [description]
   * @return {[type]}     [description]
   */
  function runComposer (dir) {
    var deferred = Q.defer();

    var spawn = require('child_process').spawn;
    var child = spawn('composer', [
      'install',
      '--working-dir=' + dir,
      '-n',
      '-vvv'
      // '--dev' // commented out as this is deprecated
    ]);

    var dialog = load_mod('components/dialog').create('Running composer...');
    dialog.logProcess(child);

    child.on('exit', function (exit_code) {
      if (exit_code) {
        deferred.reject('Encountered error while running "composer install". Error code: ' + exit_code + '.');
        return;
      }

      deferred.resolve();
      dialog.hide();
    });

    return deferred.promise;
  }

  /**
   * Shows confirmation dialog for site deletion.
   * 
   * @param  {[type]} projectName [description]
   * @return {[type]}             [description]
   */
  function promptDeleteDetails(projectName) {
    //TODO: Prompt to ask how much of the record to delete
    var deleteSettings = {
      "removeDirectory": true,
      "removeApacheVhost": true,
      "removeDatabase": true
    };

    bootbox.dialog({
      title: "Delete site: " + projectName,
      message: 'This will delete:'
        + '<ul>'
        + '<li>apache vhost</li>'
        + '<li>database</li>'
        + '<li>site directory and files</li>'
        + '</ul>',
      buttons: {
        success: {
          label: "Cancel",
          className: "btn-default",
          callback: function () {
            // Do nothing.
          }
        },
        delete: {
          label: "Delete",
          className: "btn-danger",
          callback: function () {
            deleteSite(projectName, deleteSettings);
          }
        }
      }
    });
  }

  /**
   * Removes site, and its options.
   * 
   * @param  {[type]} projectName    [description]
   * @param  {[type]} deleteSettings [description]
   * @return {[type]}                [description]
   */
  function deleteSite(projectName, deleteSettings) {
    // Remove apache vhost entry
    if (deleteSettings.removeDirectory) {
      //TODO:
    }

    if (deleteSettings.removeApacheVhost) {
      for (var x in vm_config.apache_vhosts) {
        var servername = vm_config.apache_vhosts[x].servername;
        var name = servername.split(".")[0];
        if (name == projectName) {
          vm_config.apache_vhosts.splice(x, 1);
        }
      }
    }

    if (deleteSettings.removeDatabase) {
      //TODO:
    }

    vm_config.save(function (error) {
      if (error !== null) {
        console.log('Error: ' + error);
        return;
      }

      reloadCurrentView();
    });
  }
});

