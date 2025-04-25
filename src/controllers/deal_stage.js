const DealStage = require('../models/deal_stage');
const Deal = require('../models/deal');
const Contact = require('../models/contact');
const TimeLine = require('../models/time_line');
const Pipeline = require('../models/pipe_line');
const Organization = require('../models/organization');
const { DEFAULT_STAGES } = require('../configs/system_settings');
const { assignAutomation } = require('../helpers/automation');
const {
  findOrCreateTeamFolder,
  shareResourcesHelper,
} = require('../helpers/team');
const AutomationLine = require('../models/automation_line');
const PipeLine = require('../models/pipe_line');
const { default: mongoose } = require('mongoose');

const init = async (req, res) => {
  const { currentUser } = req;
  const promise_array = [];
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const promise = new Promise((resolve) => {
      const deal_stage = new DealStage({
        user: currentUser.id,
        title: DEFAULT_STAGES[i],
        priority: i,
      });
      deal_stage
        .save()
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          console.log('deal stage err', err.message);
        });
    });
    promise_array.push(promise);
  }
  Promise.all(promise_array)
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err || 'Deal intialize error',
      });
    });
};

const searchDealsByKeyword = async (req, res) => {
  const { currentUser } = req;
  const { keyWord } = req.body;

  const deals = await Deal.find({
    user: currentUser.id,
    title: { $regex: `.*${keyWord}.*` },
  })
    .sort({ priority: 1 })
    .catch((err) => {});
  res.send({
    status: true,
    deals,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;

  const data = await DealStage.find({ user: currentUser.id })
    .populate({
      path: 'deals',
      populate: { path: 'contacts', select: 'first_name last_name email' },
    })
    .sort({ priority: 1 });

  if (!data || !data.length) {
    const promise_array = [];
    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      const promise = new Promise((resolve) => {
        const deal_stage = new DealStage({
          user: currentUser.id,
          title: DEFAULT_STAGES[i],
          priority: i,
        });
        deal_stage
          .save()
          .then((deal) => {
            resolve(deal);
          })
          .catch((err) => {
            console.log('deal stage err', err.message);
          });
      });
      promise_array.push(promise);
    }
    Promise.all(promise_array)
      .then((deals) => {
        return res.send({
          status: true,
          data: deals,
        });
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err || 'Deal intialize error',
        });
      });
  } else {
    return res.send({
      status: true,
      data,
    });
  }
};

const getStage = async (req, res) => {
  const { _id } = req.params;
  const data = await DealStage.findOne({ _id });

  return res.send({
    status: true,
    data,
  });
};

const getStages = async (req, res) => {
  const { currentUser } = req;

  const data = await DealStage.find({ user: currentUser.id }).sort({
    priority: 1,
  });

  return res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const deal_stage = new DealStage({
    ...req.body,
    user: currentUser.id,
  });
  deal_stage
    .save()
    .then((_deal_stage) => {
      return res.send({
        status: true,
        data: _deal_stage,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const add = async (req, res) => {
  const { currentUser } = req;
  const { stages } = req.body;
  const response = [];
  for (let index = 0; index < stages.length; index++) {
    const element = stages[index];
    const deal_stage = new DealStage({
      ...element,
      user: currentUser.id,
    });
    try {
      const stage = await deal_stage.save();
      response.push(stage);
    } catch (err) {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    }
  }
  await updatePipelineVersion(stages[0].pipe_line);
  return res.send({
    status: true,
    data: response,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const { remove_stage, move_stage, assign_automation } = req.body;
  const deal_stage = await DealStage.findOne({
    _id: remove_stage,
    user: currentUser.id,
  }).catch((err) => {
    console.log('deal stage err', err.message);
  });

  if (!deal_stage) {
    return res.status(400).json({
      status: false,
      error: 'Permission invalid',
    });
  }

  if (move_stage) {
    Deal.updateMany(
      {
        _id: { $in: deal_stage.deals },
      },
      {
        $set: {
          deal_stage: move_stage,
        },
      }
    ).catch((err) => {
      console.log('move deals into other stage', err.message);
    });
  }

  const deals = await Deal.find({ _id: { $in: deal_stage.deals } });
  const dealIds = [];
  deals.forEach((e) => {
    dealIds.push(e._id);
  });

  if (move_stage) {
    await DealStage.updateOne(
      { _id: move_stage },
      { $addToSet: { deals: { $each: dealIds } } }
    );
  }

  if (assign_automation) {
    const _move_stage = await DealStage.findOne({ _id: move_stage });
    if (_move_stage && _move_stage.automation) {
      const data = {
        automation_id: _move_stage.automation,
        deals: dealIds,
        user_id: currentUser.id,
      };
      assignAutomation(data);
    }
  }

  DealStage.deleteOne({
    _id: remove_stage,
  })
    .then(async () => {
      await updatePipelineVersion(deal_stage.pipe_line);
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('deal stage remove err', err.message);
    });
};

const edit = async (req, res) => {
  const { currentUser } = req;

  DealStage.updateOne(
    {
      _id: req.params.id,
    },
    {
      $set: { ...req.body },
    }
  )
    .then(async () => {
      const { automation } = req.body;
      if (
        automation &&
        currentUser.organization_info?.is_enabled &&
        currentUser.organization
      ) {
        const sharableAutomationIds = [automation._id];
        let teamId;
        const organization = await Organization.findOne({
          _id: currentUser.organization,
        }).catch((e) => console.log(e.message));
        if (organization) {
          teamId = organization.team;
        }
        if (teamId) {
          const folder = await findOrCreateTeamFolder(teamId);
          const teamFolderIds = [folder._id];
          const resources = [
            { ids: sharableAutomationIds, type: 'automations' },
          ];

          shareResourcesHelper(
            [teamId],
            teamFolderIds,
            resources,
            currentUser,
            [] // rootFolderIds
          );
        }
      }

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('deal stage update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};
const changeOrder = async (req, res) => {
  const orderInfo = req.body;
  for (const prop in orderInfo) {
    console.log(prop, orderInfo[prop]);
    await DealStage.updateOne(
      { _id: prop },
      { $set: { priority: orderInfo[prop] } }
    );
  }
  return res.send({
    status: true,
  });
};

const getEasyLoad = async (req, res) => {
  const { currentUser } = req;
  const pipeline = req.body;
  const query = { user: currentUser.id };
  const pipelines = await Pipeline.find({ user: currentUser._id }).catch(() => {
    console.log('user pipelines loading failed');
  });
  const pipelineIds = pipelines.map((e) => e._id + '');
  if (pipeline && pipeline._id) {
    if (pipelineIds.indexOf(pipeline._id) !== -1) {
      query.pipe_line = pipeline._id;
    } else if (pipelineIds[0]) {
      query.pipe_line = pipelineIds[0];
    }
  }
  let deal_stage = await DealStage.find(query).sort({
    priority: 1,
  });
  if (!deal_stage.length) {
    deal_stage = await DealStage.find({ user: currentUser.id }).sort({
      priority: 1,
    });
  }

  return res.send({
    status: true,
    data: deal_stage,
  });
};

const getStageWithContact = async (req, res) => {
  const { currentUser } = req;

  const stageContacts = await DealStage.aggregate([
    {
      $match: { user: currentUser._id },
    },
    {
      $lookup: {
        from: 'deals',
        localField: 'deals',
        foreignField: '_id',
        as: 'deal_details',
      },
    },
    {
      $group: {
        _id: '$_id',
        contacts: {
          $addToSet: '$deal_details.contacts',
        },
        title: {
          $first: '$title',
        },
        priority: {
          $first: '$priority',
        },
      },
    },
    { $unwind: '$contacts' },
    {
      $addFields: {
        contactIds: {
          $reduce: {
            input: '$contacts',
            initialValue: [],
            in: { $setUnion: ['$$value', '$$this'] },
          },
        },
      },
    },
    {
      $sort: { priority: 1 },
    },
  ])
    .allowDiskUse(true)
    .catch((error) => {
      console.log('get stage with contact', error);
    });

  return res.send({
    status: true,
    data: stageContacts || [],
  });
};

const load = async (req, res) => {
  const { currentUser } = req;
  const { _id } = req.body;

  let query;
  let activePipeline;
  if (_id) {
    query = { ...query, pipe_line: _id };
    activePipeline = await Pipeline.findOne({
      _id,
    });
  }
  if (!activePipeline) {
    if (currentUser.organization_info?.is_enabled && currentUser.organization) {
      activePipeline = await Pipeline.findOne({
        $or: [
          { organization: currentUser.organization },
          { user: currentUser._id },
        ],
      }).sort({ created_at: 1 });
    } else {
      activePipeline = await Pipeline.findOne({
        user: currentUser._id,
      }).sort({ created_at: 1 });
    }
  }

  if (!activePipeline) {
    return res.send({
      status: true,
      data: [],
    });
  }
  query = { ...query, pipe_line: activePipeline._id };
  const _dealStages = await DealStage.find({ ...query })
    .populate({ path: 'automation', select: 'title' })
    .sort({ priority: 1 });
  const stageIds = _dealStages.map((e) => e._id);
  const priceDocs = await Deal.aggregate([
    { $match: { deal_stage: { $in: stageIds } } },
    { $group: { _id: '$deal_stage', totalPrice: { $sum: '$price' } } },
  ]);
  const prices = priceDocs.reduce(
    (data, e) => ({ ...data, [e._id.toString()]: e.totalPrice }),
    {}
  );
  const dealStages = _dealStages.map((stage) => {
    const deals_count = stage.deals.length;
    return {
      ...stage._doc,
      deals_count,
      deals: [],
      price: prices[stage._id.toString()] || 0,
    };
  });
  return res.send({
    status: true,
    data: dealStages,
  });
};

const loadMore = async (req, res) => {
  const { currentUser } = req;
  const { pipe_line, stage, searchStr, filterTeamUsers } = req.body;
  const skip = req.body.skip || 0;
  const count = req.body.count || 50;
  let dealStage;
  let deals;

  let teamMemberFilterQuery = {};
  if (filterTeamUsers?.length) {
    const hasEveryoneOption = filterTeamUsers.some((user) => user._id === null);
    if (!hasEveryoneOption) {
      const memberIds = filterTeamUsers
        .filter((user) => mongoose.Types.ObjectId(user._id))
        .map((user) => mongoose.Types.ObjectId(user._id));
      teamMemberFilterQuery = { team_members: { $in: memberIds } };
    }
  }

  const additionalDataQuery = [
    {
      $addFields: {
        contact_count: { $size: '$contacts' },
        contacts: { $slice: ['$contacts', 0, 2] },
        member_count: { $size: '$team_members' },
        members: { $slice: ['$team_members', 0, 2] },
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: 'primary_contact',
        foreignField: '_id',
        as: 'primary_contact',
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: 'contacts',
        foreignField: '_id',
        as: 'contacts',
      },
    },
    {
      $project: {
        user: 1,
        title: 1,
        deal_stage: 1,
        'contacts._id': 1,
        'contacts.first_name': 1,
        'contacts.last_name': 1,
        'contacts.primary_email': 1,
        'contacts.primary_phone': 1,
        'primary_contact._id': 1,
        'primary_contact.first_name': 1,
        'primary_contact.last_name': 1,
        'primary_contact.primary_email': 1,
        'primary_contact.primary_phone': 1,
        team_members: 1,
        put_at: 1,
        price: 1,
        close_date: 1,
        commision: 1,
      },
    },
  ];
  if (searchStr) {
    const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
    dealStage = await DealStage.findOne({
      _id: stage,
      pipe_line,
    });
    if (dealStage) {
      let contacts = (
        await Deal.find({
          user: currentUser.id,
          deal_stage: dealStage._id,
        }).select({ contacts: 1 })
      ).map((e) => e.contacts);
      contacts = [].concat(...contacts);
      const filteredContacts = await Contact.find({
        _id: { $in: contacts },
        $or: [
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ['$first_name', ' ', '$last_name'] },
                regex: search,
                options: 'i',
              },
            },
          },
        ],
      }).select({ _id: 1 });

      deals = await Deal.aggregate([
        {
          $match: {
            $or: [
              { title: { $regex: search + '.*', $options: 'i' } },
              { contacts: { $elemMatch: { $in: filteredContacts } } },
            ],
            deal_stage: dealStage._id,
            ...teamMemberFilterQuery,
          },
        },
        { $skip: skip },
        { $limit: count },
        ...additionalDataQuery,
      ]);
    }
  } else {
    dealStage = await DealStage.findOne(
      {
        _id: stage,
        pipe_line,
      },
      { deals: { $slice: [skip, count] } }
    ).catch(() => {});
    deals = await Deal.aggregate([
      { $match: { _id: { $in: dealStage.deals }, ...teamMemberFilterQuery } },
      ...additionalDataQuery,
    ]).catch(() => {});
  }
  const dealIds = deals.map((e) => e._id) || [];
  const autoRunningIds = await AutomationLine.aggregate([
    { $match: { deal: { $in: dealIds }, status: 'running' } },
    { $group: { _id: '$deal' } },
  ]);
  const _deals =
    deals?.map((deal) => {
      return {
        ...(deal._doc || deal),
        running_automation:
          autoRunningIds.findIndex(
            (_item) => _item._id.toString() === deal._id.toString()
          ) > -1,
      };
    }) || [];
  return res.send({
    status: true,
    data: _deals,
  });
};

const searchDeals = async (req, res) => {
  const { currentUser } = req;
  const { searchStr } = req.body;

  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');

  const pipe_name = {
    $or: [
      {
        title: { $regex: search + '.*', $options: 'i' },
      },
      {
        'contacts.first_name': {
          $regex: '.*' + search + '.*',
          $options: 'i',
        },
      },
      {
        'contacts.last_name': {
          $regex: '.*' + search + '.*',
          $options: 'i',
        },
      },
      {
        'contacts.first_name': {
          $regex: '.*' + search.split(' ')[0] + '.*',
          $options: 'i',
        },
        'contacts.last_name': {
          $regex: '.*' + search.split(' ')[1] + '.*',
          $options: 'i',
        },
      },
    ],
  };

  const deals = await Deal.aggregate([
    {
      $match: { user: currentUser._id },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: 'contacts',
        foreignField: '_id',
        as: 'contacts',
      },
    },
    {
      $match: pipe_name,
    },
    {
      $limit: 20,
    },
    {
      $lookup: {
        from: 'deal_stages',
        localField: 'deal_stage',
        foreignField: '_id',
        as: 'deal_stage',
      },
    },
    { $unwind: '$deal_stage' },
    {
      $lookup: {
        from: 'pipe_lines',
        localField: 'deal_stage.pipe_line',
        foreignField: '_id',
        as: 'pipe_line',
      },
    },
    { $unwind: '$pipe_line' },
    {
      $project: {
        title: 1,
        user: 1,
        'contacts._id': 1,
        'contacts.first_name': 1,
        'contacts.last_name': 1,
        'contacts.email': 1,
        'contacts.cell_phone': 1,
        'deal_stage._id': 1,
        'deal_stage.title': 1,
        'pipe_line._id': 1,
        'pipe_line.title': 1,
      },
    },
    {
      $sort: { created_at: 1 },
    },
  ]);

  for (let j = 0; j < deals.length; j++) {
    const dealId = deals[j]._id;

    const _timeline = await TimeLine.findOne({
      deal: dealId,
    }).catch((err) => {
      console.log('err', err);
    });

    if (_timeline) {
      deals[j] = {
        ...deals[j],
        running_automation: true,
      };
    }
  }

  return res.send({
    status: true,
    data: deals,
  });
};

const updatePipelineVersion = async (_id) => {
  await PipeLine.updateOne({ _id }, { $inc: { version: 1 } }).catch((err) => {
    console.log('udpate pipeline version error.', err);
  });
};

module.exports = {
  init,
  getAll,
  searchDealsByKeyword,
  getEasyLoad,
  add,
  load,
  loadMore,
  create,
  remove,
  edit,
  changeOrder,
  getStage,
  getStages,
  getStageWithContact,
  searchDeals,
};
