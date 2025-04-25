# How to install the backend
1. Install the node.js (>18.12.1). Install using nvm or exe/package file.
2. Install the node_modules using npm install or yarn install
Before this, you should following steps
## ubuntu
apt-get update
apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libvips-dev
Please confirm the .npmrc with the following configuration
arch=x64
platform=linux
sharp_binary_host=https://npmmirror.com/mirrors/sharp
sharp_libvips_binary_host=https://github.com/lovell/sharp-libvips/releases/download
build_from_source=true
## macos
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman vips

## windows
1. Follow the instructions here: https://github.com/nodejs/node-gyp#on-windows
 npm install -g node-gyp
 install the python3
 Visual Studio Install (Desktop development with C++) and set the npm config with the correct msvs version
2. Installing GTK 2
download https://ftp.gnome.org/pub/GNOME/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip and extract this to c:/GTK (check the correct link)
3. Installing libjpeg-turbo (optional, for JPEG support; node-canvas 2.0 and later)
download latest libjpeg-turbo SDK for Visual C++ from https://sourceforge.net/projects/libjpeg-turbo/files/ and place it to c:/libjpeg-turbo (or libjpeg-turbo64) (check the correct link)
Confirm if the filename that you are about to download is libjpeg-turbo-vc64.exe
4. Please confirm the .npmrc with the following confirguation
arch=x64
platform=win32
sharp_binary_host=https://npmmirror.com/mirrors/sharp
sharp_libvips_binary_host=https://github.com/lovell/sharp-libvips/releases/download
build_from_source=true
msvs_version=2022
5. If there is network issue with downloading the libvips, you can download this from the link(https://github.com/lovell/sharp-libvips/releases/download/v8.13.3/libvips-8.13.3/libvips-8.13.3/libvips-8.13.3-win32-x64.tar.br) and place it to the npm cache directory (c:/Users/[username]/AppData/Local/npm-cache/_libvips)

(Step 1 - 3 are for canvas install and step 4 is for sharp install)
Reference this https://github.com/Automattic/node-canvas/wiki/Installation:-Windows for step 1 - 3

After above settings for corresponding platforms, npm install or yan install

### How to install the common custom package?
- Please contact to the support team and get the git auth token
- And then make the `.npmrc` with the content from `.npmrc.sample` and replace the `$AUTH_TOKEN` with the above token
- You can install the package with this command.
`yarn install`

### Can I edit this package in the development?
- You can run this command.
`yarn setup:dev`
This will find the setup:dev command from package.json.
It will execute the `dev.sh` file to set up the github repo instead of the node_modules/@teamgrow/common package
- To run this correctly, please check the `.commands/dev.sh` file / `line 5` code. There is a git clone code. This is related with your ssh setting. please update this `git:crmgrow.com` with your correct setting.
- You can create the new branch and use that.
- And then you can edit that code with your request
- After all working, you can push the working result.

# Teamgrow backend_admin

## How to run
### Dev  
`npm run dev`
### Production
`npm run start`
### Required Env Variables

Set these env variables in `/var/www/teamgrow/bakend_admin`.
Files, docs, db, test db are stored in the following paths defined in `config/path`.

```
  module.exports.FILES_PATH = '/var/www/teamgrow/files/'
```

### How to install the packages

brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman

- Brew Install to install the binaries
- NPM install with --build-from-binaries option
SHARP_IGNORE_GLOBAL_LIBVIPS=1


### How to use the custom package (common code between services)
- By `yarn setup:dev` command, the installed node_modules is replaced with the github repository.
- The updated working result would work correctly.

```javascript
const { sum } = require('@teamgrow/common/helpers/utility.helper.js');

console.log(sum(10, 20))
```

### How to upload/update the exp default video?
- Download the source video & named that file to `crmgrow.mp4`
- Create new folder with named `exp_explained_english_streamed` with same level
- In the downloaded folder level & please run this command
```
ffmpeg -y -i crmgrow.mp4 -f hls -hls_time 4 -hls_list_size 0 -force_key_frames expr:gte(t,n_forced*4) exp_explained_english_streamed/exp_explained_english_streamed.m3u8
```
please focus on source file name -> crmgrow.mp4 and target file name `exp_explained_english_streamed/exp_explained_english_streamed.m3u8`
- After converting, you need to upload the folder `exp_explained_english_streamed` to `our aws account s3/crmgrow-videos (bucket)/streamd/`
- If you use different folder name, you need to update the `key` value of the `exp explained in english` admin video.
In this case, there would be downloaded video. So please update all videos with new key (folder name) by searching with old key.

