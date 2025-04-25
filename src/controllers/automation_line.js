const Automation = require('../models/automation');
const AutomationLine = require('../models/automation_line');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const DealStage = require('../models/deal_stage');

const getDetail = (req, res) => {
  const id = req.params.id;

  AutomationLine.findOne({ _id: id })
    .then(async (_automation_line) => {
      if (!_automation_line) {
        return res.status(400).send({
          status: false,
          error: 'not_found',
        });
      }
      const actions = _automation_line.automations;
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
          automation_line: _automation_line,
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

module.exports = {
  getDetail,
};
