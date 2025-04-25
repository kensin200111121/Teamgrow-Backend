const mongoose = require('mongoose');
const TimeLine = require('../models/time_line');
const Automation = require('../models/automation');
const AutomationLine = require('../models/automation_line');
const Contact = require('../models/contact');
const Deal = require('../models/deal');
const {
  assignTimeline,
  getActiveAutomationCount,
} = require('../helpers/automation');
const { PACKAGE } = require('../constants/package');
const _ = require('lodash');

const { outbound_constants } = require('../constants/variable');
const {
  getAssignedAutomationOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');
const { checkIdentityTokens } = require('../helpers/user');

const create = async (req, res) => {
  const { currentUser, mode } = req;
  await checkIdentityTokens(currentUser);
  const {
    automation_id,
    contacts: inputContacts,
    deals: inputDeals,
  } = req.body;

  let inputData;
  if (inputContacts) {
    inputData = inputContacts;
  } else {
    inputData = inputDeals;
  }

  const _automation = await Automation.findOne({
    _id: automation_id,
  }).catch((err) => {
    console.log('automation find err', err.message);
    return (
      res &&
      res.status(400).json({
        status: false,
        error: err.message || 'Automation found err',
      })
    );
  });

  if (!currentUser.primary_connected) {
    return (
      res &&
      res.status(406).json({
        status: false,
        error: 'No email connected',
      })
    );
  }

  if (!currentUser['twilio_number'] && !currentUser['wavv_number']) {
    return (
      res &&
      res.status(408).json({
        status: false,
        error: 'No phone',
      })
    );
  }

  if (_automation) {
    let count = 0;
    let max_assign_count;

    const automation_info = currentUser.automation_info;

    if (!automation_info['is_enabled']) {
      return (
        res &&
        res.status(412).send({
          status: false,
          error: 'Disable create automations',
        })
      );
    }

    if (automation_info['is_limit']) {
      max_assign_count =
        automation_info.max_count || PACKAGE.PRO.automation_info.max_count;

      count = await getActiveAutomationCount(currentUser._id);
    }

    if (automation_info['is_limit'] && max_assign_count <= count) {
      return (
        res &&
        res.status(412).send({
          status: false,
          error: 'Exceed max active automations',
        })
      );
    }

    const assigns = [...inputData];
    const type = inputContacts && inputContacts.length ? 'contact' : 'deal';
    if (assigns.length) {
      const data = {
        ...req.body,
        automation_id,
        assign_array: assigns,
        user_id: currentUser.id,
        required_unique: req.body.required_unique ?? true,
        type,
        mode,
      };

      const { result: _result } = await assignTimeline(data).catch((err) => {
        console.log('automation assign error', err.message);
        return res.status(500).json({
          status: false,
          error: err.message || 'Automation assignment is failed.',
        });
      });

      const assignResult = _result;

      const error = [];
      let notRunnedAssignContactIds = [];
      let notRunnedAssignDealIds = [];
      const runnedContactIds = [];
      const runnedDealIds = [];
      console.log(assignResult);
      if (!assignResult) {
        return res.status(412).send({
          status: false,
          error: 'Automation assignment failed - no results returned',
        });
      }

      for (let i = 0; i < assignResult.length; i++) {
        const result = assignResult[i];
        if (type === 'contact') {
          if (!result.status) {
            error.push({
              contact: result.contact,
              error: result.error,
            });
          } else {
            runnedContactIds.push(result.contact?._id);
          }
        } else {
          if (!result.status) {
            error.push({
              deal: result.deal,
              error: result.error,
            });
          } else {
            runnedDealIds.push(result.deal?._id);
          }
        }
      }
      if (type === 'contact') {
        notRunnedAssignContactIds = _.differenceBy(
          assigns,
          runnedContactIds,
          (e) => e.toString()
        );
      } else {
        notRunnedAssignDealIds = _.differenceBy(assigns, runnedDealIds, (e) =>
          e.toString()
        );
      }

      const params = {
        automation_id,
        contact_ids: runnedContactIds,
        deal_ids: runnedDealIds,
        create_at: new Date(),
      };

      await outboundCallhookApi(
        currentUser.id,
        outbound_constants.ASSINGED_AUTOMATION,
        getAssignedAutomationOutboundData,
        params
      );

      if (error.length > 0) {
        return (
          res &&
          res.status(405).json({
            status: false,
            error,
            notExecuted: [
              ...notRunnedAssignContactIds,
              ...notRunnedAssignDealIds,
            ],
          })
        );
      } else {
        return (
          res &&
          res.send({
            status: true,
            data: mode === 'automation' ? _result : undefined,
          })
        );
      }
    }
  } else {
    // return res.status(412).send({
    //   status: false,
    //   error: 'Exceed upload max materials',
    // });
    return (
      res &&
      res.status(400).json({
        status: false,
        error: 'Automation not found',
      })
    );
  }
};

const load = async (req, res) => {
  const { currentUser } = req;
  const { skip, limit, searchStr } = req.body;
  let searchQuery = {};

  if (searchStr) {
    const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
    if (search.split(' ').length > 1) {
      searchQuery = {
        $or: [
          {
            'contact.first_name': {
              $regex: search.split(' ')[0],
              $options: 'i',
            },
            'contact.last_name': {
              $regex: search.split(' ')[1],
              $options: 'i',
            },
          },
          {
            'deal.title': { $regex: search, $options: 'i' },
          },
        ],
      };
    } else {
      searchQuery = {
        $or: [
          {
            'contact.first_name': {
              $regex: search,
              $options: 'i',
            },
          },
          {
            'contact.last_name': {
              $regex: search,
              $options: 'i',
            },
          },
          {
            'deal.title': { $regex: search, $options: 'i' },
          },
        ],
      };
    }
  }

  const sharedContacts = await Contact.find({
    user: currentUser._id,
    shared_members: { $exists: true, $ne: [] },
  }).select('_id');
  const sharedContactIds = sharedContacts.map((item) => item._id);

  AutomationLine.aggregate([
    {
      $match: {
        $and: [
          { user: mongoose.Types.ObjectId(currentUser._id) },
          {
            $or: [
              { contact: { $exists: true } },
              { contact: { $in: sharedContactIds } },
              { deal: { $exists: true } },
            ],
          },
          { status: 'running' },
        ],
      },
    },
    { $match: searchQuery },
    { $count: 'total' },
  ])
    .then((result) => {
      if (!result || !result.length) {
        return res.send({
          status: true,
          data: { tasks: [], total: 0 },
        });
      }
      AutomationLine.find({
        ...searchQuery,
        user: mongoose.Types.ObjectId(currentUser._id),
        status: 'running',
        $or: [
          { contact: { $exists: true } },
          { contact: { $in: sharedContactIds } },
          { deal: { $exists: true } },
        ],
      })
        .populate({
          path: 'automation',
          select: '_id title',
          model: Automation,
        })
        .populate({
          path: 'contact',
          select: '_id first_name last_name cell_phone email label',
          model: Contact,
        })
        .populate({ path: 'deal', select: '_id title', model: Deal })
        .skip(skip)
        .limit(limit)
        .then(async (_data) => {
          const automationLineIds = _data.map(
            (_automationLine) => _automationLine._id
          );
          const duedateList = await TimeLine.find({
            automation_line: { $in: automationLineIds },
            status: { $in: ['active', 'progress'] },
          }).select({ automation_line: 1, due_date: 1 });
          const automationLineList = _data.map((_automationLine) => {
            const _timeline = duedateList.find(
              (_timeline) =>
                _timeline.automation_line.toString() ===
                _automationLine._id.toString()
            );
            return {
              ..._automationLine._doc,
              detail: _automationLine.automation,
              due_date: _timeline?.due_date,
            };
          });
          return res.send({
            status: true,
            data: {
              tasks: automationLineList,
              total: result[0].total,
            },
          });
        })
        .catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message || err,
          });
        });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || err,
      });
    });
};

const getAutomationTimelines = async (req, res) => {
  const { automationLineId } = req.body;
  const automation_line = await AutomationLine.findOne({
    _id: automationLineId,
  }).select({ _id: 1, title: 1, action_count: 1, status: 1, type: 1 });

  if (automation_line) {
    const timelines = await TimeLine.find({
      automation_line: automation_line?._id,
    })
      .sort({ due_date: 1 })
      .catch((err) => {
        console.log('err', err);
      });
    if (timelines && timelines?.length > 0) {
      const data = {
        _id: automation_line?._id,
        title: automation_line?.title,
        action_count: automation_line?.action_count,
        status: automation_line?.action_count,
        type: automation_line?.type,
        timelines,
      };
      return res.send({ status: true, data });
    } else {
      return res.status(400).json({
        status: false,
        error: 'Timeline not found',
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'Automation Line not found',
    });
  }
};

module.exports = {
  create,
  load,
  getAutomationTimelines,
};
