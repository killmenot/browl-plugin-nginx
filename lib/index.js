'use strict';

const path = require('path');
const fs = require('fs-extra');
const browlUtil = require('browl-util');
const debug = require('debug')('browl-plugin-nginx');

/**
  * Nginx plugin that create/delete nginx configuration file for instance
  *
  * @param {Object} strategy
  */
module.exports = (strategy) => {
  debug('init');

  const repo = strategy.repo;
  const rootConfig = strategy.rootConfig;
  const repoConfig = strategy.repoConfig;
  const nginxConfig = repoConfig.nginx || {};

  const originalCreate = strategy.create.bind(strategy);
  const originalDelete = strategy.delete.bind(strategy);

  debug('nginx root config: %j', rootConfig.nginx);
  debug('nginx repo config: %j', nginxConfig);

  if (!rootConfig.nginx) {
    throw new Error('nginx is not set in root configuration');
  }

  function getTemplate() {
    const template = nginxConfig.template || './templates/nginx.tmpl';

    return template.startsWith('/') ?
      template :
      path.join(rootConfig.conf_dir, repo, template);
  }

  function getDestination(branch) {
    return nginxConfig.destination || path.join(rootConfig.nginx.conf_dir, repo + '_' + browlUtil.clean(branch) + '.conf');
  }

  function getTemplateData(branch) {
    debug('data defined: %s', typeof strategy.getTemplateData !== 'undefined');

    const data = strategy.getTemplateData ?
      strategy.getTemplateData() :
      {};

    return Object.assign({
      branch: browlUtil.clean(branch)
    }, data);
  }

  function create(branch, callback) {
    let promise;

    if (!callback) {
      promise = new Promise((resolve, reject) => {
        callback = browlUtil.callbackPromise(resolve, reject);
      });
    }

    const tmpl = getTemplate();
    const data = getTemplateData(branch);

    debug('template: %s', tmpl);
    debug('data: %j', data);

    browlUtil.render(tmpl, data, (err, content) => {
      if (err) {
        return callback(err);
      }

      const destination = getDestination(branch);
      debug('destination: %s', destination);
      fs.writeFile(destination, content, callback);
    });

    return promise;
  }

  function del(branch, force, callback) {
    let promise;

    if (!callback) {
      promise = new Promise((resolve, reject) => {
        callback = browlUtil.callbackPromise(resolve, reject);
      });
    }

    const destination = getDestination(branch);
    fs.unlink(destination, (err) => {
      if (err && err.code == 'ENOENT' && force) {
        browlUtil.log('[browl-plugin-nginx|delete] ignore: ' + err);
        return callback();
      }

      callback(err);
    });

    return promise;
  }

  strategy.create = (branch, options) => {
    debug('create: %s', branch);

    return originalCreate(branch, options)
      .then(() => {
        return create(branch);
      })
      .then(() => {
        return browlUtil.sudo('service', ['nginx', 'restart']);
      });
  };

  strategy.delete = (branch, options) => {
    debug('delete: %s', branch);

    return originalDelete(branch, options)
      .then(() => {
        return del(branch, options.force);
      })
      .then(() => {
        return browlUtil.sudo('service', ['nginx', 'restart']);
      });
  };

  return strategy;
};
