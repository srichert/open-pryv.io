#!/bin/sh

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..

export VAR_PRYV_FOLDER=$SCRIPT_FOLDER/../var-pryv
${VAR_PRYV_FOLDER}/mongodb-bin/bin/mongodump -d pryv-node -o $1

