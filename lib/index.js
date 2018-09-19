'use strict';

const path = require('path');
const fs = require('fs-extra');
const browlUtil = require('browl-util');
const debug = require('debug')('browl-plugin-nginx')

/**
  * Nginx decorator allows to create nginx configuration file
  *
  * @param {Object} strategy
  */
module.exports = (strategy) => {
  debug('init');

  const repo = strategy.repo;
  const rootConfig = strategy.rootConfig;
  const repoConfig = strategy.repoConfig;

  const originalCreate = strategy.create.bind(strategy);
  const originalDelete = strategy.delete.bind(strategy);

  if (!rootConfig.nginx) {
    throw new Error('nginx is not set in root configuration');
  }

  repoConfig.nginx = repoConfig.nginx || {};

  function getTemplate() {
    const template = repoConfig.nginx.template || './templates/nginx.tmpl'

    return template.startsWith('/') ?
      template :
      path.join(rootConfig.conf_dir, repo, template.slice(2));
  }

  function getDestination(branch) {
    return path.join(rootConfig.nginx.conf_dir, repo + '_' + browlUtil.clean(branch) + '.conf');
  }

  function getTemplateData() {
    return strategy.getTemplateData ?
      strategy.getTemplateData() :
      {};
  }

  function create(branch, callback) {
    let promise;

    if (!callback) {
      promise = new Promise((resolve, reject) => {
        callback = browlUtil.callbackPromise(resolve, reject);
      });
    }

    const tmpl = getTemplate();
    const data = getTemplateData();

    browlUtil.render(tmpl, data, (err, content) => {
      if (err) {
        return callback(err);
      }

      const destination = getDestination(branch);
      fs.writeFile(destination, content, callback);
    });

    return promise;
  }

  function del(branch, force, callback) {
    let promise;

    if (typeof force === 'function') {
      callback = force;
      force = false;
    }

    if (!callback) {
      promise = new Promise((resolve, reject) => {
        callback = browlUtil.callbackPromise(resolve, reject);
      });
    }

    const file = resolveFile(branch);
    fs.unlink(file, (err) => {
      if (err && err.code == 'ENOENT' && force) {
        browlUtil.log('[decorators|nginx|delete] ignore: ' + err);
        return callback();
      }

      callback(err);
    });

    return promise;
  }

  strategy.create = (branch, options) => {
    debug('create: %s', branch);

    return create(branch)
      .then(() => {
        return originalCreate(branch, options);
      });
  };

  strategy.delete = (branch, options) => {
    debug('delete: %s', branch);

    return del(branch, options.force)
      .then(() => {
        return originalDelete(branch, options);
      });
  };

  return strategy;
};
