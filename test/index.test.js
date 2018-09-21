'use strict';

const fs = require('fs-extra');
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
    fs.ensureDirSync(tmpDir);
    fs.ensureDirSync(rootConfig.conf_dir);
    fs.ensureDirSync(rootConfig.nginx.conf_dir);

    return {
      restore: () => fs.removeSync(tmpDir)
    };
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    repo = 'webapp';
    rootConfig = {
      conf_dir: resolve('/etc/browl'),
      nginx: {
        conf_dir: resolve('/etc/nginx/conf.d')
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
      fs.ensureDirSync(path.join(rootConfig.conf_dir, repo, 'templates'));
      fs.writeFileSync(path.join(rootConfig.conf_dir, repo, 'templates', 'nginx.tmpl'), 'content:<%= branch %>');
    });

    it('should create nginx configuration for instance', (done) => {
      const expected = 'content:develop';

      nginxPlugin(strategy);

      strategy.create(branch, options).then(() => {
        const actual = fs.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
        expect(actual).equal(expected);

        done();
      }).catch(done);
    });

    it('should create nginx configuration using config.template (absolute path)', (done) => {
      const expected = 'foo:develop';

      repoConfig.nginx = {
        template: path.join(tmpDir, 'nginx.tmpl')
      };
      fs.writeFileSync(repoConfig.nginx.template, 'foo:<%= branch %>');

      nginxPlugin(strategy);

      strategy.create(branch, options).then(() => {
        const actual = fs.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
        expect(actual).equal(expected);

        done();
      }).catch(done);
    });

    it('should create nginx configuration using config.template (relative path)', (done) => {
      const expected = 'bar:develop';

      repoConfig.nginx = {
        template: './quux.tmpl'
      };
      fs.writeFileSync(path.join(rootConfig.conf_dir, repo, 'quux.tmpl'), 'bar:<%= branch %>');

      nginxPlugin(strategy);

      strategy.create(branch, options).then(() => {
        const actual = fs.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
        expect(actual).equal(expected);

        done();
      }).catch(done);
    });

    it('should create nginx configuration in config.destination', (done) => {
      const expected = 'content:develop';

      repoConfig.nginx = {
        destination: path.join(tmpDir, 'webapp_develop.conf')
      };

      nginxPlugin(strategy);

      strategy.create(branch, options).then(() => {
        const actual = fs.readFileSync(repoConfig.nginx.destination).toString();

        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
        expect(actual).equal(expected);

        done();
      }).catch(done);
    });

    it('should create nginx configuration for instance using getTemplateData', (done) => {
      const expected = 'content:quux';

      nginxPlugin(strategy);

      strategy.getTemplateData = () => ({ branch: 'quux' });

      strategy.create(branch, options).then(() => {
        const actual = fs.readFileSync(resolve('/etc/nginx/conf.d/webapp_develop.conf')).toString();

        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
        expect(actual).equal(expected);

        done();
      }).catch(done);
    });
  });

  describe('#delete', () => {
    it('should delete instance nginx configuration ', (done) => {
      const expected = false;

      nginxPlugin(strategy);
      fs.writeFileSync(path.join(rootConfig.nginx.conf_dir, 'webapp_develop.conf'), 'content:develop');

      strategy.delete(branch, options).then(() => {
        const actual = fs.existsSync(resolve('/etc/nginx/conf.d/webapp_develop.conf'));

        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);
        expect(actual).equal(expected);

        done();
      }).catch(done);
    });

    it('should return error when no nginx configuration file', (done) => {
      nginxPlugin(strategy);

      strategy.delete(branch, options).catch((err) => {
        expect(err.code).equal('ENOENT');
        expect(browlUtil.sudo.notCalled).equal(true);

        done();
      });
    });

    it('should not return error when no nginx configuration file (force)', (done) => {
      nginxPlugin(strategy);

      options.force = true;

      strategy.delete(branch, options).then(() => {
        expect(browlUtil.sudo.firstCall).calledWith('service', ['nginx', 'restart']);

        done();
      }).catch(done);
    });
  });
});
