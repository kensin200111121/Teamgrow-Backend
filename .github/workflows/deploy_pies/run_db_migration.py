#!/usr/bin/env python3
# Author: Chad Miller
# Date: 02/22/2023
# Purpose: This script is to be triggered by the development pipeline of backend_admin and should pull the git changes, rebuild and restart www
import os, subprocess, sys

# variables
env = dict(os.environ)
path = "/home/ubuntu/.nvm/versions/node/v18.12.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
env['PATH'] = path
cwd = '/var/www/backend_admin'

# functions
def pull_changes():
    print("Pulling down changes to development branch ...")
    cmd = 'git pull'
    output = subprocess.run(cmd, shell=True, universal_newlines=True, capture_output=True, cwd=cwd, env=env, executable="/bin/bash")
    if output.returncode != 0:
        print(output.stderr)
        sys.exit(1)
    else:
        print(output.stdout)

def yarn_install():
    print("Running yarn install ...")
    cmd = 'yarn install --frozen-lockfile --non-interactive'
    output = subprocess.run(cmd, shell=True, universal_newlines=True, capture_output=True, cwd=cwd, env=env, executable="/bin/bash")
    if output.returncode != 0:
        print(output.stderr)
        sys.exit(1)
    else:
        print(output.stdout)

def yarn_migrate_up():
    print("Running yarn run migrate:up")
    cmd = 'yarn run migrate:up'
    output = subprocess.run(cmd, shell=True, universal_newlines=True, capture_output=True, cwd=cwd, env=env, executable="/bin/bash")
    if output.returncode != 0:
        print(output.stderr)
        sys.exit(1)
    else:
        print(output.stdout)

def main():
    pull_changes()
    yarn_install()
    yarn_migrate_up()
    print("Migration complete.")

if __name__ == "__main__": main()