'use strict';

const fse = require('fs-extra');
const path = require('path');
const sinon = require('sinon');
const NullStrategy = require('browl-null');
const browlUtil = require('browl-util');
const nginxPlugin = require('../');

describe('browl-plugin-nginx', () => {
  let sandbox;
  let fsMock;

  let repo;
  let rootConfig;
  let repoConfig;

  let strategy;
  let branch;
  let options;

  const tmpDir = path.join(__dirname, '../tmp');

  function resolve(p) {
    return path.join(tmpDir, p);
  }

  function mock() {
    fse.ensureDirSync(tmpDir);
    fse.ensureDirSync(rootConfig.conf_dir);
    fse.ensureDirSync(rootConfig.nginx.conf_dir.path);
    fse.ensureDirSync(rootConfig.nginx.include_dir.path);

    return {
      restore: () => fse.removeSync(tmpDir)
    };
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    repo = 'webapp';
    rootConfig = {
      conf_dir: resolve('/etc/browl'),
      nginx: {
        targets: [
          'conf_dir',
          'include_dir'
        ],
        conf_dir: {
          path: resolve('/etc/nginx/conf.d')
        },
        include_dir: {
          path: resolve('/etc/nginx/include.d')
        }
      }
    };
    repoConfig = {};

    strategy = new NullStrategy(repo, rootConfig, repoConfig);

    branch = 'develop';
    options = {
      cwd: '/var/www/webapp/develop'
    };

    sandbox.stub(browlUtil, 'sudo').resolves();

    fsMock = mock();
  });

  afterEach(() => {
    sandbox.restore();
    fsMock.restore();
  });

  it('nginx is not set in root configuration', () => {
    delete rootConfig.nginx;

    expect(() => {
      nginxPlugin(strategy);
    }).throw(Error, 'nginx is not set in root configuration');
  });

  describe('#create', () => {
    beforeEach(() => {
      repoConfig.nginx = {
        conf_dir: {
          files: ['./templates/nginx.tmpl']
        }
      };

      fse.ensureDirSync(path.join(rootConfig.conf_dir, repo, 'templates'));
      fse.writeFileSync(path.join(rootConfig.conf_dir, repo, 'templates', 'nginx.tmpl'), 'content:<%= branch %>');
    });

    it('should create nginx configuration for instance (relative path)', async () => {
      const expected = 'content:develop';

      nginxPlugin(strategy);
      await strategy.create(branch, options);

      const actual = fse.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
      expect(actual).equal(expected);
    });

    it('should create nginx configuration for instance (absolute path)', async () => {
      const expected = 'foo:develop';

      const file = path.join(tmpDir, 'nginx.tmpl');
      fse.writeFileSync(file, 'foo:<%= branch %>');

      repoConfig.nginx = {
        conf_dir: {
          files: [file]
        }
      };

      nginxPlugin(strategy);
      await strategy.create(branch, options);

      const actual = fse.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
      expect(actual).equal(expected);
    });

    it('should create nginx configuration for instance (template data)', async () => {
      const expected = 'content:quux';

      strategy.getTemplateData = () => ({ branch: 'quux' });

      nginxPlugin(strategy);
      await strategy.create(branch, options);

      const actual = fse.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
      expect(actual).equal(expected);
    });

    it('should create nginx configuration for instance (custom path)', async () => {
      const expected = 'content:develop';

      repoConfig.nginx = {
        conf_dir: {
          path: '/foo/bar.conf',
          files: ['./templates/nginx.tmpl']
        }
      };

      nginxPlugin(strategy);
      await strategy.create(branch, options);

      const actual = fse.readFileSync(resolve('/etc/nginx/conf.d/foo/bar.conf')).toString();

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
      expect(actual).equal(expected);
    });

    it('should create nginx configuration for instance (custom path using template)', async () => {
      const expected = 'content:develop';

      repoConfig.nginx = {
        conf_dir: {
          path: '<%= repo %>/<%= branch %>/<%= name %>.conf',
          files: ['./templates/nginx.tmpl']
        }
      };

      nginxPlugin(strategy);
      await strategy.create(branch, options);

      const actual = fse.readFileSync(resolve('/etc/nginx/conf.d/webapp/develop/nginx.conf')).toString();

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
      expect(actual).equal(expected);
    });

    it('should create nginx configuration for instance (error)', async () => {
      repoConfig.nginx = {
        conf_dir: {
          files: ['./templates/nginx.tmpl']
        }
      };

      strategy.getTemplateData = () => { throw new TypeError('foo'); };

      try {
        nginxPlugin(strategy);
        await strategy.create(branch, options);
      } catch (err) {
        expect(err).be.instanceof(TypeError);
      }
    });
  });

  describe('#delete', () => {
    beforeEach(() => {
      repoConfig.nginx = {
        conf_dir: {
          files: ['./templates/nginx.tmpl']
        }
      };
    });

    it('should delete instance nginx configuration', async () => {
      const expected = false;

      fse.writeFileSync(path.join(rootConfig.nginx.conf_dir.path, 'webapp_develop.conf'), 'content:develop');

      nginxPlugin(strategy);
      await strategy.delete(branch, options);

      const actual = fse.existsSync(resolve('/etc/nginx/conf.d/webapp_develop.conf'));

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
      expect(actual).equal(expected);
    });

    it('should return error when no nginx configuration file', async () => {
      await nginxPlugin(strategy);

      try {
        await strategy.delete(branch, options);
      } catch (err) {
        expect(err.code).equal('ENOENT');
        expect(browlUtil.sudo.notCalled).equal(true);
      }
    });

    it('should not return error when no nginx configuration file (force)', async () => {
      options.force = true;

      nginxPlugin(strategy);
      await strategy.delete(branch, options);

      expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
    });
  });
});
