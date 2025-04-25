const moment = require('moment-timezone');
const mongoose = require('mongoose');
const User = require('../models/user');
const TimeLine = require('../models/time_line');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const Automation = require('../models/automation');
const AutomationLine = require('../models/automation_line');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const Folder = require('../models/folder');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const PipeLine = require('../models/pipe_line');

const { removeAutomationLine } = require('../services/automation_line');
const { processTimeline } = require('../services/time_line');
const urls = require('../constants/urls');
const { PACKAGE } = require('../constants/package');
const { v1: uuidv1 } = require('uuid');
const _ = require('lodash');
const { getTextMaterials, calcDueDate } = require('./utility');
const { giveRateContacts, calculateContactRate } = require('./contact');
const LeadForm = require('../models/lead_form');

const downloadAutomations = async (
  id,
  ids,
  user,
  original_id,
  is_sharable = true
) => {
  const originals = await Automation.find({ _id: { $in: ids } });
  const downloadedIds = [];
  ids.forEach((e) => {
    if (e !== id) {
      downloadedIds.push(e);
    }
  });
  const downloaded = await Automation.find({
    original_id: { $in: downloadedIds },
    user,
  });
  const downloadedDic = {};
  downloaded.forEach((e) => {
    downloadedDic[e.original_id] = e._id;
  });
  const newIds = [];
  for (let i = 0; i < originals.length; i++) {
    const e = originals[i];
    if (!downloadedDic[e._id]) {
      // Download the material
      const newOne = new Automation({
        ...e._doc,
        user,
        original_id,
        role: '',
        is_sharable,
        created_at: undefined,
        updated_at: undefined,
        _id: undefined,
      });
      const _newOne = await newOne.save();
      newIds.push(_newOne._id);
      downloadedDic[e._id] = _newOne._id;
    }
  }
  await Folder.updateOne(
    { user, rootFolder: true },
    {
      $addToSet: { automations: { $each: newIds } },
    }
  );

  return downloadedDic;
};

const createSubAutomation = async (ids, user) => {
  const automationsList = [];
  for (let i = 0; i < ids.length; i++) {
    const automationId = ids[i];
    const data = await Automation.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(automationId) },
      },
      { $project: { _id: 0, role: 0, created_at: 0, updated_at: 0 } },
    ]).catch((err) => {
      console.log('err', err);
    });
    const query = {
      ...data[0],
      user: user.id,
      clone_assign: { $ne: true },
    };
    const check_number = await Automation.find(query).count();
    if (check_number === 0) {
      const automation = new Automation({
        ...data[0],
        user: user.id,
      });
      const tempAutomation = await automation.save();
      const item = { origin: ids[i], new: tempAutomation._id };
      automationsList.push(item);
    } else {
      const automation = await Automation.findOne(query);
      const item = { origin: ids[i], new: automation._id };
      automationsList.push(item);
    }
  }
  return automationsList;
};

const updateAutomations = async ({
  downloadAutomationIds,
  automationsDic,
  videosDic,
  pdfsDic,
  imagesDic,
  stagesDic,
  user = null,
  isDownloading = false,
}) => {
  const automations = await Automation.find({
    _id: { $in: downloadAutomationIds },
  });
  const matchingStage = {};
  for (let i = 0; i < automations.length; i++) {
    const automation = automations[i];
    const downloadAutomation = await Automation.findOne({
      _id: automationsDic[`${automation._id}`],
    });
    const actions = [...automation.automations];
    for (let j = 0; j < actions.length; j++) {
      const item = actions[j];
      const action = item.action;
      if (action.automation_id) {
        const current = action.automation_id;
        const newOne = automationsDic[current];
        if (newOne) {
          action.automation_id = newOne;
        }
      }
      let video_ids = action.videos || [];
      let pdf_ids = action.pdfs || [];
      let image_ids = action.images || [];
      if (action.type === 'text') {
        const { videoIds, pdfIds, imageIds } = getTextMaterials(action.content);
        video_ids = videoIds;
        pdf_ids = pdfIds;
        image_ids = imageIds;
      }
      if (video_ids && video_ids.length) {
        for (let j = 0; j < video_ids.length; j++) {
          const current = video_ids[j];
          const newOne = videosDic[current];
          if (newOne) {
            // New Logic to replace
            const original_link = new RegExp(
              urls.MAIN_DOMAIN + `/video/${current}`,
              'g'
            );
            const new_link = urls.MAIN_DOMAIN + `/video/${newOne}`;
            action.content = action.content.replace(original_link, new_link);
            // Old Logic
            action.content = action.content.replace(
              `{{${current}}}`,
              `{{${newOne}}}`
            );
            video_ids[j] = newOne;
          }
        }
      }
      if (pdf_ids && pdf_ids.length) {
        for (let j = 0; j < pdf_ids.length; j++) {
          const current = pdf_ids[j];
          const newOne = pdfsDic[current];
          if (newOne) {
            // New Logic to replace
            const original_link = new RegExp(
              urls.MAIN_DOMAIN + `/pdf/${current}`,
              'g'
            );
            const new_link = urls.MAIN_DOMAIN + `/pdf/${newOne}`;
            action.content = action.content.replace(original_link, new_link);
            // Old Logic
            action.content = action.content.replace(
              `{{${current}}}`,
              `{{${newOne}}}`
            );
            pdf_ids[j] = newOne;
          }
        }
      }
      if (image_ids && image_ids.length) {
        for (let j = 0; j < image_ids.length; j++) {
          const current = image_ids[j];
          const newOne = imagesDic[current];
          if (newOne) {
            // New Logic to replace
            const original_link = new RegExp(
              urls.MAIN_DOMAIN + `/image/${current}`,
              'g'
            );
            const new_link = urls.MAIN_DOMAIN + `/image/${newOne}`;
            action.content = action.content.replace(original_link, new_link);
            // Old Logic
            action.content = action.content.replace(
              `{{${current}}}`,
              `{{${newOne}}}`
            );
            image_ids[j] = newOne;
          }
        }
      }
      action.videos = video_ids;
      action.pdfs = pdf_ids;
      action.images = image_ids;
      if (action?.deal_stage) {
        const current = action.deal_stage;
        if (!Object.keys(matchingStage).includes(current)) {
          matchingStage[current] = '';
          const newOne = stagesDic[current];
          if (newOne) {
            matchingStage[current] = newOne;
            action.deal_stage = newOne;
          } else {
            const old_stage = await DealStage.findById(current);
            const new_stage = new DealStage({
              user: stagesDic['pipeline']?.user,
              title: old_stage.title,
              pipe_line: stagesDic['pipeline']?._id,
            });
            await new_stage.save().then((_res) => {
              matchingStage[current] = `${_res._id}`;
              action.deal_stage = `${_res._id}`;
            });
          }
        } else {
          action.deal_stage = matchingStage[current];
        }
      }
      if (item && item.watched_materials && item.watched_materials.length) {
        for (let j = 0; j < item.watched_materials.length; j++) {
          const current = item.watched_materials[j];
          let newOne;
          if (videosDic[current]) newOne = videosDic[current];
          else if (imagesDic[current]) newOne = imagesDic[current];
          else if (pdfsDic[current]) newOne = pdfsDic[current];
          if (newOne) {
            item.watched_materials[j] = newOne;
          }
        }
      }
    }

    const updateResult = await Automation.updateOne(
      { _id: downloadAutomation._id },
      { $set: { automations: actions, isDownloading } }
    ).catch((err) => {
      console.log('err', err);
    });
  }
};

const updateAutomation = async (
  ids,
  automationsList,
  videoList,
  imageList,
  pdfList,
  match_info,
  currentUser
) => {
  for (let i = 0; i < ids.length; i++) {
    const automation = await Automation.findOne({
      _id: mongoose.Types.ObjectId(ids[i]),
    });
    for (let j = 0; j < automation.automations.length; j++) {
      const item = automation.automations[j].action;
      if (item.automation_id) {
        for (let k = 0; k < automationsList.length; k++) {
          if (item.automation_id === automationsList[k].origin) {
            item.automation_id = automationsList[k].new;
          }
        }
      }
      if (item.videos) {
        item.videos.forEach((element, index) => {
          for (let k = 0; k < videoList.length; k++) {
            if (element === videoList[k].origin) {
              item.content = item.content.replace(
                '{{' + item.videos[index] + '}}',
                '{{' + videoList[k].new.toString() + '}}'
              );
              item.videos[index] = videoList[k].new;
            }
          }
        });
      }
      if (item.pdfs) {
        item.pdfs.forEach((element, index) => {
          for (let k = 0; k < pdfList.length; k++) {
            if (element === pdfList[k].origin) {
              item.content = item.content.replace(
                '{{' + item.pdfs[index] + '}}',
                '{{' + pdfList[k].new.toString() + '}}'
              );
              item.pdfs[index] = pdfList[k].new;
            }
          }
        });
      }
      if (item.images) {
        item.images.forEach((element, index) => {
          for (let k = 0; k < imageList.length; k++) {
            if (element === imageList[k].origin) {
              item.content = item.content.replace(
                '{{' + item.images[index] + '}}',
                '{{' + imageList[k].new.toString() + '}}'
              );
              item.images[index] = imageList[k].new;
            }
          }
        });
      }
      if (item.deal_stage) {
        if (
          match_info[item.deal_stage] &&
          match_info[item.deal_stage].dealStage
        ) {
          item.deal_stage = match_info[item.deal_stage].dealStage;
        } else {
          if (match_info[item.deal_stage].pipeline) {
            const pipe_line = await PipeLine.findOne({
              _id: mongoose.Types.ObjectId(
                match_info[item.deal_stage].pipeline
              ),
            });

            let pipeline_id;
            if (pipe_line) {
              if (pipe_line.user.toString() === currentUser.id.toString()) {
                pipeline_id = pipe_line._id;
              } else {
                const pipe_info = currentUser.pipe_info;
                if (pipe_info && pipe_info['is_limit']) {
                  const pipe_count = await PipeLine.countDocuments({
                    user: currentUser.id,
                  });
                  if (pipe_count >= pipe_info.max_count) {
                    console.log('You reach out max pipeline count');
                    return false;
                  }
                }
                const new_pipeline = new PipeLine({
                  title: pipe_line.title,
                  user: currentUser.id,
                });
                const _pipe_line = await new_pipeline.save();
                pipeline_id = _pipe_line._id;
              }
              const dealStage = await DealStage.findOne({
                _id: mongoose.Types.ObjectId(item.deal_stage),
              });

              // get max priority for new stage.
              let max_priority = 1;
              const pipeline_stages = await DealStage.find({
                user: currentUser.id,
                pipe_line: pipeline_id,
              });
              if (pipeline_stages.length > 0) {
                const priorities = pipeline_stages.map(
                  (item) => item._doc.priority
                );
                max_priority = Math.max(...priorities) + 1;
              }

              if (dealStage) {
                const new_stage = new DealStage({
                  title: dealStage.title,
                  deals: [],
                  user: currentUser.id,
                  priority: max_priority,
                  pipe_line: pipeline_id,
                });
                const _deal_stage = await new_stage.save();
                item.deal_stage = _deal_stage._id;
              }
            }
          }
        }
      }
    }
    await Automation.updateOne(
      { _id: mongoose.Types.ObjectId(ids[i]) },
      { $set: { automations: automation.automations } }
    ).catch((err) => {
      console.log('err', err);
    });
  }
};

const getActiveAutomationCount = async (user_id, automation_id) => {
  const query = {
    user: mongoose.Types.ObjectId(user_id),
    status: 'running',
  };
  try {
    if (automation_id) {
      query.automation = mongoose.Types.ObjectId(automation_id);
    }
    const count = (await AutomationLine.countDocuments({ ...query })) || 0;
    return count;
  } catch (err) {
    throw new Error(err);
  }
};

const getSubTitles = async (
  allIds,
  ids,
  subTitles,
  videoIds,
  videoTitles,
  pdfIds,
  pdfTitles,
  imageIds,
  imageTitles,
  dealStageTitles
) => {
  const tempIds = [];
  for (let i = 0; i < ids.length; i++) {
    const tempAutomation = await Automation.findOne({
      _id: mongoose.Types.ObjectId(ids[0]),
    });
    if (tempAutomation) {
      subTitles.push(tempAutomation.title);
      for (let j = 0; j < tempAutomation.automations.length; j++) {
        const item = tempAutomation.automations[j].action;
        if (item.automation_id) {
          tempIds.push(item.automation_id);
          allIds.push(item.automation_id);
        }
        if (item.videos) {
          for (let k = 0; k < item.videos.length; k++) {
            const tempVideo = await Video.findOne({
              _id: mongoose.Types.ObjectId(item.videos[k]),
            });
            videoTitles.push(tempVideo);
            videoIds.push(item.videos[k]);
          }
        }
        if (item.pdfs) {
          for (let k = 0; k < item.pdfs.length; k++) {
            const tempPdf = await PDF.findOne({
              _id: mongoose.Types.ObjectId(item.pdfs[k]),
            });
            pdfTitles.push(tempPdf);
            pdfIds.push(item.pdfs[k]);
          }
        }
        if (item.images) {
          for (let k = 0; k < item.images.length; k++) {
            const tempImage = await Image.findOne({
              _id: mongoose.Types.ObjectId(item.images[k]),
            });
            imageTitles.push(tempImage);
            imageIds.push(item.images[k]);
          }
        }
        if (item.deal_stage) {
          const dealStage = await DealStage.findOne({
            _id: mongoose.Types.ObjectId(item.deal_stage),
          });
          dealStageTitles.push(dealStage);
        }
      }
    }
  }
  if (tempIds.length > 0) {
    return getSubTitles(
      allIds,
      tempIds,
      subTitles,
      videoIds,
      videoTitles,
      pdfIds,
      pdfTitles,
      imageIds,
      imageTitles,
      dealStageTitles
    );
  } else {
    const result = {
      ids: allIds,
      titles: subTitles,
      videoIds,
      videos: videoTitles,
      imageIds,
      images: imageTitles,
      pdfIds,
      pdfs: pdfTitles,
      dealStages: dealStageTitles,
    };
    return result;
  }
};
const getMaterials = async (
  automation_ids,
  ids,
  videos,
  images,
  pdfs,
  currentUser = null,
  stages = []
) => {
  const tempIds = [];
  const userQuery = {};
  if (currentUser && currentUser.id) {
    userQuery['user'] = currentUser.id;
  }
  for (let i = 0; i < automation_ids.length; i++) {
    const tempAutomation = await Automation.findOne({
      _id: mongoose.Types.ObjectId(automation_ids[i]),
      ...userQuery,
    });
    if (tempAutomation) {
      for (let j = 0; j < tempAutomation.automations.length; j++) {
        const item = tempAutomation.automations[j].action;
        if (item.automation_id && !ids.includes(item.automation_id)) {
          tempIds.push(item.automation_id);
          ids.push(item.automation_id);
        }
        let video_ids = [];
        let pdf_ids = [];
        let image_ids = [];
        if (item.type === 'text') {
          // const { videoIds, pdfIds, imageIds } = getTextMaterials(item.content);
          video_ids = item.videos;
          pdf_ids = item.pdfs;
          image_ids = item.images;
        } else {
          video_ids = item.videos || [];
          pdf_ids = item.pdfs || [];
          image_ids = item.images || [];
        }
        if (item.deal_stage) {
          stages.push(item.deal_stage);
        }
        if (video_ids) {
          for (let k = 0; k < video_ids.length; k++) {
            videos.push(video_ids[k]);
          }
        }
        if (pdf_ids) {
          for (let k = 0; k < pdf_ids.length; k++) {
            pdfs.push(pdf_ids[k]);
          }
        }
        if (image_ids) {
          for (let k = 0; k < image_ids.length; k++) {
            images.push(image_ids[k]);
          }
        }
      }
    }
  }
  if (tempIds.length > 0) {
    const result = await getMaterials(
      tempIds,
      ids,
      videos,
      images,
      pdfs,
      currentUser,
      stages
    );
    return result;
  } else {
    const data = { ids, videos, images, pdfs, stages };
    return data;
  }
};

const getResources = async (
  automation_id,
  ids,
  videos,
  images,
  pdfs,
  currentUser = null
) => {
  const tempIds = [];
  const userQuery = {};
  if (currentUser && currentUser.id) {
    userQuery['user'] = currentUser.id;
  }
  const tempAutomation = await Automation.findOne({
    _id: mongoose.Types.ObjectId(automation_id),
    ...userQuery,
    clone_assign: { $ne: true },
  });
  if (tempAutomation) {
    for (let j = 0; j < tempAutomation.automations.length; j++) {
      const item = tempAutomation.automations[j].action;
      if (item.automation_id && !ids.includes(item.automation_id)) {
        tempIds.push(item.automation_id);
        ids.push(item.automation_id);
      }
      let video_ids = [];
      let pdf_ids = [];
      let image_ids = [];
      if (item.type === 'text') {
        video_ids = item.videos;
        pdf_ids = item.pdfs;
        image_ids = item.images;
      } else {
        video_ids = item.videos || [];
        pdf_ids = item.pdfs || [];
        image_ids = item.images || [];
      }
      if (video_ids) {
        for (let k = 0; k < video_ids.length; k++) {
          videos.push(video_ids[k]);
        }
      }
      if (pdf_ids) {
        for (let k = 0; k < pdf_ids.length; k++) {
          pdfs.push(pdf_ids[k]);
        }
      }
      if (image_ids) {
        for (let k = 0; k < image_ids.length; k++) {
          images.push(image_ids[k]);
        }
      }
    }
  }
  const data = { ids, videos, images, pdfs };
  return data;
};

const assignTimeline = async (data) => {
  const {
    assign_array,
    automation_id,
    user_id,
    required_unique,
    inherited_by,
    custom_period,
    scheduled_time,
    appointment,
    timeline,
    type,
    mode,
    by_trigger,
  } = data;
  const promise_array = [];
  let assigned_contacts = [];
  let promise;

  const automation = await Automation.findOne({ _id: automation_id }).catch(
    (err) => {
      console.log('automation assign err', err.message);
    }
  );

  if (!automation) {
    return new Promise((resolve, reject) => {
      resolve({
        status: false,
        error: 'No automation',
      });
    });
  }
  const { automations } = automation;

  let count = 0;
  let max_assign_count;

  const currentUser = await User.findOne({
    _id: user_id,
  });

  if (!currentUser) {
    return new Promise((resolve, reject) => {
      resolve({
        status: false,
        error: 'No user',
      });
    });
  }
  const automation_info = currentUser.automation_info;

  if (automation_info['is_limit']) {
    max_assign_count =
      automation_info.max_count || PACKAGE.PRO.automation_info.max_count;

    count = await getActiveAutomationCount(currentUser._id);
  }

  const process_timeline_ids = [];

  // assign automations to contacts/deals array
  for (let i = 0; i < assign_array.length; i++) {
    const assignId = assign_array[i];
    let contact;
    let deal;

    if (type === 'contact')
      contact = await Contact.findOne({ _id: assignId }).catch((err) => {
        console.log('contact found err', err.message);
      });
    else {
      deal = await Deal.findOne({ _id: assignId }).catch((err) => {
        console.log('contact found err', err.message);
      });
      if (mode === 'automation') {
        assigned_contacts = data?.assigned_contacts || [];
      } else {
        assigned_contacts = deal?.contacts;
      }
    }

    // if (required_unique && assignId && (contact || deal)) {
    //   await removeAutomationLine({
    //     [type]: assignId,
    //     userId: user_id,
    //   });
    // }

    if (automation_info['is_limit'] && max_assign_count <= count) {
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          [type]: {
            _id: assignId,
            title: deal?.title,
            first_name: contact?.first_name,
            last_name: contact?.last_name,
          },
          error: 'Exceed max active automations',
        });
      });
      promise_array.push(promise);
      continue;
    }

    const same_automation_line = await AutomationLine.findOne({
      [type]: assignId,
      user: user_id,
      automation: automation_id,
      status: 'running',
    }).catch((err) => {
      console.log('there is no same automation', err.message);
    });

    if (same_automation_line) {
      promise = new Promise((resolve) => {
        resolve({
          status: false,
          [type]: {
            _id: assignId,
            title: deal?.title,
            first_name: contact?.first_name,
            last_name: contact?.last_name,
          },
          automation_line: same_automation_line?._id,
          error: 'The same automation is already running.',
        });
      });
      promise_array.push(promise);
      continue;
    }
    const automation_line = new AutomationLine({
      ...automation._doc,
      _id: undefined,
      automation: automation_id,
      type,
      status: 'running',
      [type]: assignId,
      user: user_id,
      action_count: automation.meta?.action_count || 0,
      automations: [],
      appointment,
      created_at: undefined,
      updated_at: undefined,
    });

    await automation_line.save().catch((err) => {
      console.log('automation line creating error', err.message);
    });

    // eslint-disable-next-line no-nested-ternary
    const content = inherited_by
      ? 'moved to next automation'
      : by_trigger
      ? 'triggered automation'
      : 'assigned automation';

    const activity_object = {
      content,
      type: 'automations',
      [type === 'contact' ? 'contacts' : 'deals']: assignId,
      automation_lines: automation_line.id,
      automations: automation_id,
      user: currentUser.id,
    };

    const assign_activity = new Activity({
      ...activity_object,
    });
    assign_activity
      .save()
      .then((_activity) => {
        if (contact) {
          Contact.updateOne(
            { _id: contact.id },
            {
              $set: { last_activity: _activity._id },
            }
          ).catch((err) => {
            console.log('err', err);
          });
        } else if (deal) {
          const contacts = deal.contacts;
          for (let i = 0; i < contacts.length; i++) {
            const activity = new Activity({
              content,
              type: 'automations',
              automation_lines: automation_line.id,
              automations: automation_id,
              user: currentUser.id,
              contacts: contacts[i],
            });
            activity
              .save()
              .then((_activity) => {
                Contact.updateOne(
                  { _id: contacts[i] },
                  {
                    $set: { last_activity: _activity._id },
                  }
                ).catch((err) => {
                  console.log('err', err);
                });
              })
              .catch((err) => {
                console.log('activity save err', err.message);
              });
          }
        }
      })
      .catch((err) => {
        console.log('activity save err', err.message);
      });

    if (inherited_by) {
      TimeLine.updateOne(
        {
          _id: timeline._id,
        },
        {
          $set: {
            automation_line: automation_line?._id,
            automation: automation_line?.automation,
            ref: automation_line?._id.toString(),
          },
        }
      ).catch((err) => {
        throw new Error(err);
      });
    }

    count += 1;
    let due_date;
    for (let j = 0; j < automations.length; j++) {
      const time_line = automations[j];
      if (time_line.parent === 'a_10000') {
        const { period } = time_line;
        due_date = scheduled_time ? moment(new Date(scheduled_time)) : moment();

        if (custom_period) {
          due_date = due_date.add(custom_period, 'minutes');
        }

        due_date = period ? due_date.add(period, 'hours') : due_date;

        const business_time = {
          action: time_line.action,
          period,
          due_date,
          user: currentUser.id,
        };
        due_date = await calcDueDate(business_time);

        const _time_line = new TimeLine({
          ...time_line,
          type,
          ref: time_line.id,
          parent_ref: time_line.parent,
          user: currentUser.id,
          [type]: assignId,
          assigned_contacts,
          automation: automation_id,
          automation_line: automation_line._id,
          due_date,
          status: 'active',
        });
        _time_line.save().catch((err) => {
          console.log('timeline assign err', err.message);
        });

        const now = moment();
        if (now.isAfter(due_date)) {
          process_timeline_ids.push(_time_line.id);
        }
      } else {
        const _time_line = new TimeLine({
          ...time_line,
          type,
          assigned_contacts,
          ref: time_line.id,
          parent_ref: time_line.parent,
          user: currentUser.id,
          [type]: assignId,
          automation: automation_id,
          automation_line: automation_line._id,
          status: 'pending',
        });
        _time_line.save().catch((err) => {
          console.log('timeline assign err', err.message);
        });
      }
    }

    promise = new Promise((resolve) => {
      resolve({
        status: true,
        [type]: {
          _id: assignId,
          title: deal?.title,
          first_name: contact?.first_name,
          last_name: contact?.last_name,
        },
        activity: assign_activity?._id,
        automation_line: automation_line?._id,
      });
    });
    promise_array.push(promise);
  }

  return new Promise((resolve, reject) => {
    Promise.all(promise_array)
      .then(async (res) => {
        if (automation.type === 'contact') {
          if (assign_array.length > 1) {
            giveRateContacts({ user: [user_id] }, assign_array);
          } else if (assign_array.length === 1) {
            await calculateContactRate(assign_array[0], user_id);
          }
        }

        if (process_timeline_ids?.length) {
          processTimeline({
            userId: currentUser.id,
            timeline_ids: process_timeline_ids,
          });
        }

        resolve({ result: res, status: true });
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * @param {*} data
 */
const assignAutomation = async (data) => {
  const { automation_id, deals, user_id } = data;
  const _automation = await Automation.findOne({
    _id: automation_id,
  }).catch((err) => {
    console.log('automation find err', err.message);
  });
  const currentUser = await User.findOne({ _id: user_id });

  if (_automation) {
    if (currentUser.primary_connected && currentUser['twilio_number']) {
      let count = 0;
      let max_assign_count;

      const automation_info = currentUser.automation_info;
      if (automation_info['is_limit']) {
        max_assign_count =
          automation_info.max_count || PACKAGE.PRO.automation_info.max_count;

        count = await getActiveAutomationCount(currentUser._id);
      }
      if (
        automation_info['is_enabled'] &&
        (!automation_info['is_limit'] ||
          (automation_info['is_limit'] && max_assign_count > count))
      ) {
        const assigns = [...deals];
        if (assigns.length) {
          const data = {
            automation_id,
            assign_array: deals,
            user_id: currentUser._id,
            required_unique: true,
            type: 'deal',
          };

          assignTimeline(data)
            .then(async ({ due_date, result }) => {
              const error = [];
              result.forEach((_res) => {
                if (!_res.status) {
                  error.push({
                    contact: _res.contact,
                    error: _res.error,
                    type: _res.type,
                  });
                }
              });
            })
            .catch((err) => {
              console.log('bulk automation assigning is failed', err);
            });
        }
      }
    }
  }
};

const onAutomationInfo = async (user_id, group = 'both') => {
  let contactIds;
  let dealIds;
  if (group === 'both' || group === 'contact') {
    const contactAutomations = await AutomationLine.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(user_id),
          status: 'running',
          contact: { $exists: true },
        },
      },
      {
        $group: {
          _id: '$contact',
        },
      },
    ]).catch((err) => {
      console.log('AutomationLine fine error: ', err.msg || err.message || '');
    });
    if (contactAutomations?.length) {
      contactIds = contactAutomations.map((e) => e._id);
    }
  }
  if (group === 'both' || group === 'deal') {
    const dealAutomations = await AutomationLine.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(user_id),
          status: 'running',
          deal: { $exists: true },
        },
      },
      {
        $group: {
          _id: '$deal',
        },
      },
    ]);
    if (dealAutomations.length > 0) {
      dealIds = dealAutomations.map((e) => e._id);
    }
  }

  if (group === 'contact') {
    return contactIds || [];
  } else if (group === 'deal') {
    return dealIds || [];
  } else {
    return {
      contactIds: contactIds || [],
      dealIds: dealIds || [],
    };
  }
};

/**
 * Return the automation contact counts with the automation status
 * @param {*} user
 * @param {*} range
 */
const groupByAutomations = async (user, range = 30) => {
  const latestAutomation = new Date(Date.now() - range * 24 * 3600000);

  const onAutomations = await onAutomationInfo(user._id);
  const neverAutomatedContactCount = await Contact.countDocuments({
    user: user._id,
    _id: { $nin: onAutomations.contactIds },
    automation_off: { $exists: false },
  }).catch((err) => {});
  const neverAutomatedDealCount = await Deal.countDocuments({
    user: user._id,
    _id: { $nin: onAutomations.dealIds },
    automation_off: { $exists: false },
  }).catch((err) => {});
  // off in range
  const recentOffContactCount = await Contact.countDocuments({
    user: user._id,
    automation_off: { $gte: latestAutomation },
  }).catch((err) => {});
  const recentOffDealCount = await Deal.countDocuments({
    user: user._id,
    automation_off: { $gte: latestAutomation },
  }).catch((err) => {});
  return {
    neverAutomated: {
      contactCount: neverAutomatedContactCount,
      dealCount: neverAutomatedDealCount,
    },
    recentOffAutomation: {
      contactCount: recentOffContactCount,
      dealCount: recentOffDealCount,
    },
    onAutomation: {
      contactCount: onAutomations.contactIds.length,
      dealCount: onAutomations.dealIds.length,
    },
  };
};
const checkFormFieldRules = async (trigger, formId, fieldData) => {
  if (trigger.type !== 'form_submitted' || formId !== trigger.detail?.form_id) {
    return false;
  }
  const _form = await LeadForm.findOne({
    _id: mongoose.Types.ObjectId(formId),
  }).catch((ex) => {
    console.log('LeadForm finding error', ex.message);
  });
  console.log('_form', _form);
  if (!_form) return false;
  if (trigger.detail?.conditions?.length) {
    for (const [index, conditions] of trigger.detail.conditions.entries()) {
      const _realConditions = conditions.filter(
        ({ field, value, operator }) =>
          field !== '' && value !== '' && operator !== ''
      );
      if (_realConditions.length === 0) {
        if (index === 0) return true;
        else continue;
      }
      const allConditionsMet = _realConditions.every((condition) => {
        const { field: field_label, value, operator, type } = condition;
        if (!field_label || !value || !operator) {
          return true;
        }
        let _fieldName = field_label;
        switch (_fieldName) {
          case 'First Name':
            _fieldName = 'first_name';
            break;
          case 'Last Name':
            _fieldName = 'last_name';
            break;
          case 'Email':
            _fieldName = 'email';
            break;
          case 'Phone':
            _fieldName = 'cell_phone';
            break;
        }
        if (!Object.hasOwn(fieldData, _fieldName)) {
          const _field = _form.fields.find((it) => it.name === _fieldName);
          if (!_field?.match_field) return false;
          _fieldName = _field.match_field;
        }

        const fieldValue = fieldData[_fieldName];
        switch (type) {
          case 'text':
          case 'email':
          case 'phone':
          case 'dropdown':
            if (operator === '=') {
              return fieldValue === value;
            }
            if (operator === 'include') {
              return fieldValue.includes(value);
            }
            return false;

          case 'date':
            if (operator === '=') {
              return fieldValue === value;
            }
            if (operator === '>=') {
              return new Date(fieldValue) >= new Date(value);
            }
            if (operator === '<=') {
              return new Date(fieldValue) <= new Date(value);
            }
            return false;

          case 'number':
            if (operator === '=') {
              return fieldValue === value;
            }
            if (operator === '>=') {
              return parseFloat(fieldValue) >= parseFloat(value);
            }
            if (operator === '<=') {
              return parseFloat(fieldValue) <= parseFloat(value);
            }
            return false;

          default:
            return false;
        }
      });

      if (allConditionsMet) {
        return true;
      }
    }
    return false;
  } else {
    return true;
  }
};
const triggerAutomation = async (params) => {
  const { user, contacts, deals, trigger, fieldData } = params;
  if (!user.primary_connected) {
    return new Promise((resolve, reject) => {
      reject('No email connected');
    });
  }

  const automation_info = user.automation_info;
  let count = 0;
  let max_assign_count;
  if (!automation_info['is_enabled']) {
    return new Promise((resolve, reject) => {
      reject('Disable create automations');
    });
  }

  if (automation_info['is_limit']) {
    max_assign_count =
      automation_info.max_count || PACKAGE.PRO.automation_info.max_count;

    count = await getActiveAutomationCount(user._id);
  }

  if (automation_info['is_limit'] && max_assign_count <= count) {
    return new Promise((resolve, reject) => {
      reject('Exceed max active automations');
    });
  }

  const triggerQuery = {
    'trigger.type': trigger.type,
  };
  switch (trigger.type) {
    case 'form_submitted':
      triggerQuery['trigger.detail.form_id'] = trigger.form_id;
      break;
    case 'material_viewed':
      triggerQuery['trigger.detail.id'] = trigger.detail.id;
      if (trigger.detail.type === 'VIDEO') {
        triggerQuery['trigger.detail.amount'] = { $lte: trigger.detail.amount };
      }
      break;
    case 'contact_status_updated':
      triggerQuery['trigger.detail.status'] = trigger.detail.status;
      break;
    case 'contact_tags_added':
      triggerQuery['trigger.detail.tags'] = { $in: trigger.detail.tags };
      break;
    case 'deal_stage_updated':
      triggerQuery['trigger.detail.stage'] = trigger.detail.stage;
      break;
  }

  const query = {
    ...triggerQuery,
    is_active: true,
    user: user._id,
    del: false,
  };
  const automations = await Automation.find(query).catch((err) => {
    console.log(err.message);
  });
  if (!automations?.length) return;
  let assigns = [];
  if (contacts) {
    assigns = [...contacts];
  } else {
    assigns = [...deals];
  }

  const automation_type = contacts ? 'contact' : 'deal';
  automations.forEach(async (automation) => {
    const data = {
      automation_id: automation._id,
      assign_array: assigns,
      user_id: user.id,
      required_unique: false,
      type: automation_type,
      by_trigger: true,
    };
    if (trigger.type === 'form_submitted') {
      const checked = await checkFormFieldRules(
        automation.trigger,
        trigger.form_id,
        fieldData
      );
      if (!checked) {
        console.log('Form submitted not match');
        return;
      }
    }
    assignTimeline(data)
      .catch((err) => {
        console.log(err.message);
      })
      .then((data) => {
        console.log('assigned result', data);
      });
  });
};

module.exports = {
  assignTimeline,
  createSubAutomation,
  updateAutomation,
  getSubTitles,
  getMaterials,
  getResources,
  downloadAutomations,
  updateAutomations,
  assignAutomation,
  onAutomationInfo,
  groupByAutomations,
  getActiveAutomationCount,
  triggerAutomation,
};
