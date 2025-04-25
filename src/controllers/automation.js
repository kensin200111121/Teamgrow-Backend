const mongoose = require('mongoose');
const Automation = require('../models/automation');
const AutomationLine = require('../models/automation_line');
const TimeLine = require('../models/time_line');
const Contact = require('../models/contact');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Team = require('../models/team');
const Deal = require('../models/deal');
const Folder = require('../models/folder');
const DealStage = require('../models/deal_stage');
const PipeLine = require('../models/pipe_line');
const Garbage = require('../models/garbage');
const Event = require('../models/event_type');
const User = require('../models/user');
const Organization = require('../models/organization');

const _ = require('lodash');
const garbageHelper = require('../helpers/garbage');
const {
  downloadVideos,
  downloadImages,
  downloadPdfs,
} = require('../helpers/material');
const {
  getSubTitles,
  downloadAutomations,
  updateAutomations,
  groupByAutomations: groupByAutomationsHelper,
  getActiveAutomationCount,
  triggerAutomation: triggerAutomationHelper,
} = require('../helpers/automation');
const { getTextMaterials } = require('../helpers/utility');
const { uploadFile, removeFile } = require('../helpers/fileUpload');
const urls = require('../constants/urls');
const {
  getAllFolders,
  getPrevFolder,
  getParentFolder,
  getFolderTrees,
} = require('../helpers/folder');
const LeadForm = require('../models/lead_form');

const get = async (req, res) => {
  const { id } = req.body;
  const { currentUser } = req;
  const teams = await Team.find({
    $or: [
      {
        members: currentUser._id,
      },
      { owner: currentUser._id },
    ],
  });
  const count = req.body.count || 50;
  const skip = req.body.skip || 0;
  let isShared = false;
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].automations.includes(id)) {
      isShared = true;
      break;
    }
  }

  await Automation.findOne({ _id: id })
    .then(async (automation) => {
      if (!automation) {
        return res.status(400).send({
          status: false,
          error: 'not_found',
        });
      }
      const isAdmin = automation.role === 'admin' && !automation.user;

      if (
        !isShared &&
        !isAdmin &&
        automation.user.toString() !== currentUser._id.toString()
      ) {
        return res.status(400).send({
          status: false,
          error: 'You do not have access permission.',
        });
      }

      const myJSON = JSON.stringify(automation);
      const data = JSON.parse(myJSON);

      const automation_lines = await AutomationLine.find({
        automation: automation._id,
        user: currentUser._id,
        status: 'running',
      })
        .select({ contact: 1, deal: 1 })
        .catch((err) => console.log('find automation_lines error: ', err));

      const page_deals = [];
      const pages_contacts = [];
      (automation_lines || []).forEach((_item) => {
        if (_item.deal) {
          page_deals.push({ _id: _item.deal });
        }
        if (_item.contact) {
          pages_contacts.push({ _id: _item.contact });
        }
      });
      // deals sort
      (page_deals || []).sort((a, b) =>
        a._id?.toString() < b._id?.toString() ? -1 : 1
      );
      const pageDeals = page_deals.slice(skip, skip + count);
      data.deals = { deals: pageDeals, count: page_deals.length || 0 };

      // sort and page contacts
      pages_contacts.sort((a, b) =>
        a._id?.toString() < b._id?.toString() ? -1 : 1
      );
      const pageContacts = pages_contacts.slice(skip, skip + count);
      data.contacts = {
        contacts: pageContacts,
        count: pages_contacts.length,
      };

      res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Automation reading is failed.',
      });
    });
};

const searchContact = async (req, res) => {
  const { currentUser } = req;
  const searchStr = req.body.search;
  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const phoneSearch = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
  let searched_contacts = [];
  const data = [];

  // get shared contacts first

  if (search.split(' ').length > 1) {
    searched_contacts = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0], $options: 'i' },
          last_name: { $regex: search.split(' ')[1], $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0], $options: 'i' },
          last_name: { $regex: search.split(' ')[1], $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          first_name: { $regex: search, $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search, $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search, $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search, $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          shared_members: currentUser.id,
        },
      ],
    })
      .populate('last_activity')
      .sort({ first_name: 1 });
  } else {
    searched_contacts = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
      ],
    })
      .populate('last_activity')
      .sort({ first_name: 1 });
  }

  if (searched_contacts.length > 0) {
    for (let i = 0; i < searched_contacts.length; i++) {
      const contact = searched_contacts[i];
      const searched_timeline = await TimeLine.findOne({
        contact,
        automation: req.body.automation,
      }).catch((err) => {
        console.log('time line find err', err.message);
      });

      if (searched_timeline) {
        data.push(contact);
      }
    }
  }

  return res.send({
    status: true,
    data,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';
  const automations = await Automation.find({
    user: currentUser.id,
    del: false,
    clone_assign: { $ne: true },
  });

  const _automation_admin = await Automation.find({
    role: 'admin',
    company,
    clone_assign: { $ne: true },
    del: false,
  });

  Array.prototype.push.apply(automations, _automation_admin);

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  }).populate('automations');

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      Array.prototype.push.apply(automations, team.automations);
    }
  }

  if (!automations) {
    return res.status(400).json({
      status: false,
      error: 'Automation doesn`t exist',
    });
  }

  const shared_contacts = await Contact.find({
    shared_members: currentUser.id,
  });

  const automation_array = [];

  for (let i = 0; i < automations.length; i++) {
    const automation = automations[i];
    const contacts = await TimeLine.aggregate([
      {
        $match: {
          $or: [
            {
              user: mongoose.Types.ObjectId(currentUser._id),
              automation: mongoose.Types.ObjectId(automation._id),
            },
            {
              contact: { $in: shared_contacts },
              automation: mongoose.Types.ObjectId(automation._id),
            },
          ],
        },
      },
      {
        $group: {
          _id: { contact: '$contact' },
        },
      },
      {
        $group: {
          _id: '$_id.contact',
        },
      },
      {
        $project: { _id: 1 },
      },
      {
        $count: 'count',
      },
    ]);

    let automation_detail;

    if (automation._doc) {
      automation_detail = {
        ...automation._doc,
        contacts: contacts[0] ? contacts[0].count : 0,
      };
    } else {
      automation_detail = {
        ...automation,
        contacts: contacts[0] ? contacts[0].count : 0,
      };
    }

    automation_array.push(automation_detail);
  }

  const folderArr = await Folder.find({
    user: currentUser._id,
    type: 'automation',
  });
  const folders = (folderArr || []).map((e) => {
    return { ...e._doc, isFolder: true };
  });

  return res.send({
    status: true,
    data: [...folders, ...automation_array],
  });
};

const getParentFolderId = async (req, res) => {
  const { currentUser } = req;
  const { itemId, itemType } = req.body;

  let searchType;
  if (itemType === 'folder') searchType = 'folders';
  else searchType = 'automations';

  const folder_info = await getParentFolder(currentUser.id, itemId, searchType);
  if (folder_info) {
    return res.json({
      status: true,
      data: {
        folderId: folder_info._id,
        rootFolder: folder_info.rootFolder,
      },
    });
  }

  return res.json({
    status: false,
    data: {},
  });
};

const load = async (req, res) => {
  const { currentUser } = req;
  const { folder } = req.body;
  let { search, loadType } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  if (!loadType) {
    loadType = '';
  }

  let root_folder;
  let prevId = '';
  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      user: currentUser.id,
      rootFolder: true,
      del: false,
    });
  } else {
    root_folder = await Folder.findOne({
      _id: folder,
      user: currentUser.id,
    });
  }

  if (!root_folder) {
    return res.send({
      status: true,
      data: {
        results: [],
        prevFolder: prevId,
      },
    });
  }
  const prev_folder = await Folder.findOne({
    folders: { $in: root_folder.id },
    role: { $ne: 'team' },
  });
  if (prev_folder && !prev_folder.rootFolder) {
    prevId = prev_folder.id;
  }

  const automation_query = {
    _id: { $in: root_folder.automations },
    clone_assign: { $ne: true },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'automation',
    del: false,
  };
  let automation_list = [];
  let folder_list = [];

  if (search) {
    folder_list = await getAllFolders(
      'automation',
      root_folder.folders,
      root_folder.folders
    );
    let automationIds = root_folder.automations;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_list.length; i++) {
      automationIds = [...automationIds, ...folder_list[i].automations];
      folderIds = [...folderIds, ...folder_list[i].folders];
    }
    automation_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    automation_query['_id'] = { $in: automationIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
  automation_list = await Automation.find(automation_query)
    .select('-automations')
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });
  folder_list = await Folder.find(folder_query)
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  const shared_contacts = await Contact.find({
    shared_members: currentUser.id,
  });

  let sharedWithDic = {};
  if (!loadType) {
    const automationIds = automation_list.map((e) => e._id + '');
    const folderIds = folder_list.map((e) => e._id + '');
    const teams = await Team.find({
      $or: [
        { automations: { $elemMatch: { $in: automationIds } } },
        { folders: { $elemMatch: { $in: folderIds } } },
      ],
    });
    const teamDics = [];
    teams.forEach((_team) => {
      const teamInfo = { _id: _team._id, name: _team.name };
      _team.automations.forEach((e) => {
        if (automationIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
      _team.folders.forEach((e) => {
        if (folderIds.includes(e + '')) {
          teamDics.push({ [e + '']: teamInfo });
        }
      });
    });
    sharedWithDic = _.groupBy(teamDics, (e) => Object.keys(e)[0]);
  }

  const automation_array = [];

  for (let i = 0; i < automation_list.length; i++) {
    const automation = automation_list[i];
    // const counts = await AutomationLine.countDocuments({
    //   automation: automation._id,
    //   status: { $in: ['running'] },
    // });

    let automation_detail = automation._doc || automation;

    automation_detail = {
      ...automation_detail,
      item_type: automation_detail.type,
      contacts: 0,
      shared_with: sharedWithDic[automation_detail._id],
    };

    automation_array.push(automation_detail);
  }

  const folderArr = (folder_list || []).map((e) => {
    return {
      ...e._doc,
      item_type: 'folder',
      shared_with: sharedWithDic[e._id],
    };
  });

  return res.send({
    status: true,
    data: {
      results: [...folderArr, ...automation_array],
      prevFolder: prevId,
      currentFolder: root_folder,
    },
  });
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
  let automation_list = [];
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
    }).sort({ created_at: 1 });
    const admin_folder = await Folder.findOne({
      rootFolder: true,
      role: 'admin',
      del: false,
    });
    root_folder = {
      ...admin_folder._doc,
    };
    const companyFolders = await Folder.find(
      {
        _id: { $in: root_folder.folders },
        company: currentUser.company,
      },
      { _id: 1 }
    ).catch((err) => {});
    const companyFolderIds = (companyFolders || []).map((e) => e._id);
    root_folder.folders = companyFolderIds;
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

  const automation_query = {
    _id: { $in: root_folder.automations },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    $or: [{ type: 'automation' }, { team: { $exists: true }, role: 'team' }],
    del: { $ne: true },
  };

  if (search) {
    folder_list = await getAllFolders(
      'automation',
      root_folder.folders,
      root_folder.folders
    );

    let automationIds = root_folder.automations;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_list.length; i++) {
      automationIds = [...automationIds, ...folder_list[i].automations];
      folderIds = [...folderIds, ...folder_list[i].folders];
    }
    automation_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    automation_query['_id'] = { $in: automationIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
  automation_list = await Automation.find(automation_query)
    .select('-automations')
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  folder_list = await Folder.find(folder_query)
    .sort({ created_at: 1 })
    .populate({ path: 'team_id', select: '_id name' });

  const automationIds = automation_list.map((_automation) => _automation._id);
  const automationsInfo = await Automation.aggregate([
    { $match: { original_id: { $in: automationIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const automationDownloadCount = {};
  automationsInfo.forEach((e) => {
    automationDownloadCount[e._id] = e.count;
  });

  const automationOwnerIds = [];
  folder_list.forEach((e) => {
    automationOwnerIds.push(e.user);
  });
  automation_list.forEach((e) => {
    automationOwnerIds.push(e.user);
  });
  const _automation_owners = await User.find({
    _id: { $in: automationOwnerIds },
  }).select('_id user_name');
  const _automation_owner_objects = {};
  _automation_owners.forEach((e) => {
    _automation_owner_objects[e._id] = e;
  });

  const _folders = (folder_list || []).map((e) => {
    return {
      ...e._doc,
      isFolder: true,
      item_type: 'folder',
      owner: _automation_owner_objects[e.user],
      team_info: team,
    };
  });

  const automation_detail_list = [];
  for (let i = 0; i < automation_list.length; i++) {
    let automation_detail = automation_list[i]._doc || automation_list[i];
    automation_detail = {
      ...automation_detail,
      item_type: automation_detail.type,
      downloads: automationDownloadCount[automation_detail._id] || 0,
      owner: _automation_owner_objects[automation_detail.user],
      team_info: team,
    };
    automation_detail_list.push(automation_detail);
  }
  const _automations = [..._folders, ...automation_detail_list];

  return res.send({
    status: true,
    data: {
      results: _automations,
      prevFolder: prevId,
      team,
    },
  });
};

const getAssignedContacts = async (req, res) => {
  const { id } = req.params;
  const { currentUser } = req;
  const contacts = await TimeLine.aggregate([
    {
      $match: {
        $and: [
          {
            user: mongoose.Types.ObjectId(currentUser._id),
            automation: mongoose.Types.ObjectId(id),
          },
        ],
      },
    },
    {
      $group: {
        _id: { contact: '$contact' },
      },
    },
    {
      $group: {
        _id: '$_id.contact',
      },
    },
    {
      $project: { _id: 1 },
    },
  ]);
  const ids = [];
  contacts.forEach((e) => {
    ids.push(e._id);
  });
  const assignedContacts = await Contact.find(
    { _id: { $in: ids } },
    '_id first_name last_name email cell_phone'
  ).catch((err) => {
    console.log('Error', err);
  });
  res.send({
    status: true,
    data: assignedContacts,
  });
};

const getPage = async (req, res) => {
  const { currentUser } = req;
  const { page } = req.params;

  const garbage = await garbageHelper.get(currentUser);
  // let editedAutomations = [];
  // if(garbage) {
  //     editedAutomations = garbage['edited_automation']
  // }

  const team_automations = [];
  const teams = await Team.find({ members: currentUser.id });

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      if (team.automations) {
        Array.prototype.push.apply(team_automations, team.automations);
      }
    }
  }

  const automations = await Automation.find({
    $or: [
      { user: currentUser.id },
      { role: 'admin' },
      { _id: { $in: team_automations } },
    ],
  })
    .skip((page - 1) * 10)
    .limit(10);
  const automation_array = [];
  for (let i = 0; i < automations.length; i++) {
    const automation = automations[i];
    const contacts = await TimeLine.aggregate([
      {
        $match: {
          $and: [
            {
              user: mongoose.Types.ObjectId(currentUser._id),
              automation: mongoose.Types.ObjectId(automation._id),
            },
          ],
        },
      },
      {
        $group: {
          _id: { contact: '$contact' },
        },
      },
      {
        $group: {
          _id: '$_id.contact',
        },
      },
      {
        $project: { _id: 1 },
      },
    ]);
    const myJSON = JSON.stringify(automation);
    const data = JSON.parse(myJSON);
    const automation_detail = await Object.assign(data, { contacts });

    automation_array.push(automation_detail);
  }

  const total = await Automation.countDocuments({
    $or: [{ user: currentUser.id }, { role: 'admin' }],
  });

  return res.json({
    status: true,
    data: automation_array,
    total,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  if (!currentUser.automation_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable automations',
    });
  }
  const { automations } = req.body;
  for (let i = 0; i < automations.length; i++) {
    if (
      automations[i].action.type === 'email' &&
      automations[i].action.attachments
    ) {
      const attachments = automations[i].action.attachments;
      for (let j = 0; j < attachments.length; j++) {
        const content = new Buffer.from(attachments[j].content, 'base64');
        try {
          const attachmentUrl = await uploadFile(
            content,
            attachments[j].type,
            'attachment'
          );
          automations[i].action.attachments[j]['url'] = attachmentUrl;
          automations[i].action.attachments[j]['content'] = '';
        } catch (err) {
          console.log('upload attachment err', err);
        }
      }
    }
  }
  const automation = new Automation({
    ...req.body,
    user: currentUser.id,
  });
  await automation
    .save()
    .then(async (_automation) => {
      if (req.body.folder) {
        await Folder.updateOne(
          {
            _id: req.body['folder'],
            user: currentUser._id,
            type: 'automation',
          },
          { $addToSet: { automations: { $each: [_automation._id] } } }
        ).catch((err) => {
          console.log('folder update is failed');
        });
      } else {
        await Folder.updateOne(
          {
            rootFolder: true,
            user: currentUser._id,
          },
          { $addToSet: { automations: { $each: [_automation._id] } } }
        ).catch((err) => {
          console.log('folder update is failed');
        });
      }
      res.send({
        status: true,
        data: _automation,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      res.status(500).send({
        status: false,
        error: err.message || 'Automation creating is failed.',
      });
    });
};

/**
 * Download Automation
 * @param {*} req: body: { id: main automation id to download, ids: automation ids to download, videoIds: video ids that included, pdfIds, imageIds, stageInfo }
 * @param {*} res
 * @returns
 */
const download = async (req, res) => {
  const { currentUser } = req;
  const {
    id,
    ids,
    videoIds,
    imageIds,
    pdfIds,
    stageInfo,
    is_sharable,
    original_id,
  } = req.body;
  if (!currentUser.automation_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable automations',
    });
  }
  let automationsDic = {};
  let videosDic = {};
  let imagesDic = {};
  let pdfsDic = {};
  let stagesDic = {};
  if (ids.length) {
    automationsDic = await downloadAutomations(
      id,
      ids,
      currentUser._id,
      original_id,
      is_sharable
    );
  }
  if (videoIds.length) {
    videosDic = await downloadVideos(videoIds, currentUser._id, is_sharable);
  }
  if (pdfIds.length) {
    pdfsDic = await downloadPdfs(pdfIds, currentUser._id, is_sharable);
  }
  if (imageIds.length) {
    imagesDic = await downloadImages(imageIds, currentUser._id, is_sharable);
  }
  if (stageInfo) {
    stagesDic = await matchOrDownloadStages(stageInfo, currentUser._id);
  }
  await updateAutomations(
    automationsDic,
    videosDic,
    pdfsDic,
    imagesDic,
    stagesDic
  );
  res.send({
    status: true,
  });
};

const bulkDownload = async (req, res) => {
  const { currentUser } = req;
  const { data } = req.body;
  const promises = [];
  data.forEach((e) => {
    const createPromise = new Promise(async (resolve, reject) => {
      const {
        id,
        ids,
        videoIds,
        imageIds,
        pdfIds,
        stageInfo,
        original_id,
        is_sharable,
      } = e;
      if (!currentUser.automation_info['is_enabled']) {
        // return res.status(412).send({
        //   status: false,
        //   error: 'Disable automations',
        // });
        reject();
      }
      let automationsDic = {};
      let videosDic = {};
      let imagesDic = {};
      let pdfsDic = {};
      let stagesDic = {};
      if (ids.length) {
        automationsDic = await downloadAutomations(
          id,
          ids,
          currentUser._id,
          original_id,
          is_sharable
        );
      }
      if (videoIds.length) {
        videosDic = await downloadVideos(
          videoIds,
          currentUser._id,
          is_sharable
        );
      }
      if (pdfIds.length) {
        pdfsDic = await downloadPdfs(pdfIds, currentUser._id, is_sharable);
      }
      if (imageIds.length) {
        imagesDic = await downloadImages(
          imageIds,
          currentUser._id,
          is_sharable
        );
      }
      if (stageInfo) {
        stagesDic = await matchOrDownloadStages(stageInfo, currentUser._id);
      }
      await updateAutomations(
        automationsDic,
        videosDic,
        pdfsDic,
        imagesDic,
        stagesDic
      );
      resolve();
    });
    promises.push(createPromise);
  });
  Promise.all(promises).then(() => {
    return res.send({
      status: true,
    });
  });
};

/**
 * Generates the stages update dictionary
 * @param {*} stageInfo: { mode: 'create' | 'match', original_pipeline, new_pipeline, detail: { [original_stage_id]: { dealStage: stage id to match | '' }}}
 * @param {*} user: current user id
 * @returns
 */
const matchOrDownloadStages = async (stageInfo, user) => {
  const stagesDic = {};
  if (stageInfo['mode'] === 'create') {
    const originalPipeline = stageInfo['original_pipeline'];
    const _originalPipeline = await PipeLine.findById(originalPipeline);
    const newPipeline = new PipeLine({
      title: _originalPipeline.title,
      user,
    });
    const _newPipeline = await newPipeline.save();
    const originalStages = await DealStage.find({
      pipe_line: originalPipeline,
    });
    for (let i = 0; i < originalStages.length; i++) {
      const originalStage = originalStages[i];
      const newStage = new DealStage({
        title: originalStage.title,
        deals: [],
        user,
        priority: originalStage.priority,
        pipe_line: _newPipeline.id,
      });
      const _newStage = await newStage.save();
      stagesDic[originalStage._id] = _newStage._id;
    }
  } else {
    const newPipeline = stageInfo['new_pipeline'];
    const originalStageIds = Object.keys(stageInfo['detail']);
    const originalStages = await DealStage.find({
      _id: { $in: originalStageIds },
    });
    const originalStagesDic = {};
    originalStages.forEach((e) => {
      originalStagesDic[e._id] = e;
    });
    for (const stage in stageInfo['detail']) {
      if (stageInfo['detail'][stage]['dealStage']) {
        stagesDic[stage] = stageInfo['detail'][stage]['dealStage'];
      } else {
        const originalStage = originalStagesDic[stage];
        const newStage = new DealStage({
          title: originalStage.title,
          deals: [],
          user,
          priority: 1000,
          pipe_line: newPipeline,
        });
        const _newStage = await newStage.save();
        stagesDic[stage] = _newStage._id;
      }
    }
  }
  return stagesDic;
};

const loadIncludings = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.body;
  if (!currentUser.automation_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable automations',
    });
  }
  const subAutomations = await getSubAutomations([id], [id]);
  const automationIds = [id, ...subAutomations];
  const automations = await Automation.find({ _id: { $in: automationIds } });
  const automationTitles = [];
  let videoIds = [];
  let imageIds = [];
  let pdfIds = [];
  const dealStageIds = [];
  automations.forEach((automation) => {
    const actions = automation.automations;
    automationTitles.push(automation.title);
    actions.forEach((action) => {
      const detail = action.action;
      let video_ids = [];
      let pdf_ids = [];
      let image_ids = [];
      if (detail.type === 'text') {
        const {
          videoIds: vIds,
          pdfIds: pIds,
          imageIds: iIds,
        } = getTextMaterials(detail.content);
        video_ids = vIds;
        pdf_ids = pIds;
        image_ids = iIds;
      } else {
        video_ids = detail.videos || [];
        pdf_ids = detail.pdfs || [];
        image_ids = detail.images || [];
      }
      videoIds = [...videoIds, ...video_ids];
      pdfIds = [...pdfIds, ...pdf_ids];
      imageIds = [...imageIds, ...image_ids];
      if (detail.deal_stage) {
        dealStageIds.push(detail.deal_stage);
      }
    });
  });
  const videos = await Video.find({ _id: { $in: videoIds } });
  const images = await Image.find({ _id: { $in: imageIds } });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } });
  const dealStages = await DealStage.find({ _id: { $in: dealStageIds } });
  return res.send({
    status: true,
    data: {
      ids: automationIds,
      titles: automationTitles,
      videoIds,
      videos,
      imageIds,
      images,
      pdfIds,
      pdfs,
      dealStages,
    },
  });
};

const loadAllIncludings = async (req, res) => {
  const { currentUser } = req;
  const { ids } = req.body;
  if (!currentUser.automation_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable automations',
    });
  }
  const promises = [];
  ids.forEach((id) => {
    const createPromise = new Promise(async (resolve, reject) => {
      const subAutomations = await getSubAutomations([id], [id]);
      const automationIds = [id, ...subAutomations];
      const automations = await Automation.find({
        _id: { $in: automationIds },
      });
      const automationTitles = [];
      let videoIds = [];
      let imageIds = [];
      let pdfIds = [];
      const dealStageIds = [];
      automations.forEach((automation) => {
        const actions = automation.automations;
        automationTitles.push(automation.title);
        actions.forEach((action) => {
          const detail = action.action;
          let video_ids = [];
          let pdf_ids = [];
          let image_ids = [];
          if (detail.type === 'text') {
            const {
              videoIds: vIds,
              pdfIds: pIds,
              imageIds: iIds,
            } = getTextMaterials(detail.content);
            video_ids = vIds;
            pdf_ids = pIds;
            image_ids = iIds;
          } else {
            video_ids = detail.videos || [];
            pdf_ids = detail.pdfs || [];
            image_ids = detail.images || [];
          }
          videoIds = [...videoIds, ...video_ids];
          pdfIds = [...pdfIds, ...pdf_ids];
          imageIds = [...imageIds, ...image_ids];
          if (detail.deal_stage) {
            dealStageIds.push(detail.deal_stage);
          }
        });
      });
      const videos = await Video.find({ _id: { $in: videoIds } });
      const images = await Image.find({ _id: { $in: imageIds } });
      const pdfs = await PDF.find({ _id: { $in: pdfIds } });
      const dealStages = await DealStage.find({ _id: { $in: dealStageIds } });
      const data = {
        ids: automationIds,
        titles: automationTitles,
        videoIds,
        videos,
        imageIds,
        images,
        pdfIds,
        pdfs,
        dealStages,
      };
      resolve({ id, data });
    });
    promises.push(createPromise);
  });
  Promise.all(promises).then((data) => {
    return res.send({
      status: true,
      data,
    });
  });
};

/**
 * Get the sub automations
 * @param {*} ids: parent automations array
 * @param {*} tracked: tracked automations array
 * @returns
 */
const getSubAutomations = async (ids, tracked) => {
  const automations = await Automation.find({ _id: { $in: ids } });
  const subAutomationIds = [];
  automations.forEach((automation) => {
    const actions = automation.automations;
    actions.forEach((action) => {
      const detail = action.action;
      if (detail.automation_id && !tracked.includes(detail.automation_id)) {
        subAutomationIds.push(detail.automation_id);
      }
    });
  });
  if (subAutomationIds.length) {
    const newTracked = [...tracked, ...subAutomationIds];
    const anotherSubAutomationIds = await getSubAutomations(
      subAutomationIds,
      newTracked
    );
    return [...subAutomationIds, ...anotherSubAutomationIds];
  } else {
    return [];
  }
};

const getTitles = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.body;
  if (!currentUser.automation_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable automations',
    });
  }
  const subTitles = [];
  const videoIds = [];
  const videoTitles = [];
  const pdfIds = [];
  const pdfTitless = [];
  const imageIds = [];
  const imageTitles = [];
  const dealStageTitles = [];
  const subIds = [];
  const allIds = [];
  allIds.push(id);
  subIds.push(id);
  const result = await getSubTitles(
    allIds,
    subIds,
    subTitles,
    videoIds,
    videoTitles,
    pdfIds,
    pdfTitless,
    imageIds,
    imageTitles,
    dealStageTitles
  );
  return res.send({
    status: true,
    data: result,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const data = req.body;
  let automation = await Automation.findOne({ _id: id });
  automation = JSON.parse(JSON.stringify(automation));
  if (automation) {
    if (automation.user !== currentUser.id) {
      if (automation.role === 'admin') {
        return res.status(400).send({
          status: false,
          error: `couldn't update admin automation`,
        });
      }
      return res.status(400).send({
        status: false,
        error: `This is not your automation so couldn't update.`,
      });
    }
  } else {
    return res.status(400).send({
      status: false,
      error: `Automation doesn't exist`,
    });
  }

  const oldActions = automation['automations']
    .map((e) => e.action)
    .filter((e) => e.type === 'email' && e.attachments?.length);
  let oldAttachments = [];
  oldActions.forEach((action) => {
    oldAttachments = [...oldAttachments, ...action.attachments];
  });

  const { automations } = data;
  const newAttachments = [];
  for (let i = 0; i < automations.length; i++) {
    if (
      automations[i].action.type === 'email' &&
      automations[i].action.attachments
    ) {
      const attachments = automations[i].action.attachments;
      for (let j = 0; j < attachments.length; j++) {
        let attachmentUrl = attachments[j].url;
        if (!attachmentUrl) {
          try {
            const content = new Buffer.from(attachments[j].content, 'base64');
            attachmentUrl = await uploadFile(
              content,
              attachments[j].type,
              'attachment'
            );
            automations[i].action.attachments[j]['url'] = attachmentUrl;
            automations[i].action.attachments[j]['content'] = '';
          } catch (err) {
            console.log('upload attachment err', err);
          }
        }
        newAttachments.push({
          byte: attachments[j].byte,
          filename: attachments[j].filename,
          url: attachmentUrl,
        });
      }
    }
  }
  // Remove attachment
  const attachmentToRemove = oldAttachments.filter(
    (o1) =>
      !newAttachments.some((o2) => {
        return o1.url === o2.url;
      })
  );
  if (attachmentToRemove.length) {
    try {
      await removeAttachments(attachmentToRemove);
    } catch (err) {
      console.log('remove attachment err', err);
    }
  }

  Automation.updateOne({ _id: id }, { $set: data })
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message || 'Automation Updating is failed.',
      });
    });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const folder = req.body.folder || '';
  const automation = await Automation.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!automation) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission.',
    });
  }

  const error_message = [];
  const stages = await DealStage.find({
    user: currentUser.id,
    automation: req.params.id,
  }).catch((err) => {
    console.log('err', err.message);
  });

  if (stages.length > 0) {
    error_message.push({
      reason: 'stages',
      stages,
    });
  }

  const garbageCaptureField = await Garbage.findOne(
    {
      user: currentUser.id,
    },
    { capture_field: 1, smart_codes: 1, _id: 0 }
  ).catch((err) => {
    console.log('err', err.message);
  });

  const lead_form_docs = await LeadForm.find({
    automation: automation._id,
  }).catch((err) => {
    console.log('err', err.message);
  });
  if (lead_form_docs.length > 0) {
    const lead_forms = lead_form_docs.map((item) => item.name);
    error_message.push({
      reason: 'lead_forms',
      lead_forms,
    });
  }

  const smartCodes = garbageCaptureField.smart_codes;
  const errSmartCodes = [];
  for (const key in smartCodes) {
    if (
      smartCodes[key].automation &&
      smartCodes[key].automation === automation.id
    ) {
      errSmartCodes.push(key);
    }
  }

  if (errSmartCodes.length > 0) {
    error_message.push({
      reason: 'smartcodes',
      smartcodes: errSmartCodes,
    });
  }

  const event_types = await Event.find({
    automation: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('err', err.message);
  });

  if (event_types.length > 0) {
    error_message.push({
      reason: 'event_types',
      event_types,
    });
  }

  const automations = await Automation.find({
    user: currentUser.id,
    automations: {
      $elemMatch: {
        'action.type': 'automation',
        'action.automation_id': req.params.id,
      },
    },
  }).catch((err) => {
    console.log('err', err.message);
  });

  if (automations.length > 0) {
    error_message.push({
      reason: 'automations',
      automations,
    });
  }

  // get timelines for cloned and native logic.
  const automation_lines = await AutomationLine.find({
    automation: automation._id,
    status: 'running',
    user: currentUser._id,
  }).select({ _id: 1 });
  const automation_line_ids = automation_lines.map((item) =>
    mongoose.Types.ObjectId(item._id)
  );
  automation_line_ids.push(mongoose.Types.ObjectId(automation._id));

  if (automation_line_ids.length > 0) {
    const timeline = await TimeLine.findOne({
      user: currentUser.id,
      automation_line: { $in: automation_line_ids },
    });

    if (timeline) {
      error_message.push({
        reason: 'running',
      });
    }
  }

  const teams = await Team.find({
    automations: req.params.id,
  });

  if (teams.length > 0) {
    error_message.push({
      reason: 'shared teams',
      teams,
    });
  }

  if (error_message.length > 0) {
    return res.send({
      status: true,
      error_message,
    });
  }

  // if (automation.role === 'team') {
  //   Team.update(
  //     { automations: req.params.id },
  //     {
  //       $pull: { automations: { $in: [req.params.id] } },
  //     }
  //   );
  // }

  // get attachments
  let attachments = [];
  const actions = automation['automations']
    .map((e) => e.action)
    .filter((e) => e.type === 'email' && e.attachments?.length);
  actions.forEach((action) => {
    attachments = [...attachments, ...action.attachments];
  });

  await Automation.deleteOne({ _id: req.params.id })
    .then(async () => {
      if (folder) {
        await Folder.updateOne(
          {
            _id: folder,
          },
          {
            $pull: { automations: { $in: [req.params.id] } },
          }
        );
      } else {
        await Folder.updateOne(
          {
            rootFolder: true,
            user: currentUser.id,
          },
          {
            $pull: { automations: { $in: [req.params.id] } },
          }
        );
      }

      if (attachments.length) {
        try {
          await removeAttachments(attachments);
        } catch (err) {
          console.log('remove attachment err', err);
        }
      }
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || 'Automation Removing is failed.',
      });
    });
};

const bulkRemove = async (req, res) => {
  const { currentUser } = req;
  const { automations, folders } = req.body;
  const folder = req.body.folder || '';

  const errors = [];
  const promise_array = [];
  const automationIds = [];

  let allFolders = [];
  let allAutomations = automations || [];
  if ((folders || []).length) {
    allFolders = await getAllFolders('automation', folders, folders);
  }
  allFolders.forEach((e) => {
    allAutomations = [...allAutomations, ...e.automations];
  });

  if (allAutomations.length) {
    for (let i = 0; i < allAutomations.length; i++) {
      const promise = new Promise(async (resolve) => {
        const automation = await Automation.findOne({
          _id: allAutomations[i],
          user: currentUser.id,
        });

        if (automation) {
          const error_message = [];
          const stages = await DealStage.find({
            user: currentUser.id,
            automation: automation._id,
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (stages.length > 0) {
            error_message.push({
              reason: 'stages',
              stages,
            });
          }

          const garbage = await Garbage.findOne(
            {
              user: currentUser.id,
            },
            { capture_field: 1, smart_codes: 1, _id: 0 }
          ).catch((err) => {
            console.log('err', err.message);
          });

          const lead_form_docs = await LeadForm.find({
            automation: automation._id,
          }).catch((err) => {
            console.log('err', err.message);
          });
          if (lead_form_docs.length > 0) {
            const lead_forms = lead_form_docs.map((item) => item.name);
            error_message.push({
              reason: 'lead_forms',
              lead_forms,
            });
          }

          const smartCodes = garbage.smart_codes;
          const errSmartCodes = [];
          for (const key in smartCodes) {
            if (
              smartCodes[key].automation &&
              smartCodes[key].automation === automation.id
            ) {
              errSmartCodes.push(key);
            }
          }

          if (errSmartCodes.length > 0) {
            error_message.push({
              reason: 'smartcodes',
              smartcodes: errSmartCodes,
            });
          }

          const event_types = await Event.find({
            automation: automation._id,
            user: currentUser.id,
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (event_types.length > 0) {
            error_message.push({
              reason: 'event_types',
              event_types,
            });
          }

          const automations = await Automation.find({
            user: currentUser.id,
            automations: {
              $elemMatch: {
                'action.type': 'automation',
                'action.automation_id': automation.id,
              },
            },
          }).catch((err) => {
            console.log('err', err.message);
          });

          if (automations.length > 0) {
            error_message.push({
              reason: 'automations',
              automations,
            });
          }

          // get timelines for automation_line and native logic.
          const automation_lines = await AutomationLine.find({
            automation: automation._id,
            status: 'running',
            user: currentUser._id,
          }).select({ _id: 1 });

          if (automation_lines.length) {
            error_message.push({
              reason: 'running',
            });
          }

          if (error_message.length > 0) {
            if (error_message.length > 0) {
              errors.push({
                automation_id: automation._id,
                automation_title: automation.title,
                error_message,
              });
            }

            resolve();
          } else {
            await Team.updateOne(
              { automations: allAutomations[i] },
              {
                $pull: { automations: { $in: [allAutomations[i]] } },
              }
            ).catch((err) => {
              console.log('err', err.message);
            });
            automationIds.push(automation._id);
            await Automation.deleteOne({ _id: automation._id }).catch((err) => {
              console.log('err', err.message);
            });
            // remove attachments
            let attachments = [];
            const actions = automation['automations']
              .map((e) => e.action)
              .filter((e) => e.type === 'email' && e.attachments?.length);
            actions.forEach((action) => {
              attachments = [...attachments, ...action.attachments];
            });
            if (attachments.length) {
              try {
                await removeAttachments(attachments);
              } catch (err) {
                console.log('remove attachment err', err);
              }
            }
            resolve();
          }
        } else {
          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  Promise.all(promise_array)
    .then(async () => {
      if (!errors.length) {
        if (allFolders.length) {
          await Folder.updateMany(
            { _id: { $in: allFolders } },
            { $set: { del: true } }
          );
        }
        if (folder) {
          await Folder.updateOne(
            {
              _id: folder,
            },
            {
              $pull: { automations: { $in: automationIds } },
            }
          );
        } else {
          await Folder.updateOne(
            {
              rootFolder: true,
              user: currentUser.id,
            },
            {
              $pull: { automations: { $in: automationIds } },
            }
          );
        }
      }
      return res.json({
        status: true,
        failed: errors,
      });
    })
    .catch((err) => {
      console.log('automation bulk remove err', err.message);
      res.status(500).json({
        status: false,
        error: err.message,
      });
    });

  // const error_message = [];
  // const remove_promise = new Promise(async (resolve) => {
  //   const stages = await DealStage.find({
  //     user: currentUser.id,
  //     automation: { $in: data },
  //   }).catch((err) => {
  //     console.log('err', err.message);
  //   });

  //   if (stages.length > 0) {
  //     error_message.push({
  //       reason: 'stages',
  //       stages,
  //     });
  //   }

  //   const garbageCaptureField = await Garbage.find(
  //     {
  //       user: currentUser.id,
  //     },
  //     { capture_field: 1, _id: 0 }
  //   ).catch((err) => {
  //     console.log('err', err.message);
  //   });

  //   const garbages = [];
  //   const captureValues = Object.values(garbageCaptureField[0].capture_field);
  //   for (let i = 0; i < captureValues.length; i++) {
  //     if (captureValues[i].automation) {
  //       if (data.findIndex((e) => e === captureValues[i].automation) !== -1) {
  //         garbages.push(captureValues[i].name);
  //       }
  //     }
  //   }

  //   if (garbages.length > 0) {
  //     error_message.push({
  //       reason: 'garbages',
  //       garbages,
  //     });
  //   }

  //   const event_types = await Event.find({
  //     automation: { $in: data },
  //     user: currentUser.id,
  //   }).catch((err) => {
  //     console.log('err', err.message);
  //   });

  //   if (event_types.length > 0) {
  //     error_message.push({
  //       reason: 'event_types',
  //       event_types,
  //     });
  //   }

  //   const subautomations = await Automation.find({
  //     user: currentUser.id,
  //     _id: { $in: data },
  //     automations: {
  //       $elemMatch: {
  //         'action.type': 'automation',
  //       },
  //     },
  //   }).catch((err) => {
  //     console.log('err', err.message);
  //   });

  //   if (subautomations.length > 0) {
  //     error_message.push({
  //       reason: 'subautomations',
  //       subautomations,
  //     });
  //   }

  //   if (error_message.length > 0) {
  //     resolve();
  //   } else {
  //     for (let i = 0; i < data.length; i++) {
  //       const automation = await Automation.findOne({
  //         _id: data[i],
  //         user: currentUser.id,
  //       });
  //       if (automation.role === 'team') {
  //         Team.updateOne(
  //           { automations: data[i] },
  //           {
  //             $pull: { automations: { $in: [data[i]] } },
  //           }
  //         );
  //       }
  //     }

  //     await Automation.deleteMany({ _id: { $in: data } }).catch((err) => {
  //       console.log('err', err.message);
  //     });
  //     resolve();
  //   }
  // });

  // remove_promise
  //   .then(() => {
  //     return res.send({
  //       status: true,
  //       error_message,
  //     });
  //   })
  //   .catch((err) => {
  //     return res.status(500).send({
  //       status: false,
  //       error: err.message || 'Automation Removing is failed.',
  //     });
  //   });
};

const search = async (req, res) => {
  const condition = req.body;
  const { currentUser } = req;
  const company = currentUser.company || 'eXp Realty';

  const team_automations = [];
  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  });

  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      if (team.automations) {
        Array.prototype.push.apply(team_automations, team.automations);
      }
    }
  }

  Automation.find({
    $and: [
      {
        $or: [
          { user: currentUser.id },
          { role: 'admin', company },
          { _id: { $in: team_automations } },
        ],
      },
      {
        title: { $regex: `.*${condition.search}.*`, $options: 'i' },
      },
    ],
  })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
      });
    });
};

const updateDefault = async (req, res) => {
  const { automation, id } = req.body;
  let thumbnail;
  const { currentUser } = req;

  const defaultAutomation = await Video.findOne({
    _id: id,
    role: 'admin',
  }).catch((err) => {
    console.log('err', err);
  });
  if (!defaultAutomation) {
    return res.status(400).json({
      status: false,
      error: 'This Default automation not exists',
    });
  }
  // Update Garbage
  const garbage = await garbageHelper.get(currentUser);
  if (!garbage) {
    return res.status(400).send({
      status: false,
      error: `Couldn't get the Garbage`,
    });
  }
  if (garbage.edited_automation) {
    garbage.edited_automation.push(id);
  } else {
    garbage.edited_automation = [id];
  }

  await garbage.save().catch((err) => {
    return res.status.json({
      status: false,
      error: 'Update Garbage Error.',
    });
  });

  for (const key in automation) {
    defaultAutomation[key] = automation[key];
  }
  if (thumbnail) {
    defaultAutomation.thumbnail = thumbnail;
  }

  defaultAutomation.updated_at = new Date();
  const defaultAutomationJSON = JSON.parse(JSON.stringify(defaultAutomation));
  delete defaultAutomationJSON._id;
  delete defaultAutomationJSON.role;
  const newAutomation = new Automation({
    ...defaultAutomationJSON,
    user: currentUser._id,
    default_edited: true,
  });
  const _automation = await newAutomation
    .save()
    .then()
    .catch((err) => {
      console.log('err', err);
    });

  return res.send({
    status: true,
    data: _automation,
  });
};

const loadOwn = async (req, res) => {
  const { currentUser } = req;
  const { hasSharedAutomations } = req.query;
  const _rootFolder = await Folder.findOne({
    user: currentUser._id,
    rootFolder: true,
    del: { $ne: true },
  });
  const rootFolder = { ..._rootFolder?._doc, item_type: 'folder' };
  const _folders = await Folder.find({
    user: currentUser._id,
    type: 'automation',
    del: { $ne: true },
  });
  const folders = (_folders || []).map((e) => {
    return { ...e._doc, item_type: 'folder', shared: false };
  });
  const _automations = await Automation.find({
    user: currentUser._id,
    clone_assign: { $ne: true },
  });
  const automations = (_automations || []).map((e) => {
    return { ...e._doc, item_type: e.type, shared: false };
  });
  if (hasSharedAutomations && currentUser?.organization) {
    const organization = await Organization.findById(currentUser.organization);

    if (organization?.team) {
      const shareTeam = await Team.findOne({
        _id: organization.team,
      });
      if (shareTeam?._id) {
        const sharedFolder = await Folder.findOne({
          team: shareTeam?._id,
        });
        if (sharedFolder?.automations && sharedFolder?.automations.length > 0) {
          const sharedAutomations = await Automation.find({
            user: { $ne: currentUser._id },
            _id: { $in: sharedFolder?.automations },
          });
          if (sharedAutomations.length)
            sharedAutomations.forEach((e) => {
              automations.push({ ...e._doc, item_type: e.type, shared: true });
            });
        }
      }
    }
  }
  return res.send({
    status: true,
    data: [rootFolder, ...folders, ...automations],
  });
};

const getContactDetail = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _timelines = await TimeLine.find({
    user: currentUser.id,
    contact,
  });

  return res.send({
    status: true,
    data: _timelines,
  });
};

const searchDeal = async (req, res) => {
  const { currentUser } = req;
  const searchStr = req.body.search;
  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const data = [];

  // get shared deals first

  const searched_deals = await Deal.find({
    title: { $regex: search, $options: 'i' },
    user: currentUser.id,
  });

  if (searched_deals.length > 0) {
    for (let i = 0; i < searched_deals.length; i++) {
      const deal = searched_deals[i];
      const searched_timeline = await TimeLine.findOne({
        deal: deal._id,
        automation: req.body.automation,
      }).catch((err) => {
        console.log('time line find err', err.message);
      });

      if (searched_timeline) {
        const contacts = await Contact.find({
          _id: { $in: deal.contacts },
        }).select({
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          cell_phone: 1,
        });
        data.push({
          deal,
          contacts,
        });
      }
    }
  }

  return res.send({
    status: true,
    data,
  });
};

const removeFolder = async (req, res) => {
  const { currentUser } = req;
  const { _id, mode, target } = req.body;

  const folder = await Folder.findOne({ _id, user: currentUser._id }).catch(
    (err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  );

  if (!folder) {
    return res.status(400).send({
      status: false,
      error: 'Not found folder',
    });
  }

  if (mode === 'remove-all') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        const { automations } = oldFolderData;
        bulkRemove({ currentUser, body: { automations } }, res);
        // Automation.deleteMany({
        //   user: currentUser._id,
        //   _id: { $in: automations },
        // });
        // return res.send({
        //   status: true,
        // });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else if (mode === 'move-other') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                automations: { $each: oldFolderData.automations },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }

  if (mode === 'only-folder') {
    // Skip
    Folder.deleteOne({ _id })
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const removeFolders = async (req, res) => {
  const { currentUser } = req;
  const { folder, ids, mode, target } = req.body;

  const folder_list = await Folder.find({
    _id: { $in: ids },
    user: currentUser._id,
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });

  let automations = [];
  let folders = [];
  for (let i = 0; i < folder_list.length; i++) {
    const e = folder_list[i];
    automations = [...automations, ...e.automations];
    folders = [...folders, ...e.folders];
  }

  if (mode === 'remove-all') {
    bulkRemove(
      {
        currentUser,
        body: { folder, folders: ids },
      },
      res
    );
  } else {
    await Folder.deleteMany({
      _id: { $in: ids },
      user: currentUser._id,
    })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                automations: { $each: automations },
                folders: { $each: folders },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $addToSet: {
                automations: { $each: automations },
                folders: { $each: folders },
              },
            }
          );
        }
        if (folder) {
          await Folder.updateOne(
            { _id: folder },
            {
              $pull: {
                folders: { $in: ids },
              },
            }
          );
        } else {
          await Folder.updateOne(
            { rootFolder: true, user: currentUser.id },
            {
              $pull: {
                folders: { $in: ids },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const downloadFolder = async (req, res) => {
  const { currentUser } = req;
  const { folders, is_sharable } = req.body;

  const folderDocs = await Folder.find({
    _id: { $in: folders },
    user: { $ne: currentUser._id },
  }).catch((err) => {
    console.log('folder load', err);
  });

  const promises = [];
  let curFolders = folderDocs;
  while (curFolders.length) {
    let nextFolders = [];
    (curFolders || []).forEach((_folder) => {
      const createPromise = new Promise((resolve, reject) => {
        const newFolder = { ..._folder._doc };
        delete newFolder.role;
        delete newFolder._id;
        delete newFolder.automations;
        newFolder.original_id = _folder._id;
        newFolder.user = currentUser._id;
        newFolder.is_sharable = is_sharable;
        new Folder(newFolder)
          .save()
          .then(async (_newFolder) => {
            const automationPromises = [];

            const _folderDocs = await Folder.find({
              _id: { $in: _folder.folders },
              type: 'automation',
              user: { $ne: currentUser._id },
            }).catch((err) => {
              console.log('folder load', err);
            });
            nextFolders = [...nextFolders, ..._folderDocs];
            (_folderDocs || []).forEach((infolder) => {
              const folderPromise = new Promise((resolve, reject) => {
                const newInfolder = { ...infolder._doc };
                newInfolder.original_id = infolder._id;
                delete newInfolder.role;
                delete newInfolder._id;
                newInfolder.user = currentUser._id;
                new Folder(newInfolder)
                  .save()
                  .then((_newInfolder) => {
                    resolve({ id: _newInfolder._id, type: 'folder' });
                  })
                  .catch(() => {
                    reject();
                  });
              });
              automationPromises.push(folderPromise);
            });
            const automationDocs = await Automation.find({
              _id: { $in: _folder.automations },
              user: { $ne: currentUser._id },
            }).catch((err) => {
              console.log('automation load', err);
            });
            (automationDocs || []).forEach((_automation) => {
              const automationPromise = new Promise((resolve, reject) => {
                const newAutomation = { ..._automation._doc };
                delete newAutomation.role;
                delete newAutomation._id;
                newAutomation.original_id = _automation._id;
                newAutomation.user = currentUser._id;
                newAutomation.is_sharable = is_sharable;
                new Automation(newAutomation)
                  .save()
                  .then((_newAutomation) => {
                    resolve({ id: _newAutomation._id, type: 'automation' });
                  })
                  .catch(() => {
                    reject();
                  });
              });
              automationPromises.push(automationPromise);
            });
            Promise.all(automationPromises).then(async (automations) => {
              const _automations = automations.filter(
                (item) => item.type === 'automation'
              );
              const automationIds = _automations.map((item) => item.id);
              const _folders = automations.filter(
                (item) => item.type === 'folder'
              );
              const folderIds = _folders.map((item) => item.id);
              _newFolder.automations = automationIds;
              _newFolder.folders = folderIds;
              await _newFolder.save().catch(() => {
                console.log('automations register failed');
              });
              if (folders.includes(_newFolder.original_id?.toString())) {
                resolve({ id: _newFolder._id });
              } else {
                resolve();
              }
            });
          })
          .catch(() => {
            reject();
          });
      });
      promises.push(createPromise);
    });
    curFolders = nextFolders;
  }

  Promise.all(promises).then(async (data) => {
    const ids = [];
    data.forEach((e) => {
      if (e && e.id) {
        ids.push(e.id);
      }
    });
    await Folder.updateOne(
      { user: currentUser.id, rootFolder: true },
      {
        $addToSet: { folders: { $each: ids } },
      }
    );
    return res.send({
      status: true,
    });
  });
};

const moveFile = async (req, res) => {
  const { currentUser } = req;
  const { files, target, source } = req.body;
  if (source) {
    await Folder.updateOne(
      { _id: source, user: currentUser._id },
      {
        $pull: {
          automations: { $in: files },
        },
      }
    );
  }
  if (target) {
    await Folder.updateOne(
      { _id: target, user: currentUser._id },
      {
        $addToSet: {
          automations: { $each: files },
        },
      }
    );
  }
  return res.send({
    status: true,
  });
};

const selectAllContacts = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;

  if (!id) {
    return res.status(400).send({
      status: false,
      error: 'invalid_request',
    });
  }

  const automation_lines = await AutomationLine.find({
    automation: id,
    status: 'running',
    user: currentUser._id,
  })
    .select({ contact: 1 })
    .catch((err) => console.log('find automation_lines error: ', err));

  const contacts = (automation_lines || []).map((automation_line) => {
    return { _id: automation_line?.contact };
  });

  res.send({
    status: true,
    data: contacts,
  });
};

const selectAllDeals = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;

  if (!id) {
    return res.status(400).send({
      status: false,
      error: 'invalid_request',
    });
  }

  const automation_lines = await AutomationLine.find({
    automation: id,
    status: 'running',
    user: currentUser._id,
  })
    .select({ deal: 1 })
    .catch((err) => console.log('find automation_lines error: ', err));

  const deals = (automation_lines || []).map((automation_line) => {
    return { _id: automation_line?.deal };
  });

  res.send({
    status: true,
    data: deals,
  });
};

const getDetail = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  await Automation.findOne({ _id: id })
    .then(async (_automation) => {
      if (!_automation) {
        return res.status(400).send({
          status: false,
          error: 'not_found',
        });
      }
      const actions = _automation.automations;
      let videoIds = [];
      let imageIds = [];
      let pdfIds = [];
      const stageIds = [];
      const automationIds = [];
      actions.forEach((item) => {
        const action = item.action;
        if (action.automation_id) {
          automationIds.push(action.automation_id);
        }
        if (action.videos && action.videos.length) {
          videoIds = videoIds.concat(action.videos);
        }
        if (action.pdfs && action.pdfs.length) {
          pdfIds = pdfIds.concat(action.pdfs);
        }
        if (action.images && action.images.length) {
          imageIds = imageIds.concat(action.images);
        }
        if (action.deal_stage) {
          stageIds.push(action.deal_stage);
        }
      });
      let videos = [];
      let images = [];
      let pdfs = [];
      let stages = [];
      let automations = [];
      if (videoIds.length) {
        videos = await Video.find(
          {
            _id: { $in: videoIds },
          },
          '_id title thumbnail preview'
        ).catch(() => {});
      }
      if (pdfIds.length) {
        pdfs = await PDF.find(
          {
            _id: { $in: pdfIds },
          },
          '_id title preview'
        ).catch(() => {});
      }
      if (imageIds.length) {
        images = await Image.find(
          {
            _id: { $in: imageIds },
          },
          '_id title preview'
        ).catch(() => {});
      }
      if (stageIds.length) {
        stages = await DealStage.find(
          {
            _id: { $in: stageIds },
          },
          '_id title'
        ).catch(() => {});
      }
      if (automationIds.length) {
        automations = await Automation.find(
          {
            _id: { $in: automationIds },
          },
          '_id title'
        ).catch(() => {});
      }
      return res.send({
        status: true,
        data: {
          automation: _automation,
          details: {
            videos,
            pdfs,
            images,
            stages,
            automations,
          },
        },
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || err,
      });
    });
};

const uploadAudio = async (req, res) => {
  const file = req.file;
  let location;
  if (file) {
    location = file.location;

    if (location.endsWith('.m4a') || location.endsWith('.mp4')) {
      location = location.replace(/.m4a$|.mp4$/, '.mp3');
    }

    res.send({
      status: true,
      data: location,
    });
  } else {
    res.send({
      status: false,
    });
  }
};

const getContactsAutomation = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const contactIds = (contacts || []).map((e) => mongoose.Types.ObjectId(e));
  const automation_lines = await AutomationLine.find({
    user: mongoose.Types.ObjectId(currentUser._id),
    contact: { $in: contactIds },
    status: 'running',
  }).catch((err) => console.log('find automation line error: ', err));

  return res.send({
    status: true,
    data: automation_lines,
  });
};

const getParentFolderByAutomation = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const folders = await Folder.find({
    automations: { $in: [id] },
    user: currentUser.id,
    del: false,
  });
  let currentFolder = '';
  if (folders.length && !folders[0].rootFolder) {
    currentFolder = folders[0]._id;
  }

  let root_folder;
  let prevId = '';
  if (!currentFolder) {
    root_folder = await Folder.findOne({
      user: currentUser.id,
      rootFolder: true,
      del: false,
    });
  } else {
    root_folder = await Folder.findOne({
      _id: currentFolder,
      user: currentUser.id,
    });
  }

  if (!root_folder) {
    return res.send({
      status: true,
      data: {
        results: [],
        folder: currentFolder,
        prevFolder: prevId,
      },
    });
  }
  const prev_folder = await Folder.findOne({
    folders: { $in: root_folder.id },
  });
  if (prev_folder && !prev_folder.rootFolder) {
    prevId = prev_folder.id;
  }

  const automation_query = {
    _id: { $in: root_folder.automations },
    clone_assign: { $ne: true },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'automation',
    del: false,
  };
  let automation_list = [];
  let folder_list = [];

  automation_list = await Automation.find(automation_query).sort({
    created_at: 1,
  });
  folder_list = await Folder.find(folder_query).sort({ created_at: 1 });

  const automation_array = [];

  for (let i = 0; i < automation_list.length; i++) {
    const automation = automation_list[i];

    let automation_detail = automation._doc || automation;

    automation_detail = {
      ...automation_detail,
      item_type: automation_detail.type,
    };

    automation_array.push(automation_detail);
  }

  const folderArr = (folder_list || []).map((e) => {
    return {
      ...e._doc,
      item_type: 'folder',
    };
  });

  return res.send({
    status: true,
    data: {
      results: [...folderArr, ...automation_array],
      prevFolder: prevId,
      folder: currentFolder,
    },
  });
};

const removeAttachments = async (attachments) => {
  for (let i = 0; i < attachments.length; i++) {
    const key = attachments[i].url.slice(urls.STORAGE_BASE.length + 1);
    await removeFile(key, (err, dt) => {
      console.error(
        'File Remove Error: File Name=',
        attachments[i].filename,
        err
      );
    });
  }
};

const getActiveCounts = async (req, res) => {
  const { currentUser } = req;
  const { automation_ids } = req.body;
  const activie_counts_array = [];

  for (let i = 0; i < automation_ids.length; i++) {
    const automation_id = automation_ids[i];
    const count = await getActiveAutomationCount(
      currentUser?.id,
      automation_id
    );

    const automation_detail = {
      id: automation_id,
      contacts: count,
    };

    activie_counts_array.push(automation_detail);
  }

  return res.send({
    status: true,
    data: activie_counts_array,
  });
};

const groupByAutomations = async (req, res) => {
  const { currentUser } = req;
  const { range } = req.body;

  const result = await groupByAutomationsHelper(currentUser, range);
  return res.send({
    status: true,
    data: result,
  });
};

const triggerAutomation = async (req, res) => {
  const { currentUser } = req;
  await triggerAutomationHelper({
    ...req.body,
    user: currentUser,
  });
  return res.send({
    status: true,
  });
};

module.exports = {
  get,
  getAll,
  load,
  loadLibrary,
  getAssignedContacts,
  getPage,
  create,
  update,
  remove,
  download,
  getTitles,
  updateDefault,
  search,
  searchContact,
  loadOwn,
  getContactDetail,
  searchDeal,
  removeFolder,
  removeFolders,
  moveFile,
  downloadFolder,
  bulkRemove,
  loadIncludings,
  selectAllContacts,
  selectAllDeals,
  getDetail,
  uploadAudio,
  getContactsAutomation,
  bulkDownload,
  loadAllIncludings,
  getParentFolderByAutomation,
  getParentFolderId,
  getActiveCounts,
  groupByAutomations,
  triggerAutomation,
};
