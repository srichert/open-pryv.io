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
'use strict';

var checkAndConstraints = require('../utils/check-and-constraints'),
    db = require('../storage/database'),
    messages = require('../utils/messages'),
    config = require('../config'),
    pryv = require('../business/service-info');

/** Routes to discover server assignations.
 */
function discoverServerAssignations(app) {
  var domain = '.' + config.get('dns:domain');
  var aaservers_mode = config.get('net:aaservers_ssl') ? 'https' : 'http';

  /** GET /:uid/server - find the server hosting the provided username (uid).
   */
  app.get('/:uid/server', function (req, res, next) {
    var uid = checkAndConstraints.uid(req.params.uid);

    if (! uid) {
      return next(messages.e(400, 'INVALID_USER_NAME'));
    }

    db.getServer(uid, function (error, result) {
      if (error) {
        return next(messages.ei());
      }

      if (!result) {
        return next(messages.e(404, 'UNKNOWN_USER_NAME'));
      }

      return res.redirect(aaservers_mode + '://' + result + '/?username=' + uid);
    });
  });

  /** POST /:uid/server - find the server hosting the provided username (uid)
   */
  app.post('/:uid/server', function (req, res, next) {
    var uid = checkAndConstraints.uid(req.params.uid);

    if (! uid) {
      return next(messages.e(400, 'INVALID_USER_NAME'));
    }

    db.getServer(uid, function (error, result) {
      if (error) {
        return next(messages.ei());
      }
      if(!result) {
        return next(messages.e(404, 'UNKNOWN_USER_NAME'));
      }

      return res.status(200).json({server: result, alias: uid + domain });
    });
  });
}
 
module.exports = discoverServerAssignations;
