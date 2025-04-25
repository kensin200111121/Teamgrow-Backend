// Timeline issue fix
const mongoose = require('mongoose');
const Folder = require('../src/models/folder');
const User = require('../src/models/user');
const Video = require('../src/models/video');
const Pdf = require('../src/models/pdf');
const Image = require('../src/models/image');
const Automation = require('../src/models/automation');
const Template = require('../src/models/email_template');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');
const { getAllFolders } = require('../src/helpers/folder');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    checkInvalidFolders();
    // migrateInvalidFolderUserId();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const checkInvalidFolders = async () => {
  const users = await User.find({ del: { $ne: true } }).catch((err) => {});

  console.log('users count', users.length);
  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    // find all folders of users
    const folders = await Folder.find(
      { user: user._id },
      { folders: 1, _id: 1 }
    ).catch((err) => {});

    // find all sub folder ids
    let allFolderIds = [];
    (folders || []).map((e) => {
      allFolderIds = [...allFolderIds, ...e.folders];
    });
    allFolderIds = [...new Set(allFolderIds)];

    // find the non-correct user folders
    const nonFolders = await Folder.find(
      { user: { $ne: user._id }, _id: { $in: allFolderIds } },
      { user: 1 }
    ).catch((err) => {});

    console.log('noneFolders', i, user._id, nonFolders.length);
    if (nonFolders.length) {
      console.log('mentiond this *************************************** ');
    }
  }
};

const migrateInvalidFolderUserId = async () => {
  const userId = mongoose.Types.ObjectId('62d6e9644304d536d9cf9826');
  const rootFolders = await Folder.find({ user: userId, del: false }).catch(
    (err) => {}
  );
  const rootFolderIds = rootFolders.map((e) => e._id);

  const allFolders = await getAllFolders(null, rootFolderIds, rootFolderIds);

  for (let i = 0; i < allFolders.length; i++) {
    const e = allFolders[i];
    if (e.user.toString() !== userId.toString()) {
      await migrateInvalidFolder(e);
    }
  }

  // const invalidFolders = [];
  // allFolders.forEach((e) => {
  //   if (e.user.toString() !== userId) {
  //     invalidFolders.push(e._id);
  //   }
  // });
  // console.log(invalidFolders, 'invalid Folders');
  // await Folder
  //   .updateMany({ _id: { $in: invalidFolders } }, { $set: { user: userId } });

  console.log('update Success');
};

const Model = {
  folders: Folder,
  videos: Video,
  images: Image,
  pdfs: Pdf,
  automations: Automation,
  templates: Template,
};
const migrateInvalidFolder = async (folder) => {
  // find all sub datas
  const rootFolderIds = [folder._id];
  const allFolders = await getAllFolders(null, rootFolderIds, rootFolderIds);
  const subIds = {
    folders: allFolders,
    videos: folder.videos,
    images: folder.images,
    pdfs: folder.pdfs,
    automations: folder.automations,
    templates: folder.templates,
  };
  // find the incorrect sub data
  let totalInvalidCount = 0;
  for (const key in subIds) {
    const invalidCount = await Model[key]
      .countDocuments({ user: { $ne: folder.user }, _id: { $in: subIds[key] } })
      .catch((err) => {});
    totalInvalidCount += invalidCount;
    console.log(key, ' invalid count ', invalidCount);
  }

  if (totalInvalidCount) {
    console.log('include invalid data', folder, totalInvalidCount);
    // TODO: this is very complicated. If there is new migration items, we will consider about this logic.
  } else {
    console.log('not include invalid data', folder);
    // find the parent folders (current folder user parent, incorrect parent folder)
    const incorrectParentFolder = await Folder.findOne({
      user: { $ne: folder.user },
      folders: folder._id,
    }).catch((err) => {});
    const correctParentFolder = await Folder.findOne({
      user: folder.user,
      folders: folder._id,
    }).catch((err) => {});
    console.log(
      'parent folder',
      incorrectParentFolder?._id,
      '-',
      correctParentFolder?._id
    );

    // remove the folder from incorrect parent folder
    if (incorrectParentFolder) {
      await Folder.updateMany(
        {
          user: { $ne: folder.user },
          folders: folder._id,
        },
        {
          $pull: { folders: { $in: [folder._id] } },
        }
      )
        .then((data) => {
          console.log('updated incorrect parent folder', data);
        })
        .catch((err) => {
          console.log('err', err.message);
        });
    }
    // if there is no current folder user parent, insert it to current folder user root folder
    if (!correctParentFolder) {
      await Folder.updateOne(
        { user: folder.user, rootFolder: true },
        {
          $addToSet: { folders: { $each: [folder._id] } },
        }
      )
        .then((data) => {
          console.log('correct parent root folder');
        })
        .catch((err) => {
          console.log('err', err.message);
        });
    }
  }
};
