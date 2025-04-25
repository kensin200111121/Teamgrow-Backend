const mongoose = require('mongoose');
const EmailTemplate = require('../models/email_template');
const Garbage = require('../models/garbage');
const Team = require('../models/team');
const Folder = require('../models/folder');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const DealStage = require('../models/deal_stage');
const Automation = require('../models/automation');
const Pipeline = require('../models/pipe_line');
const User = require('../models/user');
const CustomField = require('../models/custom_field');
const Notification = require('../models/notification');
const { getTextMaterials } = require('./utility');
const { updateAutomations, getMaterials } = require('./automation');
const { getAllFolders } = require('./folder');
const { createNotification } = require('./notification');
const { v4: uuidv4 } = require('uuid');
const contactTableFields = require('../constants/contact');
const moment = require('moment');

const addMemberToCommnunity = async (userId, teamId) => {
  const community = await Team.findOne({
    _id: teamId,
  }).catch((err) => {
    console.log('Community find error', err);
  });
  const members = community.members;
  if (members.indexOf(userId) === -1) {
    members.push(userId);
  }
  await Team.updateOne(
    {
      _id: community._id,
    },
    {
      $set: {
        members,
      },
    }
  ).catch((err) => {
    console.log('team update err: ', err.message);
  });
};

const downloadCommunityMaterials = async (userId, teamId) => {
  const root_folder = await Folder.findOne({
    team: teamId,
    role: 'team',
    del: { $ne: true },
  });
  const video_query = {
    _id: { $in: root_folder.videos },
    del: { $ne: true },
  };
  const pdf_query = {
    _id: { $in: root_folder.pdfs },
    del: { $ne: true },
  };
  const image_query = {
    _id: { $in: root_folder.images },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'material',
    del: { $ne: true },
  };

  const video_list = await Video.find(video_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const pdf_list = await PDF.find(pdf_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const image_list = await Image.find(image_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  let folderIds = folder_list.map((e) => e._id);
  let videoIds = video_list.map((e) => e._id);
  let imageIds = image_list.map((e) => e._id);
  let pdfIds = pdf_list.map((e) => e._id);
  // Find all materials from folders
  let relatedFolderIds = [];
  let relatedVideoIds = [];
  let relatedPdfIds = [];
  let relatedImageIds = [];
  const folders = await getAllFolders('material', folderIds, folderIds);
  folders.forEach((e) => {
    relatedFolderIds = [...relatedFolderIds, ...e.folders];
    relatedVideoIds = [...relatedVideoIds, ...e.videos];
    relatedPdfIds = [...relatedPdfIds, ...e.pdfs];
    relatedImageIds = [...relatedImageIds, ...e.images];
  });
  folderIds = [...new Set(folderIds)];
  videoIds = [...new Set(videoIds)];
  pdfIds = [...new Set(pdfIds)];
  imageIds = [...new Set(imageIds)];

  await downloadResources(
    {
      videos: videoIds,
      pdfs: pdfIds,
      images: imageIds,
      folders: folderIds,
      relatedVideos: relatedVideoIds,
      relatedPdfs: relatedPdfIds,
      relatedImages: relatedImageIds,
      relatedFolders: relatedFolderIds,
    },
    userId,
    teamId
  );
};

const downloadCommunityTemplates = async (userId, teamId) => {
  const root_folder = await Folder.findOne({
    team: teamId,
    role: 'team',
    del: { $ne: true },
  });

  const template_query = {
    _id: { $in: root_folder.templates },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'template',
    del: { $ne: true },
  };

  const template_list = await EmailTemplate.find(template_query)
    .select('-content')
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const templateIds = template_list.map((_template) => _template._id);
  const folderIds = folder_list.map((e) => e._id);
  let relatedFolderIds = [];
  let relatedTemplateIds = [];
  const folders = await getAllFolders('template', folderIds, folderIds);
  folders.forEach((e) => {
    relatedFolderIds = [...relatedFolderIds, ...e.folders];
    relatedTemplateIds = [...relatedTemplateIds, ...e.templates];
  });
  relatedFolderIds = relatedFolderIds.filter((e) => !folderIds.includes(e));
  const { videoIds, pdfIds, imageIds } = await getTemplateMaterials(
    templateIds
  );
  await downloadResources(
    {
      relatedVideos: videoIds.map((e) => e + ''),
      relatedPdfs: pdfIds.map((e) => e + ''),
      relatedImages: imageIds.map((e) => e + ''),
      relatedFolders: relatedFolderIds.map((e) => e + ''),
      relatedTemplates: relatedTemplateIds.map((e) => e + ''),
      folders: folderIds.map((e) => e + ''),
      templates: templateIds.map((e) => e + ''),
    },
    userId,
    teamId
  );
};

const downloadCommunityAutomations = async (userId, teamId) => {
  const root_folder = await Folder.findOne({
    team: teamId,
    role: 'team',
    del: { $ne: true },
  });
  const automation_query = {
    _id: { $in: root_folder.automations },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'automation',
    del: { $ne: true },
  };

  const automations_list = await Automation.find(automation_query)
    .select('-automations')
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const automationIds = automations_list.map((_automation) => _automation._id);
  const folderIds = folder_list.map((e) => e._id);
  const folders = await getAllFolders('template', folderIds, folderIds);
  let relatedFolderIds = [];
  let relatedAutomationIds = [];
  folders.forEach((e) => {
    relatedFolderIds = [...relatedFolderIds, ...e.folders];
    relatedAutomationIds = [...relatedAutomationIds, ...e.automations];
  });
  relatedFolderIds = relatedFolderIds.filter((e) => !folderIds.includes(e));

  const data = await getMaterials(
    [...automationIds, ...relatedAutomationIds],
    [...automationIds, ...relatedAutomationIds],
    [],
    [],
    [],
    null,
    []
  );
  const videoIds = [...new Set([...(data.videos || [])])];
  const imageIds = [...new Set([...(data.images || [])])];
  const pdfIds = [...new Set([...(data.pdfs || [])])];
  const stageIds = [...new Set([...(data.stages || [])])];
  const allAutomationIds = [...new Set([...(data.ids || [])])];
  relatedAutomationIds = allAutomationIds.filter(
    (e) => !automationIds.includes(e)
  );
  await downloadResources(
    {
      relatedVideos: videoIds.map((e) => e + ''),
      relatedPdfs: pdfIds.map((e) => e + ''),
      relatedImages: imageIds.map((e) => e + ''),
      relatedStages: stageIds.map((e) => e + ''),
      relatedAutomations: relatedAutomationIds.map((e) => e + ''),
      relatedAllAutomations: allAutomationIds.map((e) => e + ''),
      relatedFolders: relatedFolderIds.map((e) => e + ''),
      automations: automationIds.map((e) => e + ''),
      folders: folderIds.map((e) => e + ''),
    },
    userId,
    teamId
  );
};

const downloadCommunityPipelines = async (userId, teamId) => {
  const team = await Team.findOne({ _id: teamId }).catch((err) => {
    console.log('team find err', err.message);
  });
  if (team) {
    const pipelineIds = team.pipelines;
    const pipeline_query = {
      _id: { $in: pipelineIds },
    };
    const pipeline_list = await Pipeline.find(pipeline_query).sort({
      created_at: 1,
    });
    const automations = [];
    const _pipelineIds = pipeline_list.map((_pipeline) => _pipeline._id);
    await DealStage.find({ pipe_line: { $in: _pipelineIds } }).then(
      (stages) => {
        stages.forEach((e) => {
          if (
            e.automation &&
            automations.findIndex((o) => o._id === e.automation) === -1
          )
            automations.push({ _id: e.automation, type: 'automation' });
        });
      }
    );

    const related = await getResourcesToDownloadAutomations(automations);
    related['pipelines'] = _pipelineIds;

    await downloadResources(related, userId, teamId);
  }
};

const getTemplateMaterials = async (ids, user) => {
  let videoIds = [];
  let pdfIds = [];
  let imageIds = [];
  const query = { _id: { $in: ids } };
  if (user) {
    query['user'] = user;
  }
  const templateDocs = await EmailTemplate.find(query).catch(() => {});
  // - Extract all related materials from templates(above step)
  templateDocs.forEach((e) => {
    let templateVideoIds = [];
    let templateImageIds = [];
    let templatePdfIds = [];
    if (e.type === 'email') {
      templateVideoIds = e.video_ids || [];
      templateImageIds = e.image_ids || [];
      templatePdfIds = e.pdf_ids || [];
    } else {
      const { textVideoIds, textPdfIds, textImageIds } = getTextMaterials(
        e.content
      );
      templateVideoIds = textVideoIds || [];
      templatePdfIds = textPdfIds || [];
      templateImageIds = textImageIds || [];
    }
    videoIds = [...videoIds, ...templateVideoIds];
    pdfIds = [...pdfIds, ...templatePdfIds];
    imageIds = [...imageIds, ...templateImageIds];
  });

  return {
    videoIds,
    pdfIds,
    imageIds,
  };
};

const getResourcesToDownloadAutomations = async (automations) => {
  const originalFolderIds = [];
  const automationIds = [];
  const folderIds = [];
  automations.forEach((e) => {
    if (e.type === 'folder') {
      originalFolderIds.push(e._id);
      folderIds.push(e._id);
    } else {
      automationIds.push(e._id);
    }
  });

  const folders = await getAllFolders('automation', folderIds, folderIds);
  let relatedFolderIds = [];
  let relatedAutomationIds = [];
  folders.forEach((e) => {
    relatedFolderIds = [...relatedFolderIds, ...e.folders];
    relatedAutomationIds = [...relatedAutomationIds, ...e.automations];
  });
  relatedFolderIds = relatedFolderIds.filter((e) => !folderIds.includes(e));

  const data = await getMaterials(
    [...automationIds, ...relatedAutomationIds],
    [...automationIds, ...relatedAutomationIds],
    [],
    [],
    [],
    null,
    []
  );
  const videoIds = [...new Set([...(data.videos || [])])];
  const imageIds = [...new Set([...(data.images || [])])];
  const pdfIds = [...new Set([...(data.pdfs || [])])];
  const stageIds = [...new Set([...(data.stages || [])])];
  const allAutomationIds = [...new Set([...(data.ids || [])])];
  relatedAutomationIds = allAutomationIds.filter(
    (e) => !automationIds.includes(e)
  );

  return {
    relatedVideos: videoIds.map((e) => e + ''),
    relatedPdfs: pdfIds.map((e) => e + ''),
    relatedImages: imageIds.map((e) => e + ''),
    relatedStages: stageIds.map((e) => e + ''),
    relatedAutomations: relatedAutomationIds.map((e) => e + ''),
    relatedAllAutomations: allAutomationIds.map((e) => e + ''),
    relatedFolders: relatedFolderIds.map((e) => e + ''),
    automations: automationIds.map((e) => e + ''),
    folders: folderIds.map((e) => e + ''),
    original_folders: originalFolderIds.map((e) => e + ''),
  };
};

const downloadResources = async (
  {
    videos = [],
    pdfs = [],
    images = [],
    automations = [],
    templates = [],
    folders = [],
    relatedVideos = [],
    relatedPdfs = [],
    relatedImages = [],
    relatedTemplates = [],
    relatedAllAutomations = [],
    relatedFolders = [],
    stages = {},
    pipelines = [],
    original_folders = [],
    // isDownloadPipeline = false,
  },
  user,
  team = null
) => {
  const createdStages = [];
  if (pipelines.length) {
    const downloadedPipelines = await Pipeline.find({
      original_id: { $in: pipelines },
      user,
    });
    const originalPipelines = await Pipeline.find({
      _id: { $in: pipelines },
    });
    const downloadedSourcePipelineIds = [];
    const downloadedPipelineIds = [];
    const matchingPipelines = {};
    downloadedPipelines.forEach((e) => {
      const originalPipeline = originalPipelines.find(
        (v) => v._id.toString() === e.original_id.toString()
      );
      if (
        originalPipeline &&
        originalPipeline.version === e.original_version &&
        e.version === 0
      ) {
        downloadedPipelineIds.push(e._id + '');
        downloadedSourcePipelineIds.push(e.original_id + '');
        matchingPipelines[e.original_id] = e._id;
      }
    });
    const notDownloadedPipelines = (pipelines || []).filter(
      (e) => !downloadedSourcePipelineIds.includes(e)
    );
    const pipelinesToDownload = await Pipeline.find({
      _id: { $in: notDownloadedPipelines },
    });
    const pipelinesToClone = [];
    for (const pipeline of pipelinesToDownload) {
      const sameNamePipeline = await Pipeline.findOne({
        title: pipeline.title,
        user,
      });
      const elToClone = {
        ...pipeline._doc,
        title: sameNamePipeline
          ? `${pipeline.title}_${moment(new Date()).format('YYYYMMDDHHmmss')}`
          : pipeline.title,
        original_id: pipeline._id,
        created_at: new Date(),
        user,
        _id: undefined,
        original_version: pipeline.version,
        version: 0,
      };
      pipelinesToClone.push(elToClone);
    }
    const matchingPipeline = {};
    await Pipeline.insertMany(pipelinesToClone).then((_res) => {
      _res.forEach((e) => {
        matchingPipeline[e.original_id] = e._id;
      });
    });
    const dealstagesToDownload = await DealStage.find({
      pipe_line: { $in: notDownloadedPipelines },
    }).catch((_) => {
      console.log('deal stages downloading', _);
    });
    const dealstagesToClone = [];
    const hasAutomationDealStages = [];
    dealstagesToDownload.forEach((e) => {
      const elToClone = {
        ...e._doc,
        original_id: e._id,
        deals: [],
        pipe_line: matchingPipeline[e.pipe_line],
        automation: null,
        created_at: new Date(),
        user,
        _id: undefined,
      };
      if (e?.automation) {
        const hasAutomationDeal = {
          title: e.title,
          _id: e._id,
          priority: e.priority,
          automation: e.automation,
        };
        hasAutomationDealStages.push(hasAutomationDeal);
      }
      dealstagesToClone.push(elToClone);
    });
    await DealStage.insertMany(dealstagesToClone).then(async (_res) => {
      for (const item of _res) {
        const matchingDealStage = dealstagesToClone.find(
          (e) =>
            e.priority === item.priority &&
            `${e.original_id}` === `${item.original_id}`
        );
        const automationDeal = hasAutomationDealStages.find(
          (e) =>
            e.priority === item.priority && `${e._id}` === `${item.original_id}`
        );

        matchingDealStage._id = item._id;
        stages[`${item.original_id}`] = item._id;
        matchingDealStage.automation = automationDeal?.automation || null;
        createdStages.push(matchingDealStage);
      }
    });
  }
  // return null;
  // related materials without duplication & generate matching table
  const downloadedVideos = await Video.find({
    original_id: { $in: relatedVideos },
    user,
    del: false,
  });
  const downloadedPdfs = await PDF.find({
    original_id: { $in: relatedPdfs },
    user,
    del: false,
  });
  const downloadedImages = await Image.find({
    original_id: { $in: relatedImages },
    user,
    del: false,
  });

  const originalVideos = await Video.find({
    _id: { $in: relatedVideos },
    del: false,
  });

  const originalPdfs = await PDF.find({
    _id: { $in: relatedPdfs },
    del: false,
  });
  const originalImages = await Image.find({
    _id: { $in: relatedImages },
    del: false,
  });
  const downloadedSourceVideoIds = [];
  const downloadedSourceImageIds = [];
  const downloadedSourcePdfIds = [];
  const downloadedVideoIds = [];
  const downloadedImageIds = [];
  const downloadedPdfIds = [];
  const matchingVideos = {};
  const matchingPdfs = {};
  const matchingImages = {};
  downloadedVideos.forEach((e) => {
    const originalVideo = originalVideos.find(
      (v) => v._id.toString() === e.original_id.toString()
    );
    if (
      originalVideo &&
      originalVideo.version === e.original_version &&
      e.version === 0
    ) {
      downloadedVideoIds.push(e._id + '');
      downloadedSourceVideoIds.push(e.original_id + '');
      matchingVideos[e.original_id] = e._id;
    }
  });
  downloadedImages.forEach((e) => {
    const originalImage = originalImages.find(
      (v) => v._id.toString() === e.original_id.toString()
    );
    if (
      originalImage &&
      originalImage.version === e.original_version &&
      e.version === 0
    ) {
      downloadedImageIds.push(e._id + '');
      downloadedSourceImageIds.push(e.original_id + '');
      matchingImages[e.original_id] = e._id;
    }
  });
  downloadedPdfs.forEach((e) => {
    const originalPdf = originalPdfs.find(
      (v) => v._id.toString() === e.original_id.toString()
    );
    if (
      originalPdf &&
      originalPdf.version === e.original_version &&
      e.version === 0
    ) {
      downloadedPdfIds.push(e._id + '');
      downloadedSourcePdfIds.push(e.original_id + '');
      matchingPdfs[e.original_id] = e._id;
    }
  });

  const notDownloadedVideos = (relatedVideos || []).filter(
    (e) => !downloadedSourceVideoIds.includes(e)
  );
  const notDownloadedPdfs = (relatedPdfs || []).filter(
    (e) => !downloadedSourcePdfIds.includes(e)
  );
  const notDownloadedImages = (relatedImages || []).filter(
    (e) => !downloadedSourceImageIds.includes(e)
  );
  const videoIdsToDownload = [...notDownloadedVideos, ...(videos || [])];
  const pdfIdsToDownload = [...notDownloadedPdfs, ...(pdfs || [])];
  const imageIdsToDownload = [...notDownloadedImages, ...(images || [])];
  const videosToDownload = await Video.find({
    _id: { $in: videoIdsToDownload },
  });
  const pdfsToDownload = await PDF.find({
    _id: { $in: pdfIdsToDownload },
  });
  const imagesToDownload = await Image.find({
    _id: { $in: imageIdsToDownload },
  });
  const videosToClone = [];
  const pdfsToClone = [];
  const imagesToClone = [];

  // Get team setting
  let is_sharable = true;
  let is_download = true;
  if (team) {
    const teamData = await Team.findOne({ _id: team }, { team_setting: 1 });
    is_sharable = teamData.team_setting.shareMaterial;
    is_download = teamData.team_setting.downloadMaterial;
  }

  videosToDownload.forEach((e) => {
    const elToClone = {
      ...e._doc,
      original_id: e._id,
      team_id: team || undefined,
      role: '',
      created_at: undefined,
      is_sharable,
      is_download,
      user,
      _id: undefined,
      original_version: e.version,
      version: 0,
    };
    videosToClone.push(elToClone);
  });
  pdfsToDownload.forEach((e) => {
    const elToClone = {
      ...e._doc,
      original_id: e._id,
      team_id: team || undefined,
      role: '',
      created_at: undefined,
      is_sharable,
      is_download,
      user,
      _id: undefined,
      original_version: e.version,
      version: 0,
    };
    pdfsToClone.push(elToClone);
  });
  imagesToDownload.forEach((e) => {
    const elToClone = {
      ...e._doc,
      original_id: e._id,
      team_id: team || undefined,
      role: '',
      created_at: undefined,
      is_sharable,
      is_download,
      user,
      _id: undefined,
      original_version: e.version,
      version: 0,
    };
    imagesToClone.push(elToClone);
  });
  const newVideoIds = [];
  const newPdfIds = [];
  const newImageIds = [];
  const newVideoIdsForRoot = [];
  const newPdfIdsForRoot = [];
  const newImageIdsForRoot = [];
  await Video.insertMany(videosToClone).then((_res) => {
    _res.forEach((e) => {
      matchingVideos[e.original_id] = e._id;
      newVideoIds.push(e._id);
      newVideoIdsForRoot.push(e._id);
    });
  });
  await PDF.insertMany(pdfsToClone).then((_res) => {
    _res.forEach((e) => {
      matchingPdfs[e.original_id] = e._id;
      newPdfIds.push(e._id);
      newPdfIdsForRoot.push(e._id);
    });
  });
  await Image.insertMany(imagesToClone).then((_res) => {
    _res.forEach((e) => {
      matchingImages[e.original_id] = e._id;
      newImageIds.push(e._id);
      newImageIdsForRoot.push(e._id);
    });
  });
  await Video.updateMany(
    { _id: { $in: downloadedVideoIds } },
    {
      $set: {
        created_at: new Date(),
      },
    }
  );
  await PDF.updateMany(
    { _id: { $in: downloadedPdfIds } },
    {
      $set: {
        created_at: new Date(),
      },
    }
  );
  await Image.updateMany(
    { _id: { $in: downloadedImageIds } },
    {
      $set: {
        created_at: new Date(),
      },
    }
  );

  // related templates without duplication & generate matching table
  const downloadedTemplates = await EmailTemplate.find({
    original_id: { $in: relatedTemplates },
    user,
    del: false,
  });
  const originalTemplates = await EmailTemplate.find({
    _id: { $in: relatedTemplates },
    user,
    del: false,
  });

  const downloadedSourceTemplateIds = [];
  const downloadedTemplateIds = [];
  const matchingTemplates = {};
  downloadedTemplates.forEach((e) => {
    const originalTemplate = originalTemplates.find(
      (v) => v._id.toString() === e.original_id.toString()
    );
    if (
      originalTemplate &&
      originalTemplate.version === e.original_version &&
      e.version === 0
    ) {
      downloadedTemplateIds.push(e._id + '');
      downloadedSourceTemplateIds.push(e.original_id + '');
      matchingTemplates[e.original_id] = e._id;
    }
  });
  const notDownloadedTemplates = (relatedTemplates || []).filter(
    (e) => !downloadedSourceTemplateIds.includes(e)
  );
  const templateIdsToDownload = [
    ...notDownloadedTemplates,
    ...(templates || []),
  ];
  const templatesToDownload = await EmailTemplate.find({
    _id: { $in: templateIdsToDownload },
  });
  const templatesToClone = [];
  templatesToDownload.forEach((template) => {
    let old_video_ids = template.video_ids || [];
    let old_pdf_ids = template.pdf_ids || [];
    let old_image_ids = template.image_ids || [];
    let new_content = template.content;
    if (template.type === 'text') {
      const { videoIds, pdfIds, imageIds } = getTextMaterials(template.content);
      old_video_ids = videoIds || [];
      old_pdf_ids = pdfIds || [];
      old_image_ids = imageIds || [];
    }
    const new_video_ids = [];
    const new_image_ids = [];
    const new_pdf_ids = [];
    old_video_ids.forEach((e) => {
      if (matchingVideos[e]) {
        new_video_ids.push(matchingVideos[e]);
        new_content = new_content.replace(e, matchingVideos[e]);
      }
    });
    old_image_ids.forEach((e) => {
      if (matchingImages[e]) {
        new_image_ids.push(matchingImages[e]);
        new_content = new_content.replace(e, matchingImages[e]);
      }
    });
    old_pdf_ids.forEach((e) => {
      if (matchingPdfs[e]) {
        new_pdf_ids.push(matchingPdfs[e]);
        new_content = new_content.replace(e, matchingPdfs[e]);
      }
    });
    const elToClone = {
      ...template._doc,
      original_id: template._id,
      team_id: team || undefined,
      user,
      role: '',
      created_at: undefined,
      is_sharable,
      _id: undefined,
      video_ids: new_video_ids,
      pdf_ids: new_pdf_ids,
      image_ids: new_image_ids,
      original_version: template.version,
      version: 0,
    };
    templatesToClone.push(elToClone);
  });

  // related automations without duplication & generate matching table
  const downloadedAutomations = await Automation.find({
    original_id: { $in: relatedAllAutomations },
    user,
    del: false,
  });
  const originalAutomations = await Automation.find({
    _id: { $in: relatedAllAutomations },
    // user,
    del: false,
  });
  const downloadedSourceAutomationIds = [];
  const downloadedAutomationIds = [];
  const matchingAutomations = {};
  downloadedAutomations.forEach((e) => {
    const originalAutomation = originalAutomations.find(
      (v) => v._id.toString() === e.original_id.toString()
    );
    if (
      originalAutomation &&
      originalAutomation.version === e.original_version &&
      e.version === 0
    ) {
      downloadedAutomationIds.push(e._id + '');
      downloadedSourceAutomationIds.push(e.original_id + '');
      matchingAutomations[e.original_id] = e._id;
    }
  });
  const notDownloadedAutomations = (relatedAllAutomations || []).filter(
    (e) => !downloadedSourceAutomationIds.includes(e)
  );
  const automationIdsToDownload = [
    ...notDownloadedAutomations,
    ...(automations || []),
  ];
  const automationsToDownload = await Automation.find({
    _id: { $in: automationIdsToDownload },
  });
  const automationsToClone = [];
  automationsToDownload.forEach((automation) => {
    const elToClone = {
      ...automation._doc,
      original_id: automation._id,
      team_id: team || undefined,
      role: '',
      user,
      created_at: undefined,
      is_sharable,
      _id: undefined,
      original_version: automation.version,
      isDownloading: true,
      version: 0,
      del: false,
      automations: [],
    };
    automationsToClone.push(elToClone);
  });

  // Download custom tokens
  let customTokenIds = [];
  const tokenUserIds = [];
  if (templates.length) {
    const query = { _id: { $in: templateIdsToDownload } };
    const templateDocs = await EmailTemplate.find(query).catch(() => {});
    templateDocs.forEach((e) => {
      if (e.token_ids) {
        customTokenIds = [...customTokenIds, ...e.token_ids];
        tokenUserIds.push(e.user + '');
      }
    });
  }

  if (automations.length) {
    const query = { _id: { $in: automationIdsToDownload } };
    const automationDocs = await Automation.find(query).catch(() => {});
    automationDocs.forEach((e) => {
      if (e.meta && e.meta.tokens) {
        customTokenIds = [...customTokenIds, ...e.meta.tokens];
        tokenUserIds.push(e.user + '');
      }
    });
  }

  let duplicatedTokens = [];
  if (customTokenIds.length) {
    duplicatedTokens = await downloadCustomTokens(
      customTokenIds,
      tokenUserIds,
      user
    );
  }

  const newTemplateIds = [];
  const newTemplateIdsForRoot = [];
  await EmailTemplate.insertMany(templatesToClone).then((_res) => {
    _res.forEach((e) => {
      matchingTemplates[e.original_id] = e._id;
      newTemplateIds.push(e._id);
      newTemplateIdsForRoot.push(e._id);
    });
  });

  const newAutomationIds = [];
  const newAutomationIdsForRoot = [];
  await Automation.insertMany(automationsToClone).then(async (_res) => {
    for (const e of _res) {
      matchingAutomations[e.original_id] = e._id;
      newAutomationIds.push(e._id);
      newAutomationIdsForRoot.push(e._id);
      const matchingStage = createdStages.find(
        (stage) =>
          stage?.automation &&
          stage?.automation.toString() === e.original_id.toString()
      );
      if (matchingStage) {
        await DealStage.updateOne(
          { _id: matchingStage._id },
          { $set: { automation: e._id } }
        );
      }
    }
  });
  await updateAutomations({
    downloadAutomationIds: automationIdsToDownload,
    automationsDic: matchingAutomations,
    videosDic: matchingVideos,
    pdfsDic: matchingPdfs,
    imagesDic: matchingImages,
    stagesDic: stages,
    isDownloading: true,
  });

  // related folders download and generate matching table
  const downloadedFolders = await Folder.find({
    original_id: { $in: folders },
    user,
    del: false,
  });
  const downloadedSourceFolderIds = [];
  const downloadedFolderIds = [];
  downloadedFolders.forEach((e) => {
    downloadedFolderIds.push(e._id + '');
    downloadedSourceFolderIds.push(e.original_id + '');
  });
  const notDownloadedFolders = (folders || []).filter(
    (e) => !downloadedSourceFolderIds.includes(e)
  );
  const matchingFolders = downloadedFolders.reduce(
    (dic, e) => ({ ...dic, [e.original_id]: e._id }),
    {}
  );
  const foldersToDownload = await Folder.find({
    _id: { $in: notDownloadedFolders },
  });

  const foldersToClone = [];
  const rootAutomations = [...newAutomationIds];
  const rootImages = [...newImageIds];
  const rootPdfs = [...newPdfIds];
  const rootVideos = [...newVideoIds];
  const rootTemplates = [...newTemplateIds];
  foldersToDownload.forEach((folder) => {
    const old_video_ids = folder.videos;
    const old_pdf_ids = folder.pdfs;
    const old_image_ids = folder.images;
    const old_template_ids = folder.templates;
    const old_automation_ids = folder.automations;
    const new_video_ids = [];
    const new_pdf_ids = [];
    const new_image_ids = [];
    const new_template_ids = [];
    const new_automation_ids = [];
    old_video_ids.forEach((e) => {
      if (matchingVideos[e]) {
        new_video_ids.push(matchingVideos[e]);
        const index = rootVideos.indexOf(matchingVideos[e]);
        if (index > -1) {
          rootVideos.splice(index, 1);
        }
      }
    });
    old_pdf_ids.forEach((e) => {
      if (matchingPdfs[e]) {
        new_pdf_ids.push(matchingPdfs[e]);
        const index = rootPdfs.indexOf(matchingPdfs[e]);
        if (index > -1) {
          rootPdfs.splice(index, 1);
        }
      }
    });
    old_image_ids.forEach((e) => {
      if (matchingImages[e]) {
        new_image_ids.push(matchingImages[e]);
        const index = rootImages.indexOf(matchingImages[e]);
        if (index > -1) {
          rootImages.splice(index, 1);
        }
      }
    });
    old_template_ids.forEach((e) => {
      if (matchingTemplates[e]) {
        new_template_ids.push(matchingTemplates[e]);
        const index = rootTemplates.indexOf(matchingTemplates[e]);
        if (index > -1) {
          rootTemplates.splice(index, 1);
        }
      }
    });
    old_automation_ids.forEach((e) => {
      if (matchingAutomations[e]) {
        new_automation_ids.push(matchingAutomations[e]);
        const index = rootAutomations.indexOf(matchingAutomations[e]);
        if (index > -1) {
          rootAutomations.splice(index, 1);
        }
      }
    });
    const elToClone = {
      ...folder._doc,
      original_id: folder._id,
      team_id: team || undefined,
      user,
      rootFolder: false,
      _id: undefined,
      created_at: undefined,
      videos: new_video_ids,
      pdfs: new_pdf_ids,
      images: new_image_ids,
      templates: new_template_ids,
      automations: new_automation_ids,
      folders: [],
      is_sharable,
      version: 0,
    };
    foldersToClone.push(elToClone);
  });
  const oldFolders = {}; // _id: folders_array
  const newFolderIds = [];
  const newFoldersForRoot = [];
  await Folder.insertMany(foldersToClone).then((_res) => {
    _res.forEach((e) => {
      const nFolder = foldersToDownload.find(
        (folder) => `${folder._id}` === `${e.original_id}`
      );
      matchingFolders[e.original_id] = e._id;
      oldFolders[e._id] = nFolder.folders;
      newFolderIds.push(e._id);
      if (original_folders.includes(e.original_id.toString())) {
        newFoldersForRoot.push(e._id);
      }
    });
  });
  const rootFolders = [...newFolderIds];

  for (const _id in oldFolders) {
    const old_folder_ids = oldFolders[_id];
    const new_folder_ids = [];
    old_folder_ids.forEach((e) => {
      if (matchingFolders[e]) {
        new_folder_ids.push(matchingFolders[e]);
        const index = rootFolders.indexOf(matchingFolders[e]);
        if (index > -1) {
          rootFolders.splice(index, 1);
        }
      }
    });
    await Folder.updateOne({ _id }, { $set: { folders: new_folder_ids } });
  }

  for (const key in matchingFolders) {
    const _id = matchingFolders[key];
    if (downloadedSourceFolderIds.includes(`${key}`)) {
      const folder = await Folder.findOne({
        _id: mongoose.Types.ObjectId(key),
      });
      const new_video_ids = [];
      const new_pdf_ids = [];
      const new_image_ids = [];
      const new_template_ids = [];
      const new_automation_ids = [];
      const new_folder_ids = [];
      const old_video_ids = folder.videos;
      const old_pdf_ids = folder.pdfs;
      const old_image_ids = folder.images;
      const old_template_ids = folder.templates;
      const old_automation_ids = folder.automations;
      const old_folder_ids = folder.folders;
      old_folder_ids.forEach((e) => {
        if (matchingFolders[e] && newFolderIds.includes(matchingFolders[e])) {
          new_folder_ids.push(matchingFolders[e]);
          const index = rootFolders.indexOf(matchingFolders[e]);
          if (index > -1) {
            rootFolders.splice(index, 1);
          }
        }
      });

      old_video_ids.forEach((e) => {
        if (matchingVideos[e] && newVideoIds.includes(matchingVideos[e])) {
          new_video_ids.push(matchingVideos[e]);
          const index = rootVideos.indexOf(matchingVideos[e]);
          if (index > -1) {
            rootVideos.splice(index, 1);
          }
        }
      });
      old_pdf_ids.forEach((e) => {
        if (matchingPdfs[e] && newPdfIds.includes(matchingPdfs[e])) {
          new_pdf_ids.push(matchingPdfs[e]);
          const index = rootPdfs.indexOf(matchingPdfs[e]);
          if (index > -1) {
            rootPdfs.splice(index, 1);
          }
        }
      });
      old_image_ids.forEach((e) => {
        if (matchingImages[e] && newImageIds.includes(matchingImages[e])) {
          new_image_ids.push(matchingImages[e]);
          const index = rootImages.indexOf(matchingImages[e]);
          if (index > -1) {
            rootImages.splice(index, 1);
          }
        }
      });
      old_template_ids.forEach((e) => {
        if (
          matchingTemplates[e] &&
          newTemplateIds.includes(matchingTemplates[e])
        ) {
          new_template_ids.push(matchingTemplates[e]);
          const index = rootTemplates.indexOf(matchingTemplates[e]);
          if (index > -1) {
            rootTemplates.splice(index, 1);
          }
        }
      });
      old_automation_ids.forEach((e) => {
        if (
          matchingAutomations[e] &&
          newAutomationIds.includes(matchingAutomations[e])
        ) {
          new_automation_ids.push(matchingAutomations[e]);
          const index = rootAutomations.indexOf(matchingAutomations[e]);
          if (index > -1) {
            rootAutomations.splice(index, 1);
          }
        }
      });

      await Folder.updateOne(
        { _id },
        {
          $addToSet: {
            videos: { $each: new_video_ids },
            images: { $each: new_image_ids },
            pdfs: { $each: new_pdf_ids },
            templates: { $each: new_template_ids },
            automations: { $each: new_automation_ids },
            folders: { $each: new_folder_ids },
          },
        }
      );
    }
  }

  if (
    rootAutomations.length ||
    rootImages.length ||
    rootPdfs.length ||
    rootVideos.length ||
    rootTemplates.length ||
    rootFolders.length
  ) {
    await Folder.updateOne(
      {
        user,
        rootFolder: true,
        del: false,
      },
      {
        $addToSet: {
          automations: { $each: rootAutomations },
          templates: { $each: rootTemplates },
          videos: { $each: rootVideos },
          images: { $each: rootImages },
          pdfs: { $each: rootPdfs },
          folders: { $each: rootFolders },
        },
      }
    );
  }

  return duplicatedTokens;
};

const updateInternalTeam = async (teamId, teamName, owner, members) => {
  let userTeam;
  if (teamId) {
    userTeam = await Team.findOne({ _id: teamId }).catch((e) => console.log(e));
  } else {
    userTeam = await Team.findOne({
      owner: owner._id,
      is_internal: true,
    }).catch((e) => console.log(e));
  }

  if (userTeam) {
    await Team.updateOne(
      { _id: userTeam._id },
      { $set: { members, owner: owner._id, name: teamName } }
    ).catch((e) => console.log(e));
  } else {
    const team = new Team({
      name: teamName,
      owner: owner.id,
      members,
      is_internal: true,
    });
    userTeam = await team.save().catch((err) => {
      console.log('user community create error', err);
    });
  }

  return userTeam._id;
};

const updateUsersForTeam = async (
  organization,
  owner,
  members,
  inActiveMembers = []
) => {
  await User.updateMany(
    { _id: { $in: members } },
    {
      $set: {
        organization,
        is_primary: false,
        'organization_info.is_owner': false,
        'organization_info.is_enabled': true,
        'assignee_info.is_enabled': true,
        'assignee_info.is_editable': true,
      },
    }
  ).catch((e) => console.log(e));
  await User.updateOne(
    { _id: owner._id },
    { $set: { is_primary: true, 'organization_info.is_owner': true } }
  ).catch((e) => console.log(e));

  if (inActiveMembers.length) {
    await User.updateMany(
      { _id: { $in: inActiveMembers }, organization },
      {
        $set: {
          is_primary: true,
          'organization_info.is_owner': true,
          'organization_info.is_enabled': true,
          'assignee_info.is_enabled': true,
          'assignee_info.is_editable': true,
        },
        $unset: { organization },
      }
    ).catch((e) => console.log(e));
  }
};

const downloadCustomTokens = async (customTokenIds, tokenUserIds, user) => {
  const garbages = await Garbage.find({
    user: { $in: tokenUserIds },
  }).catch((err) => {
    console.log('User gabage not found', err.message);
  });
  const additional_fields = await CustomField.find({
    user,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed, ', ex.message);
  });
  const garbage = await Garbage.findOne({
    user,
  }).catch((err) => {
    console.log('User gabage not found', err.message);
  });
  const myTokens = garbage.template_tokens;
  const newTokens = [];
  const myAddtionalFields = additional_fields || [];
  const newAdditionalFields = [];
  let duplicatedTokens = [];
  for (const el of garbages) {
    const tokens = el.template_tokens;
    const token_user = el.user;
    for (const token of tokens) {
      if (customTokenIds.includes(token.id)) {
        const tokenName = token.name;
        const match_field = token.match_field;
        const index = myTokens.findIndex((e) => e.name === tokenName);
        const index2 = newTokens.findIndex((e) => e.name === tokenName);
        if (index === -1 && index2 === -1) {
          const newId = uuidv4();
          const tokenObj = {
            name: token.name,
            value: token.value,
            match_field: token.match_field,
            id: newId,
          };
          newTokens.push(tokenObj);
          const match_fields = [
            {
              field_name: token.match_field,
              value: token.value,
              token_user,
              selected: true,
            },
          ];
          const duplicatedToken = {
            name: token.name,
            match_fields,
          };
          duplicatedTokens.push(duplicatedToken);
          // Addtional fields
          const aIndex = myAddtionalFields.findIndex(
            (e) => e.name === match_field
          );
          const cIndex = contactTableFields.findIndex(
            (e) => e.value === match_field
          );
          if (aIndex === -1 && cIndex === -1) {
            const org_fields = await CustomField.find({
              user: el.user,
              kind: 'contact',
              name: match_field,
            }).catch((ex) => {
              console.log('custom field load failed, ', ex.message);
            });
            if (org_fields) {
              const nIndex = newAdditionalFields.findIndex(
                (field) => field.name === match_field
              );
              if (nIndex === -1) {
                const { _id, user, ...rest } = org_fields;
                const nwField = new CustomField({
                  user,
                  kind: 'contact',
                  ...rest,
                });
                await nwField.save().catch((err) => {
                  console.log('custom field save error', err.message);
                });
                newAdditionalFields.push(nwField);
              }
            }
          }
        } else {
          const d_index = duplicatedTokens.findIndex(
            (t) => t.name === token.name
          );
          if (d_index !== -1) {
            const m_index = duplicatedTokens[d_index].match_fields.findIndex(
              (f) => f.field_name === token.match_field
            );
            if (m_index === -1) {
              duplicatedTokens[d_index].match_fields.push({
                value: token.value,
                field_name: token.match_field,
                token_user,
                selected: false,
              });
            }
          } else {
            const match_fields = [
              {
                value: myTokens[index].value,
                field_name: myTokens[index].match_field,
                token_user: 'me',
                selected: true,
              },
            ];
            if (myTokens[index].match_field !== token.match_field) {
              match_fields.push({
                value: token.value,
                field_name: token.match_field,
                token_user,
                selected: false,
              });
            }
            const duplicatedToken = {
              name: token.name,
              match_fields,
            };
            duplicatedTokens.push(duplicatedToken);
          }
        }
      }
    }
  }
  duplicatedTokens = duplicatedTokens.filter((t) => t.match_fields.length > 1);

  return duplicatedTokens;
};

const downloadDuplicatedCustomTokens = async (customTokens, user) => {
  const myGarbage = await Garbage.findOne({
    user,
  }).catch((err) => {
    console.log('User gabage not found', err.message);
  });
  const additional_fields = await CustomField.find({
    user,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed, ', ex.message);
  });
  const templateTokens = myGarbage.template_tokens || [];
  const additionalFields = additional_fields || [];
  const newAdditionalFields = [];
  for (let i = 0; i < customTokens.length; i++) {
    const token_user = customTokens[i].token_user;
    const match_field = customTokens[i].match_field;
    if (!customTokens[i].is_standard_field) {
      const token_additional_field = await CustomField.findOne({
        user: token_user,
        kind: 'contact',
        name: match_field,
      }).catch((ex) => {
        console.log('custom field load failed, ', ex.message);
      });
      if (token_additional_field) {
        const myIndex = additionalFields.findIndex(
          (field) => field.name === match_field
        );
        const index = newAdditionalFields.findIndex(
          (field) => field.name === match_field
        );
        if (myIndex === -1 && index === -1) {
          const { _id, user, ...rest } = token_additional_field;
          const nwField = new CustomField({
            user,
            kind: 'contact',
            ...rest,
          });
          nwField.save().catch((err) => {
            console.log('custom field save error', err.message);
          });
          newAdditionalFields.push(token_additional_field);
        }
      }
    }
    const tokenIndex = templateTokens.findIndex(
      (obj) => obj.name === customTokens[i].name
    );
    if (tokenIndex !== -1) {
      templateTokens[tokenIndex].match_field = match_field;
    }
  }

  const updateQuery = {
    $set: { template_tokens: templateTokens },
  };

  await Garbage.updateOne({ user }, updateQuery).catch((err) => {
    console.log('upate gabage error ', err.message);
  });
};

/**
 * check & create team folder
 * @param {*} team
 * @param {*} type: 'material' | 'template' | 'automation'
 */
const findOrCreateTeamFolder = async (team) => {
  const folder = await Folder.findOne({
    team: team._id,
    role: 'team',
    del: false,
  }).catch(() => {
    console.log('team folder finding is failed');
  });
  if (folder) {
    return folder;
  } else {
    const newFolder = new Folder({
      team: team._id,
      title: team.name,
      role: 'team',
      del: false,
    });
    await newFolder.save().catch(() => {
      console.log('team folder creation is failed');
    });
    return newFolder;
  }
};
/**
 * Insert the materials to the corresponding fields of Team & Team Folder
 * @param {*} team
 * @param {*} folder
 * @param {*} materials
 */
const shareResourcesHelper = async (
  teams,
  folders,
  resources,
  user,
  rootFolderIds = []
) => {
  // insert the ids to team and folders
  const teamQuery = {};
  const folderQuery = {};
  const teamIds = teams.map((team) => team._id);
  for (let index = 0; index < resources.length; index++) {
    const _resource = resources[index];
    let criteria;
    let action;
    if (_resource.type === 'templates') {
      teamQuery['email_templates'] = { $each: _resource.ids };
    } else {
      teamQuery[_resource.type] = { $each: _resource.ids };
    }
    if (_resource.type !== 'folders') {
      folderQuery[_resource.type] = { $each: _resource.ids };
    } else {
      const realFolderIds = _resource.ids.filter((e) => {
        const index = rootFolderIds.findIndex((r) => r === e.toString());
        return index >= 0;
      });
      folderQuery['folders'] = { $each: realFolderIds };
    }

    if (_resource.type === 'videos') {
      await Video.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_material';
      action = {
        object: 'video',
        video: _resource.ids,
      };
    } else if (_resource.type === 'pdfs') {
      await PDF.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_material';
      action = {
        object: 'pdf',
        pdf: _resource.ids,
      };
    } else if (_resource.type === 'images') {
      await Image.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_material';
      action = {
        object: 'image',
        image: _resource.ids,
      };
    } else if (_resource.type === 'folders') {
      await Folder.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_folder';
      action = {
        object: 'folder',
        folder: _resource.ids,
      };
    } else if (_resource.type === 'automations') {
      await Automation.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_automation';
      action = {
        object: 'automation',
        automation: _resource.ids,
      };
    } else if (_resource.type === 'templates') {
      await EmailTemplate.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_template';
      action = {
        object: 'email',
        template: _resource.ids,
      };
    } else if (_resource.type === 'pipelines') {
      await Pipeline.updateMany(
        { _id: { $in: _resource.ids } },
        {
          $set: { role: 'team' },
        }
      );
      criteria = 'share_pipeline';
      action = {
        object: 'pipeline',
        pipeline: _resource.ids,
      };
    }
    if (_resource.ids.length)
      createNotificationTeamMember(teams, user, criteria, action);
  }

  await Team.updateMany(
    { _id: { $in: teamIds } },
    {
      $addToSet: teamQuery,
    }
  ).catch((err) => {});
  await Folder.updateMany(
    { _id: { $in: folders } },
    {
      $addToSet: folderQuery,
    }
  ).catch((err) => {
    console.log('err =>', err);
  });

  // role update of resources
};

const unshareResourcesHelper = async (teams, folders, resources, user) => {
  // insert the ids to team and folders
  const teamQuery = {};
  const folderQuery = {};
  await resources.forEach(async (_resource) => {
    if (_resource.type === 'templates') {
      teamQuery['email_templates'] = { $in: _resource.ids };
    } else {
      teamQuery[_resource.type] = { $in: _resource.ids };
    }
    folderQuery[_resource.type] = { $in: _resource.ids };
    // remove from team
  });
  await Team.updateMany(
    { _id: { $in: teams } },
    {
      $pull: teamQuery,
    }
  ).catch((err) => {});

  // remove from team folder
  await Folder.updateMany(
    { _id: { $in: folders } },
    {
      $pull: folderQuery,
    }
  ).catch((err) => {});

  await resources.forEach(async (_resource) => {
    switch (_resource.type) {
      case 'videos':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            videos: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await Video.updateOne({ _id: e }, { $unset: { role: true } }).catch(
              () => {}
            );
          }
        });
        break;
      case 'pdfs':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            pdfs: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await PDF.updateOne({ _id: e }, { $unset: { role: true } }).catch(
              () => {}
            );
          }
        });
        break;
      case 'images':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            images: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await Image.updateOne({ _id: e }, { $unset: { role: true } }).catch(
              () => {}
            );
          }
        });
        break;
      case 'folders':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            folders: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await Folder.updateOne(
              { _id: e },
              { $unset: { role: true } }
            ).catch(() => {});
          }
        });
        break;
      case 'automations':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            automations: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await Automation.updateOne(
              { _id: e },
              { $unset: { role: true } }
            ).catch(() => {});
          }
        });
        break;
      case 'templates':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            email_templates: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await EmailTemplate.updateOne(
              { _id: e },
              { $unset: { role: true } }
            ).catch(() => {});
          }
        });
        break;
      case 'pipelines':
        await _resource.ids.forEach(async (e) => {
          const count = await Team.countDocuments({
            pipelines: { $in: [e] },
            $or: [{ owner: user._id }, { editors: user._id }],
          });
          if (!count) {
            await Pipeline.updateOne(
              { _id: e },
              { $unset: { role: true } }
            ).catch(() => {});
          }
        });
        break;
    }
  });
};

/**
 * Creat notification
 * @param {*} teams
 */

const createNotificationTeamMember = (teams, currentUser, criteria, action) => {
  teams.forEach((team) => {
    let team_owners = [];
    let team_members = [];
    if (team.owner instanceof Array) {
      team_owners = team.owner;
    } else {
      team_owners = [team.owner];
    }
    if (team.members instanceof Array) {
      team_members = team.members;
    } else {
      team_members = [team.members];
    }
    const allUsers = [...team_owners, ...team_members];
    allUsers.forEach((user) => {
      const notification = new Notification({
        creator: currentUser._id,
        user,
        criteria,
        team: team._id,
        action,
      });
      notification.save().catch((err) => {
        console.log('creating notification is failed', err);
      });

      createNotification(
        criteria,
        {
          process: notification,
        },
        {
          _id: notification.user,
        }
      );
    });
  });
};

module.exports = {
  addMemberToCommnunity,
  downloadCommunityMaterials,
  downloadCommunityTemplates,
  downloadCommunityAutomations,
  downloadCommunityPipelines,
  getTemplateMaterials,
  getResourcesToDownloadAutomations,
  downloadResources,
  downloadCustomTokens,
  downloadDuplicatedCustomTokens,
  updateInternalTeam,
  updateUsersForTeam,
  findOrCreateTeamFolder,
  createNotificationTeamMember,
  unshareResourcesHelper,
  shareResourcesHelper,
};
