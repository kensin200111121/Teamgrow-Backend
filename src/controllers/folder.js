const { getFolderTrees } = require('../helpers/folder');
const Folder = require('../models/folder');

const getAllParents = async (req, res) => {
  const { currentUser } = req;
  const { folder, team_id } = req.body;

  const current_folder = await Folder.findById(folder);
  const folderTree = await getFolderTrees(currentUser._id, folder, team_id);
  folderTree.reverse();

  return res.send({
    status: true,
    data: {
      folderTree,
      currentFolder: current_folder.title,
    },
  });
};

module.exports = {
  getAllParents,
};
