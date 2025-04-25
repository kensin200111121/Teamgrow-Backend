const mongoose = require('mongoose');

const PipeLine = require('../models/pipe_line');
const DealStage = require('../models/deal_stage');
const Deal = require('../models/deal');
const DealHelper = require('../helpers/deal');
const Team = require('../models/team');
const Folder = require('../models/folder');
const Automation = require('../models/automation');
const User = require('../models/user');
const Organization = require('../models/organization');

const {
  getAllFolders,
  getPrevFolder,
  getParentFolder,
} = require('../helpers/folder');

const get = async (req, res) => {
  const { currentUser } = req;
  let query = {};

  if (currentUser.organization_info?.is_enabled && currentUser.organization) {
    query = {
      $or: [
        { organization: currentUser.organization },
        { user: currentUser._id },
      ],
    };
  } else {
    query['user'] = currentUser._id;
  }

  let rawData = await PipeLine.find(query).sort({ created_at: 1 });

  if (rawData.length === 0) {
    try {
      const newPrimary = await PipeLine.create({
        title: `${currentUser.user_name?.trim() || 'User'} Primary`,
        ...(currentUser.organization ? {organization: currentUser.organization}: {}),
        user: currentUser._id,
      });

      const deal_stage = new DealStage({
        deals: [],
        deals_count: 0,
        duration: 0,
        pipe_line: newPrimary._id,
        priority: 0,
        title: 'no name',
        user: currentUser.id,
      });
      await deal_stage.save().catch((err) => {});

      rawData = [newPrimary];
    } catch (error) {
      return res.json({
        status: true,
        data: [],
      });
    }
  }

  const userIds = rawData.map((item) => item.user);

  try {
    const users = await User.find({ _id: { $in: userIds } }).select(
      'user_name _id'
    );

    const userMap = {};
    users.forEach((user) => {
      userMap[user._id.toString()] = user.user_name;
    });
    const data = [];

    rawData.forEach((item) => {
      data.push({
        ...item.toObject(),
        user_name: userMap[item.user.toString()],
      });
    });

    res.send({
      status: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: 'Error fetching user names',
    });
  }
};

const getById = async (req, res) => {
  const pipeline = await PipeLine.findOne({ _id: req.params.id });
  if (!pipeline) {
    return res.status(400).json({
      status: false,
      error: 'Pipeline doesn`t exist',
    });
  }

  res.send({
    status: true,
    pipeline,
  });
};

const loadPipelines = async (req, res) => {
  const { id } = req.params;
  const { currentUser } = req;

  const query = {};
  if (id) {
    query['_id'] = mongoose.Types.ObjectId(id);
  } else {
    let query_pipe = {};
    if (currentUser.organization_info?.is_enabled && currentUser.organization) {
      query_pipe = {
        $or: [
          { organization: currentUser.organization },
          { user: currentUser._id },
        ],
      };
    } else {
      query_pipe['user'] = currentUser._id;
    }
    const pipes = await PipeLine.find(query_pipe);
    const pipeIds = pipes.map((e) => e._id);
    query['pipe_line'] = { $in: pipeIds };
  }

  const rawStages = await DealStage.aggregate([
    { $match: query },
    { $group: { _id: '$pipe_line', stages: { $push: '$$ROOT' } } },
    {
      $lookup: {
        from: 'pipe_lines',
        localField: '_id',
        foreignField: '_id',
        as: 'detail',
      },
    },
    {
      $unwind: '$detail',
    },
  ]).catch((_) => {});

  const userIds = rawStages.map((item) => item.detail.user);

  try {
    const users = await User.find({ _id: { $in: userIds } }).select(
      'user_name _id'
    );

    const userMap = {};
    users.forEach((user) => {
      userMap[user._id.toString()] = user.user_name;
    });
    const stages = [];

    rawStages.forEach((item) => {
      stages.push({
        ...item,
        detail: {
          ...item.detail,
          user_name: userMap[item?.detail?.user.toString()],
        },
      });
    });

    res.send({
      status: true,
      data: stages || [],
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: 'Error fetching user names',
    });
  }
};

const create = async (req, res) => {
  const { currentUser } = req;
  const pipe_info = currentUser.pipe_info;

  if (pipe_info?.is_limit) {
    const pipe_count = await PipeLine.countDocuments({ user: currentUser.id });
    if (!pipe_info.max_count || pipe_count >= pipe_info.max_count) {
      console.log('no error');
      return res.status(412).send({
        status: false,
        error: 'You reached the maximum pipeline count',
      });
    }
  }

  const pipe_line = new PipeLine({
    ...req.body,
    user: currentUser.id,
    ...(currentUser.organization_info?.is_enabled && currentUser.organization
      ? { organization: currentUser.organization }
      : {}),
  });

  try {
    await pipe_line.save();
    const deal_info = {
      deals: [],
      deals_count: 0,
      duration: 0,
      pipe_line: pipe_line._id,
      priority: 0,
      title: 'no name',
    };
    const deal_stage = new DealStage({
      ...deal_info,
      user: currentUser.id,
    });
    deal_stage
      .save()
      .then((_deal_stage) => {
        return res.send({
          status: true,
          pipeline: pipe_line,
          data: _deal_stage,
        });
      })
      .catch((err) => {
        return res.status(400).send({
          status: false,
          error: err.message,
        });
      });
  } catch (err) {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  await PipeLine.deleteOne({ user: currentUser._id, _id: id });
  await DealStage.deleteMany({
    pipe_line: id,
    user: currentUser.id,
  });

  return res.send({
    status: true,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const data = req.body;

  await PipeLine.updateOne({ user: currentUser._id, _id: id }, { $set: data });

  return res.send({
    status: true,
  });
};

const deletePipeline = async (req, res) => {
  const { currentUser } = req;
  const { option, target, current } = req.body;

  if (option === 2) {
    PipeLine.deleteOne({ user: currentUser._id, _id: current }).then(() => {
      return res.send({
        status: true,
      });
    });
  } else if (option === 0) {
    DealStage.find({ user: currentUser._id, pipe_line: current }).then(
      (stages) => {
        let dealIds = [];
        const dealStageIds = [];
        stages.forEach((e) => {
          dealIds = [...dealIds, ...e.deals];
          dealStageIds.push(e._id);
        });
        for (const dealId of dealIds) {
          DealHelper.remove(currentUser._id, dealId).catch(() => {
            console.log('Deal deleting failed');
          });
        }
        DealStage.deleteMany({ _id: { $in: dealStageIds } }).catch(() => {
          console.log('Stages deleting failed');
        });
        PipeLine.deleteOne({ _id: current }).catch(() => {
          console.log('pipeline deleting failed');
        });
        return res.send({
          status: true,
        });
        // TODO: delete related activities
      }
    );
  } else if (option === 1) {
    DealStage.find({ user: currentUser._id, pipe_line: current }).then(
      (stages) => {
        let dealIds = [];
        const dealStageIds = [];
        stages.forEach((e) => {
          dealIds = [...dealIds, ...e.deals];
          dealStageIds.push(e._id);
        });
        Deal.find({
          $or: [
            { _id: { $in: dealIds } },
            { deal_stage: { $in: dealStageIds } },
          ],
        }).then((_deals) => {
          const _dealIds = _deals.map((e) => e._id);
          Deal.updateMany(
            {
              _id: { $in: _dealIds },
            },
            {
              $set: { deal_stage: target },
            }
          ).then(() => {
            DealStage.deleteMany({ _id: { $in: dealStageIds } }).catch(() => {
              console.log('deal stage deleting failed');
            });
            DealStage.updateOne(
              { _id: target },
              { $addToSet: { deals: { $each: _dealIds } } }
            )
              .then(() => {
                PipeLine.deleteOne({ _id: current }).catch(() => {
                  console.log('pipeline deleting failed');
                });
                return res.send({
                  status: true,
                });
              })
              .catch(() => {
                console.log('deals moving is failed');
                return res.send({
                  status: true,
                });
              });
          });
        });
      }
    );
  }
};

const loadLibrary = async (req, res) => {
  const { currentUser } = req;
  const { folder, team_id } = req.body;
  let { search } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }

  let root_folder;
  let team_folders;
  let prevId = '';
  let pipeline_list = [];
  let folder_list = [];

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  });
  let team;
  if (!folder || folder === 'root') {
    const teamIds = [];
    teams.forEach((e) => {
      teamIds.push(e._id);
    });
    team_folders = await Folder.find({
      role: 'team',
      del: false,
      team: { $in: teamIds },
    })
      .sort({ priority: 1 })
      .sort({ created_at: 1 });
    const admin_folder = await Folder.findOne({
      rootFolder: true,
      role: 'admin',
      del: false,
    });
    root_folder = {
      ...admin_folder._doc,
    };
    team_folders.forEach((e) => {
      root_folder.folders.push(e._id);
    });
  } else {
    root_folder = await Folder.findById(folder);
    if (root_folder.team || team_id) {
      team = await Team.findById(team_id).select({
        _id: 1,
        name: 1,
        folders: 1,
      });
    }
    prevId = await getPrevFolder(team, root_folder);
  }

  const pipeline_query = {
    _id: { $in: root_folder.pipelines },
    del: { $ne: true },
  };

  const folder_query = {
    _id: { $in: root_folder.folders },
    $or: [{ team: { $exists: true }, role: 'team' }],
    del: { $ne: true },
  };

  if (search) {
    folder_list = await getAllFolders(
      'pipeline',
      root_folder.folders,
      root_folder.folders
    );

    let pipelineIds = root_folder.pipelines;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_list.length; i++) {
      pipelineIds = [...pipelineIds, ...folder_list[i].pipelines];
      folderIds = [...folderIds, ...folder_list[i].folders];
    }
    pipeline_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    pipeline_query['_id'] = { $in: pipelineIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
  pipeline_list = await PipeLine.find(pipeline_query).sort({ created_at: 1 });

  folder_list = await Folder.find(folder_query)
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  const pipelineIds = pipeline_list.map((_pipeline) => _pipeline._id);
  const pipelinesInfo = await PipeLine.aggregate([
    { $match: { original_id: { $in: pipelineIds } } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const pipelineDownloadCount = {};
  pipelinesInfo.forEach((e) => {
    pipelineDownloadCount[e._id] = e.count;
  });

  const pipelineOwnerIds = [];
  folder_list.forEach((e) => {
    pipelineOwnerIds.push(e.user);
  });
  pipeline_list.forEach((e) => {
    pipelineOwnerIds.push(e.user);
  });
  const _pipeline_owners = await User.find({
    _id: { $in: pipelineOwnerIds },
  }).select('_id user_name');
  const _pipeline_owner_objects = {};
  _pipeline_owners.forEach((e) => {
    _pipeline_owner_objects[e._id] = e;
  });

  const _folders = (folder_list || []).map((e) => {
    return {
      ...e._doc,
      isFolder: true,
      item_type: 'folder',
      owner: _pipeline_owner_objects[e.user],
      team_info: team,
    };
  });

  const pipeline_detail_list = [];
  for (let i = 0; i < pipeline_list.length; i++) {
    let pipeline_detail = pipeline_list[i]._doc || pipeline_list[i];
    pipeline_detail = {
      ...pipeline_detail,
      item_type: pipeline_detail.type || 'pipeline',
      downloads: pipelineDownloadCount[pipeline_detail._id] || 0,
      owner: _pipeline_owner_objects[pipeline_detail.user],
      team_info: team,
    };
    pipeline_detail_list.push(pipeline_detail);
  }
  const _pipelines = [...pipeline_detail_list, ..._folders];

  return res.send({
    status: true,
    data: {
      results: _pipelines,
      prevFolder: prevId,
      team,
    },
  });
};

module.exports = {
  get,
  getById,
  create,
  remove,
  update,
  deletePipeline,
  loadLibrary,
  loadPipelines,
};
