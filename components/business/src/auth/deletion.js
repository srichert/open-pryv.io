/**
 * @license
 * Copyright (c) 2020 Pryv S.A. https://pryv.com
 * 
 * This file is part of Open-Pryv.io and released under BSD-Clause-3 License
 * 
 * Redistribution and use in source and binary forms, with or without 
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, 
 *    this list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice, 
 *    this list of conditions and the following disclaimer in the documentation 
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the copyright holder nor the names of its contributors 
 *    may be used to endorse or promote products derived from this software 
 *    without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" 
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE 
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE 
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL 
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR 
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER 
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, 
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE 
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * SPDX-License-Identifier: BSD-3-Clause
 * 
 */
// @flow

const bluebird = require('bluebird');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const UsersRepository = require('components/business/src/users/repository');
const errors = require('components/errors').factory;

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

class Deletion {
  logger: any;
  storageLayer: any;
  settings: any;
  usersRepository: UsersRepository;

  constructor(logging: any, storageLayer: any, settings: any) {
    this.logger = logging.getLogger('business/deletion');
    this.storageLayer = storageLayer;
    this.settings = settings;
    this.usersRepository = new UsersRepository(this.storageLayer.events);
  }

  checkIfAuthorized(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    if(this.settings.get('auth.adminAccessKey').str() !== context.authorizationHeader) {
      return next(errors.unknownResource());
    }
    next();
  }

  async validateUserExists(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const user = await this.usersRepository.getAccountByUsername(params.username);
    if (!user || !user.id) {
      return next(errors.unknownResource('user', params.username));
    }
    context.user = user;
    next();
  }

  async validateUserFilepaths(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const paths = [
      this.settings.get('eventFiles.attachmentsDirPath').str(),
      this.settings.get('eventFiles.previewsDirPath').str(),
    ];

    const notExistingDir = findNotExistingDir(paths);
    if (notExistingDir) {
      const error = new Error(`Base directory '${notExistingDir}' does not exist.`);
      this.logger.error(error);
      return next(
        errors.unexpectedError(error)
      );
    }

    // NOTE User specific paths are constructed by appending the user _id_ to the
    // `paths` constant above. I know this because I read EventFiles#getXPath(...)
    // in components/storage/src/user/EventFiles.js.

    // NOTE Since user specific paths are created lazily, we should not expect
    //  them to be there. But _if_ they are, they need be accessible.

    // Let's check if we can change into and write into the user's paths:
    const inaccessibleDirectory = findNotAccessibleDir(
      paths.map((p) => path.join(p, context.user.id))
    );
    if (inaccessibleDirectory) {
      const error = new Error(
        `Directory '${inaccessibleDirectory}' is inaccessible or missing.`
      );
      this.logger.error(error);
      return next(errors.unexpectedError(error));
    }
    next();
  }

  async deleteUserFiles(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const paths = [
      this.settings.get('eventFiles.attachmentsDirPath').str(),
      this.settings.get('eventFiles.previewsDirPath').str(),
    ];

    const userPaths = paths.map((p) => path.join(p, context.user.id));
    const opts = {
      disableGlob: true,
    };

    await bluebird.map(userPaths, (path) =>
      bluebird.fromCallback((cb) => rimraf(path, opts, cb))
    );

    next();
  }

  async deleteHFData (
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    // dynamic loading , because series functionality does not exist in opensource
    const InfluxConnection = require('components/business/src/series/influx_connection');
    const host = this.settings.get('influxdb.host').str();
    const port = this.settings.get('influxdb.port').num();

    const influx = new InfluxConnection(
      { host: host, port: port },
      this.logger
    );
    await influx.dropDatabase(`user.${params.username}`);
    next();
  }

  async deleteUser(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      const dbCollections = [
        this.storageLayer.accesses,
        this.storageLayer.events,
        this.storageLayer.streams,
        this.storageLayer.followedSlices,
        this.storageLayer.profile,
        this.storageLayer.webhooks,
      ];

      const drops = dbCollections
        .map((coll) =>
          bluebird.fromCallback((cb) => coll.dropCollection(context.user, cb))
        )
        .map((promise) =>
          promise.catch(
            (e) => /ns not found/.test(e.message),
            () => {}
          )
        );

      await this.usersRepository.deleteOne(context.user.id);

      await Promise.all(drops);

      await bluebird.fromCallback((cb) =>
        this.storageLayer.sessions.remove(
          { data: { username: context.user.username } },
          cb
        )
      );
    } catch (error) {
      this.logger.error(error);
      return next(errors.unexpectedError(error));
    }
    next();
  }
}

function findNotExistingDir(paths: Array<string>): string {
  let notExistingDir = '';
  for (let path of paths) {
    if (!fs.existsSync(path)) {
      notExistingDir = path;
      break;
    }
  }
  return notExistingDir;
}

function findNotAccessibleDir(paths: Array<string>): string {
  let notAccessibleDir = '';
  for (let path of paths) {
    let stat;
    try {
      stat = fs.statSync(path);

      if (!stat.isDirectory()) {
        throw new Error();
      }

      fs.accessSync(path, fs.constants.W_OK + fs.constants.X_OK);
    } catch (err) {
      if (err.code === 'ENOENT') {
        continue;
      } else {
        notAccessibleDir = path;
        break;
      }
    }
  }
  return notAccessibleDir;
}

module.exports = Deletion;
