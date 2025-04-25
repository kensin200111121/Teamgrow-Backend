const Folder = require('../models/folder');
const Team = require('../models/team');

const getAllFolders = async (
  type,
  folderIds,
  allFolderIds = [],
  user = null
) => {
  const query = { _id: { $in: folderIds } };
  if (type) {
    query['type'] = type;
  }
  if (user) {
    query['user'] = user;
  }
  const folders = await Folder.find(query);
  if (!folders.length) {
    return [];
  }
  const childFolderIds = [];
  folders.forEach((folder) => {
    folder.folders.forEach((e) => {
      if (!allFolderIds.includes(e + '')) {
        allFolderIds.push(e);
        childFolderIds.push(e);
      }
    });
  });
  if (childFolderIds.length) {
    return getAllFolders(type, childFolderIds, allFolderIds, user);
  } else {
    const folders = await Folder.find({ _id: { $in: allFolderIds } });
    return folders;
  }
};

const getPrevFolder = async (team, root_folder) => {
  let prevId = '';
  if (team) {
    if (team.folders.includes(root_folder.id)) {
      const prev_folder = await Folder.findOne({
        folders: { $in: root_folder.id },
        team: team._id,
      });
      if (prev_folder) {
        prevId = prev_folder.id;
      }
    } else {
      const prev_folder = await Folder.findOne({
        folders: { $in: root_folder.id },
      });
      if (prev_folder && !prev_folder.rootFolder) {
        prevId = prev_folder.id;
      }
    }
  } else {
    const prev_folder = await Folder.findOne({
      folders: { $in: root_folder.id },
    });
    if (prev_folder && !prev_folder.rootFolder) {
      prevId = prev_folder.id;
    }
  }
  return prevId;
};

const getParentFolder = async (userId, itemId, itemType) => {
  const folder_info = await Folder.findOne({
    user: userId,
    [itemType]: { $elemMatch: { $in: [itemId] } },
    team: { $exists: false },
  });
  return folder_info;
};

const checkFolderIsShared = async (userId, folderId, teamFolder) => {
  if (folderId) {
    const parentFolder = await getParentFolder(userId, folderId, 'folders');

    if (teamFolder && teamFolder.folders.includes(parentFolder?._id)) {
      return true;
    } else {
      const result = await checkFolderIsShared(
        userId,
        parentFolder?._id,
        teamFolder
      );
      return result;
    }
  } else {
    return false;
  }
};

const getFolderTrees = async (userId, itemId, team_id) => {
  const data = [];
  if (!itemId) {
    return data;
  }

  let parent;
  let folderId = itemId;
  let teamRoot = false;
  let userIdNew = userId;
  const team = team_id
    ? await Team.findById(team_id).select({ _id: 1, name: 1, folders: 1 })
    : null;
  let teamFolder = null;
  if (team) {
    const folder = await Folder.findOne({ _id: itemId });
    userIdNew = folder.user || userId;
    teamFolder = await Folder.findOne({ team: team._id });
  }
  do {
    teamRoot = teamFolder?.folders.includes(folderId);
    if (!teamRoot) {
      parent = await getParentFolder(userIdNew, folderId, 'folders');
      folderId = parent?._id;
      if (parent) {
        data.push({ folderId: parent._id, folderName: parent.title });
      }
    }
  } while (parent !== null && !teamRoot);

  if (team && teamFolder) {
    data.push({ folderId: teamFolder._id, folderName: teamFolder.title });
  }

  return data;
};

module.exports = {
  getAllFolders,
  getPrevFolder,
  getParentFolder,
  getFolderTrees,
  checkFolderIsShared,
};
