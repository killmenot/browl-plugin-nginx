'use strict';

const path = require('path');
const fse = require('fs-extra');
const _ = require('lodash');
const browlUtil = require('browl-util');
const debug = require('debug')('browl-plugin-nginx');

// Node.js 10 has no Array.prototype.flatMap
const flatMap = (arr) => arr.reduce((acc, x) => acc.concat(x), []);

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

  function getTargets() {
    return flatMap((rootConfig.nginx.targets || [])
      .map(x =>
        ({
          name: x,
          rootConfig: rootConfig.nginx[x],
          repoConfig: nginxConfig[x]
        })
      )
      .filter(x => x.repoConfig)
      .map(x =>
        x.repoConfig.files.map(y => {
          const z = {
            name: x.name,
            rootConfig: x.rootConfig,
            repoConfig: x.repoConfig,
            file: y
          };

          delete z.repoConfig.files;

          return z;
        })
      )
    );
  }

  function getSource(target) {
    return target.file.startsWith('/') ? target.file : path.join(rootConfig.conf_dir, repo, target.file);
  }

  function getDestination(target, { branch }) {
    branch = browlUtil.clean(branch);

    let destination;

    if (target.repoConfig.path) {
      const { name } = path.parse(target.file);
      const segment = _.template(target.repoConfig.path)({ repo, branch, name });

      destination = path.join(target.rootConfig.path, segment);
    } else {
      destination = path.join(target.rootConfig.path, `${repo}_${branch}.conf`);
    }

    const dir = path.dirname(destination);
    fse.ensureDirSync(dir);

    return destination;
  }

  function getTemplateData(branch) {
    debug('data defined: %s', typeof strategy.getTemplateData !== 'undefined');

    const data = strategy.getTemplateData ? strategy.getTemplateData() : {};

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

    const targets = getTargets();
    debug('targets: %s', targets.map(x => x.file));

    const tasks = targets.map(async (t) => {
      const source = getSource(t);
      debug('source: %s', source);

      const destination = getDestination(t, { branch });
      debug('destination: %s', destination);

      const data = getTemplateData(branch);
      debug('data: %j', data);

      const content = await browlUtil.render(source, data);
      debug('content: %j', content);

      await fse.writeFile(destination, content);
    });

    Promise.all(tasks)
      .then(() => callback())
      .catch((err) => callback(err));

    return promise;
  }

  function del(branch, force, callback) {
    let promise;

    if (!callback) {
      promise = new Promise((resolve, reject) => {
        callback = browlUtil.callbackPromise(resolve, reject);
      });
    }

    const targets = getTargets();
    debug('targets: %s', targets.map(x => x.file));

    const tasks = targets.map(async (t) => {
      const destination = getDestination(t, { branch });
      debug('destination: %s', destination);

      try {
        await fse.unlink(destination);
      } catch (err) {
        if (err && err.code == 'ENOENT' && force) {
          return browlUtil.log('[browl-plugin-nginx|delete] ignore: ' + err);
        }

        throw err;
      }
    });

    Promise.all(tasks)
      .then(() => callback())
      .catch((err) => callback(err));

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
