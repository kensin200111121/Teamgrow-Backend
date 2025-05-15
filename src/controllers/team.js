const mongoose = require('mongoose');
const urls = require('../constants/urls');
const short = require('short-uuid');
const moment = require('moment-timezone');
const Team = require('../models/team');
const User = require('../models/user');
const Image = require('../models/image');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Folder = require('../models/folder');
const Automation = require('../models/automation');
const Pipeline = require('../models/pipe_line');
const EmailTemplate = require('../models/email_template');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const Contact = require('../models/contact');
const Notification = require('../models/notification');
const DealStage = require('../models/deal_stage');
const { uploadBase64Image } = require('../helpers/fileUpload');
const { getUserTimezone, trackApiRequest } = require('../helpers/utility');
const { sendNotificationEmail } = require('../helpers/notification');
const { PACKAGE } = require('../constants/package');
const { createNotification } = require('../helpers/notification');
const { getMaterials, getResources } = require('../helpers/automation');
const { getTextMaterials } = require('../helpers/utility');
const { removeSharedItems, migrateSubAccountInfo } = require('../helpers/user');
const { getAllFolders, checkFolderIsShared } = require('../helpers/folder');
const {
  downloadResources,
  getTemplateMaterials,
  getResourcesToDownloadAutomations,
  downloadDuplicatedCustomTokens,
  updateInternalTeam,
  updateUsersForTeam,
  findOrCreateTeamFolder,
  createNotificationTeamMember,
  unshareResourcesHelper,
  shareResourcesHelper,
} = require('../helpers/team');
const PipeLine = require('../models/pipe_line');
const Organization = require('../models/organization');
const { getTeamById } = require('../services/identity');

const getAll = (req, res) => {
  const { currentUser } = req;

  Team.find({
    $or: [
      {
        members: currentUser.id,
      },
      { owner: currentUser.id },
    ],
    // is_internal: false,
  })
    .populate([
      {
        path: 'owner',
        select: {
          _id: 1,
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
        },
      },
      {
        path: 'members',
        select: {
          _id: 1,
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
        },
      },
      {
        path: 'editors',
        select: {
          _id: 1,
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
        },
      },
    ])
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const getInvitedTeam = (req, res) => {
  const { currentUser } = req;

  Team.find({ invites: currentUser.id })
    .populate('owner')
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const getRequestedTeam = (req, res) => {
  const { currentUser } = req;
  Team.find({ requests: currentUser.id })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const updateOrganization = async (req, res) => {
  const { team_id } = req.body;

  if (!team_id) {
    return res.status(500).send({
      status: false,
      error: 'Team id is required',
    });
  }

  trackApiRequest('update-organization', req.body);

  const vortexTeamInfo = await getTeamById(team_id).catch(() => {});

  trackApiRequest('vortex-team', vortexTeamInfo);

  if (!vortexTeamInfo || !vortexTeamInfo.members?.length) {
    return res.status(500).send({
      status: false,
      error: 'Invalid team id',
    });
  }

  const users = await User.find({
    vortex_id: {
      $in: vortexTeamInfo.members.map((member) => member.customer_id),
    },
  }).catch((e) => console.log(e));

  // Get vortex_ids from the retrieved users
  const matchedVortexIds = new Set(users.map((user) => user.vortex_id + ''));

  // Filter members whose customer_id is not in the matched vortex_ids
  const notFoundMembers = vortexTeamInfo.members.filter(
    (member) => !matchedVortexIds.has(member.customer_id + '')
  );

  if (!users.length) {
    return res.status(500).send({
      status: false,
      error: 'No users for this team',
    });
  }

  let virtualCustomerInfo;

  let owner;

  const members = users.map((user) => {
    const member = vortexTeamInfo.members.find(
      (member) => member.customer_id + '' === user.vortex_id + ''
    );

    const avatarColor =
      virtualCustomerInfo?.teamPreferences?.members?.[user.vortex_id]
        ?.avatarColor || null;

    if (member && member.role === 'OWNER') {
      owner = user;
    }

    // Return an object with user's id and isPrimary field from the member
    return {
      user: user._id,
      role: member?.role || 'MEMBER',
      status: member?.status || 'INACTIVE',
      avatar_color: avatarColor,
      vortex_user_id: user.vortex_id,
    };
  });

  const activeMembers = members
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => m.user);
  const activeMemberIds = activeMembers.map((e) => e + '');

  const exists = await Organization.findOne({
    vortex_team: team_id,
  }).catch((e) => console.log(e));

  if (exists) {
    const inActiveMembers = exists.members
      .filter((e) => {
        return (
          e.status === 'ACTIVE' && activeMemberIds.indexOf(e.user + '') === -1
        );
      })
      .map((e) => e.user);
    await updateInternalTeam(
      exists.team,
      vortexTeamInfo.name,
      owner,
      activeMembers
    ).catch((e) => console.log(e));

    inActiveMembers.forEach(async (member) => {
      await migrateSubAccountInfo(member);
    });
    Organization.updateOne(
      { _id: exists._id },
      {
        $set: {
          members,
          owner: owner._id,
          ...(vortexTeamInfo.virtual_customer?.customer_id
            ? {
                virtual_customer_id:
                  vortexTeamInfo.virtual_customer?.customer_id,
              }
            : {}),
        },
      }
    )
      .then(async (data) => {
        await updateUsersForTeam(
          exists._id,
          owner,
          activeMembers,
          inActiveMembers
        ).catch((e) => console.log(e));
        return res.send({
          status: true,
          data,
          notFoundMembers,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else {
    const internalTeamId = await updateInternalTeam(
      null,
      vortexTeamInfo.name,
      owner,
      activeMembers
    ).catch((e) => console.log(e));
    const organization = new Organization({
      name: vortexTeamInfo.name,
      owner: owner.id,
      vortex_team: team_id,
      members,
      team: internalTeamId,
      ...(vortexTeamInfo.virtual_customer?.customer_id
        ? {
            virtual_customer_id: vortexTeamInfo.virtual_customer?.customer_id,
          }
        : {}),
    });

    organization
      .save()
      .then(async (data) => {
        await updateUsersForTeam(data._id, owner, activeMembers).catch((e) =>
          console.log(e)
        );
        return res.send({
          status: true,
          data,
          notFoundMembers,
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

const getTeam = (req, res) => {
  const { currentUser } = req;
  Team.find({
    $or: [
      {
        members: req.params.id,
      },
      { owner: req.params.id },
    ],
  })
    .populate({ path: 'owner' })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const get = (req, res) => {
  const { currentUser } = req;

  Team.findOne({
    $or: [
      {
        _id: req.params.id,
        members: currentUser.id,
      },
      {
        _id: req.params.id,
        owner: currentUser.id,
      },
      /*
      {
        _id: req.params.id,
        invites: currentUser.id,
      },
      */
    ],
  })
    .populate([
      {
        path: 'owner',
        select: {
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
          company: 1,
          location: 1,
          time_zone_info: 1,
        },
      },
      {
        path: 'members',
        select: {
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
          company: 1,
          location: 1,
          time_zone_info: 1,
        },
      },
      {
        path: 'invites',
        select: {
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
          company: 1,
          location: 1,
          time_zone_info: 1,
        },
      },
      {
        path: 'requests',
        select: {
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
          company: 1,
          location: 1,
          time_zone_info: 1,
        },
      },
    ])
    .then(async (data) => {
      if (data && !data.join_link) {
        const join_link = short.generate();
        Team.updateOne(
          { _id: req.params.id },
          {
            $set: { join_link },
          }
        ).catch((err) => {
          console.log('team join link update err', err.message);
        });

        return res.send({
          status: true,
          data: { ...data._doc, join_link },
        });
      } else {
        return res.send({
          status: true,
          data,
        });
      }
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const get1 = async (req, res) => {
  const { currentUser } = req;
  const team_id = req.params.id;
  Team.findById(team_id)
    .then(async (_team) => {
      if (
        _team.owner.indexOf(currentUser.id) !== -1 ||
        _team.members.indexOf(currentUser.id) !== -1
      ) {
        const owner = await User.findById(_team.owner);
        const members = await User.find({ _id: { $in: _team.members } });
        const videos = await Video.find({ _id: { $in: _team.videos } });
        const pdfs = await PDF.find({ _id: { $in: _team.pdfs } });
        const images = await Image.find({ _id: { $in: _team.images } });
        const automations = await Automation.find({
          _id: { $in: _team.automations },
        });
        const contacts = await Contact.find({ _id: { $in: _team.contacts } });
        const templates = await EmailTemplate.find({
          _id: { $in: _team.email_templates },
        });
        return res.send({
          status: true,
          data: {
            ..._team._doc,
            owner,
            members,
            videos,
            pdfs,
            images,
            automations,
            contacts,
            templates,
          },
        });
      } else {
        return res.status(400).send({
          status: false,
          error: 'Invalid Permission',
        });
      }
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const create = async (req, res) => {
  const { currentUser } = req;

  if (currentUser.team_info && currentUser.team_info.is_limit) {
    const numberOfOldTeam = await Team.countDocuments({
      owner: currentUser.id,
      is_internal: false,
    }).catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });

    if (numberOfOldTeam >= currentUser.team_info.max_count) {
      return res.status(400).send({
        status: false,
        error:
          'You can create only ' + currentUser.team_info.max_count + 'teams',
      });
    }
  }

  const teamReq = req.body;
  let picture = '';
  if (teamReq.picture) {
    picture = await uploadBase64Image(teamReq.picture);
  }

  const join_link = short.generate();
  const team = new Team({
    ...teamReq,
    picture,
    owner: currentUser.id,
    join_link,
  });

  team
    .save()
    .then((_team) => {
      findOrCreateTeamFolder(_team);
      return res.send({
        status: true,
        data: _team,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const update = async (req, res) => {
  const { currentUser } = req;

  const team = await Team.findOne({
    _id: req.params.id,
    owner: currentUser.id,
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  let picture;
  if (req.body.picture) {
    picture = await uploadBase64Image(req.body.picture);
  } else {
    picture = team.picture;
  }

  Team.findOneAndUpdate(
    {
      _id: req.params.id,
      owner: currentUser.id,
    },
    {
      $set: {
        ...req.body,
        picture,
      },
    },
    { new: true }
  )
    .then(async (data) => {
      await Folder.updateOne(
        {
          team: data._id,
          role: 'team',
          del: false,
        },
        {
          $set: { title: data.name || '' },
        }
      );
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const cancelRequest = async (req, res) => {
  const { currentUser } = req;
  await Team.updateOne(
    { _id: req.params.id },
    {
      $pull: { requests: { $in: [currentUser.id] } },
    }
  ).catch((err) => {
    console.log(err.message);
  });

  return res.send({
    status: true,
  });
};

const bulkInvites = async (req, res) => {
  const { currentUser } = req;
  const { emails } = req.body;
  const is_bulk = false;
  const team = await Team.findOne({
    _id: req.params.id,
    $or: [
      {
        members: currentUser.id,
      },
      {
        owner: currentUser.id,
      },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  const inviteIds = team.invites;
  const newInvites = [];
  const invites = [];
  const referrals = [];

  for (const email of emails) {
    const user = await User.findOne({
      email,
      del: false,
    }).select({
      _id: 1,
      user_name: 1,
      time_zone_info: 1,
      picture_profile: 1,
      phone: 1,
      location: 1,
      email: 1,
      company: 1,
    });
    if (user) {
      if (
        team.members.indexOf(user._id) < 0 &&
        team.owner.indexOf(user._id) < 0
      ) {
        invites.push(user);
      }
    } else {
      referrals.push(email);
    }
  }

  invites.forEach((e) => {
    if (inviteIds.indexOf(e._id) === -1) {
      inviteIds.push(e._id);
      newInvites.push(e);
    }
  });

  const referralEmails = team.referrals;
  const newReferrals = [];
  referrals.forEach((e) => {
    if (referralEmails.indexOf(e) === -1) {
      referralEmails.push(e);
      newReferrals.push(e);
    }
  });
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  Team.updateOne(
    {
      _id: req.params.id,
    },
    {
      $set: {
        invites: inviteIds,
        referrals: referralEmails,
      },
    }
  )
    .then(async () => {
      const invitedUsers = await User.find({
        // _id: { $in: newInvites },
        _id: { $in: inviteIds },
        del: false,
      });

      /** **********
       *  Send email notification to the inviated users
       *  */
      let site_url;
      site_url =
        currentUser.source === 'vortex'
          ? urls.VORTEX_DOMAIN_URL
          : urls.LOGIN_URL;
      const team_url =
        currentUser.source === 'vortex'
          ? urls.VORTEX_TEAM_LIST_URL
          : urls.TEAM_LIST_URL;
      for (let i = 0; i < invitedUsers.length; i++) {
        const invite = invitedUsers[i];
        if (is_bulk || emails.includes(invite.email)) {
          const user_name = invite.user_name
            ? invite.user_name.split(' ')[0]
            : '';
          const time_zone = getUserTimezone(invite);

          const data = {
            template_data: {
              user_name,
              team_leader_name: user_name,
              team_member_name: user_name,
              created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
              team_name: team.name,
              site_url,
              team_url,
            },
            template_name: prefix + 'TeamInvitation',
            required_reply: false,
            email: invite.email,
            source: currentUser.source,
          };

          sendNotificationEmail(data);
        }
      }

      /** **********
       *  Send email notification to the referral users
       *  */

      if (currentUser.affiliate && currentUser.affiliate.link) {
        site_url = currentUser.affiliate.link;
      } else if (currentUser.source === 'vortex') {
        site_url = urls.VORTEX_DOMAIN_URL;
      } else {
        site_url = urls.DOMAIN_URL;
      }

      const time_zone = getUserTimezone(currentUser);

      for (let i = 0; i < referralEmails.length; i++) {
        const referral = referralEmails[i];
        if (is_bulk || emails.includes(referral)) {
          const data = {
            template_data: {
              user_name: '',
              created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
              team_name: team.name,
              site_url,
              team_url: site_url,
            },
            template_name: prefix + 'TeamInvitation',
            required_reply: false,
            email: referral,
            source: currentUser.source,
          };

          sendNotificationEmail(data);
        }
      }

      /** **********
       *  Creat dashboard notification to the invited users
       *  */
      for (let i = 0; i < invitedUsers.length; i++) {
        const invite = invitedUsers[i];
        if (is_bulk || emails.includes(invite.email)) {
          const team_url = `<a href="${urls.TEAM_URL}">${team.name}</a>`;
          const notification = new Notification({
            creator: currentUser._id,
            user: invite,
            team: team.id,
            criteria: 'team_invited',
            content: `${currentUser.user_name} has invited you to join team ${team_url} in CRMGrow`,
          });
          notification.save().catch((err) => {
            console.log('notification save err', err.message);
          });
          createNotification(
            'team_invited',
            {
              process: notification,
            },
            { _id: invite._id }
          );
        }
      }
      res.send({
        status: true,
        data: {
          invites: is_bulk ? invitedUsers : newInvites,
          referrals: is_bulk ? referralEmails : newReferrals,
        },
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const cancelInvite = async (req, res) => {
  const { currentUser } = req;
  const { emails } = req.body;
  const team = await Team.findOne({
    _id: req.params.id,
    $or: [
      {
        members: currentUser.id,
      },
      {
        owner: currentUser.id,
      },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  for (const email of emails) {
    const user = await User.findOne({
      email,
      del: false,
    });
    if (user) {
      if (
        team.members.indexOf(user._id) < 0 &&
        team.owner.indexOf(user._id) < 0
      ) {
        const index = team.invites.findIndex(
          (item) => item + '' === user._id + ''
        );
        if (index >= 0) team.invites.splice(index, 1);
        else {
          const index = team.referrals.findIndex((item) => item === email);
          if (index >= 0) team.referrals.splice(index, 1);
        }
      }
    } else {
      const index = team.referrals.findIndex((item) => item === email);
      if (index >= 0) team.referrals.splice(index, 1);
    }
  }

  team.save();

  return res.send({
    status: true,
  });
};

const acceptInviation = async (req, res) => {
  const { currentUser } = req;
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  const teamUrl =
    currentUser.source === 'vortex' ? urls.VORTEX_TEAM_URL : urls.TEAM_URL;
  const team = await Team.findOne({
    _id: req.params.id,
    invites: currentUser.id,
  })
    .populate('owner')
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || 'Team found err',
      });
    });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  const members = team.members;
  const invites = team.invites;
  if (members.indexOf(currentUser.id) === -1) {
    members.push(currentUser.id);
  }
  if (invites.indexOf(currentUser.id) !== -1) {
    const pos = invites.indexOf(currentUser.id);
    invites.splice(pos, 1);
  }

  Team.updateOne(
    {
      _id: req.params.id,
    },
    {
      $set: {
        members,
        invites,
      },
    }
  )
    .then(async () => {
      // Update contact shared with this team - all members
      await Contact.updateMany(
        {
          shared_team: [req.params.id],
          shared_all_member: true,
        },
        {
          $set: {
            pending_users: members,
          },
        }
      ).catch((err) => {
        console.log('Update contacts', err.message);
      });
      /** **********
       *  Send email accept notification to the inviated users
       *  */
      const time_zone = getUserTimezone(currentUser);
      const owners = team.owner;
      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            team_name: team.name,
            team_url: teamUrl + team.id,
          },
          template_name: prefix + 'TeamJoinAccepted',
          required_reply: false,
          email: owner.email,
          source: currentUser.source,
        };

        sendNotificationEmail(data);
      }

      const inviteNotification = await Notification.findOne({
        team: team.id,
        user: currentUser.id,
        criteria: 'team_invited',
      }).catch((err) => {
        console.log('invite notification getting err', err);
      });
      if (inviteNotification) {
        inviteNotification['is_read'] = true;
        inviteNotification.save().catch((err) => {
          console.log('mark as read failed', err);
        });

        const acceptNotification = new Notification({
          team: team.id,
          creator: currentUser._id,
          user: inviteNotification['creator'],
          criteria: 'team_accept',
        });
        acceptNotification.save().catch((err) => {
          console.log('accept notification is failed.', err);
        });
      } else {
        for (let i = 0; i < owners.length; i++) {
          const acceptNotification = new Notification({
            team: team.id,
            creator: currentUser._id,
            user: owners[i]._id,
            criteria: 'team_accept',
          });
          acceptNotification.save().catch((err) => {
            console.log('accept notification is failed.', err);
          });
        }
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
};

const declineInviation = async (req, res) => {
  const { currentUser } = req;
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  const teamUrl =
    currentUser.source === 'vortex' ? urls.VORTEX_TEAM_URL : urls.TEAM_URL;
  const team = await Team.findOne({
    _id: req.params.id,
    invites: currentUser.id,
  })
    .populate('owner')
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || 'Team found err',
      });
    });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  const invites = team.invites;

  if (invites.indexOf(currentUser.id) !== -1) {
    const pos = invites.indexOf(currentUser.id);
    invites.splice(pos, 1);
  }

  Team.updateOne(
    {
      _id: req.params.id,
    },
    {
      $set: {
        invites,
      },
    }
  )
    .then(async () => {
      /** **********
       *  Send email accept notification to the inviated users
       *  */
      const time_zone = getUserTimezone(currentUser);
      const owners = team.owner;
      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            team_name: team.name,
            team_url: teamUrl + team.id,
          },
          template_name: prefix + 'TeamJoinDeclined',
          required_reply: false,
          email: owner.email,
          source: currentUser.source,
        };

        sendNotificationEmail(data);
      }

      /** **********
       *  Mark read true dashboard notification for accepted users
       *  */
      const inviteNotification = await Notification.findOne({
        team: team.id,
        user: currentUser.id,
        criteria: 'team_invited',
      }).catch((err) => {
        console.log('invite notification getting err', err);
      });
      if (inviteNotification) {
        inviteNotification['is_read'] = true;
        inviteNotification.save().catch((err) => {
          console.log('mark as read failed', err);
        });

        const rejectNotification = new Notification({
          team: team.id,
          creator: currentUser._id,
          user: inviteNotification['creator'],
          criteria: 'team_reject',
        });
        rejectNotification.save().catch((err) => {
          console.log('accept notification is failed.', err);
        });
      } else {
        for (let i = 0; i < owners.length; i++) {
          const rejectNotification = new Notification({
            team: team.id,
            creator: currentUser._id,
            user: owners[i]._id,
            criteria: 'team_reject',
          });
          rejectNotification.save().catch((err) => {
            console.log('accept notification is failed.', err);
          });
        }
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
};

const acceptRequest = async (req, res) => {
  const { currentUser } = req;
  const { team_id, request_id } = req.body;

  const team = await Team.findOne({
    _id: team_id,
    $or: [{ owner: currentUser.id }, { editors: currentUser.id }],
  })
    .populate({ path: 'owner', select: { user_name: 1 } })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || 'Team found err',
      });
    });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }
  const owner_name = team.owner[0].user_name;
  const request = await User.findOne({ _id: request_id, del: false });

  if (!request) {
    return res.status(400).send({
      status: false,
      error: 'No exist user',
    });
  }

  const members = team.members;
  const requests = team.requests;
  if (members.indexOf(request_id) === -1) {
    members.push(request_id);
  }
  if (requests.indexOf(request_id) !== -1) {
    const pos = requests.indexOf(request_id);
    requests.splice(pos, 1);
  }
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  const teamUrl =
    currentUser.source === 'vortex' ? urls.VORTEX_TEAM_URL : urls.TEAM_URL;
  Team.updateOne(
    {
      _id: team_id,
    },
    {
      $set: {
        members,
        requests,
      },
    }
  )
    .then(async () => {
      // Update contact shared with this team
      await Contact.updateMany(
        {
          shared_team: [team_id],
          shared_all_member: true,
        },
        {
          $set: {
            pending_users: members,
          },
        }
      ).catch((err) => {
        console.log('Update contacts', err.message);
      });
      const time_zone = getUserTimezone(currentUser);

      const data = {
        template_data: {
          user_name: request.user_name,
          owner_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          team_name: team.name,
          team_url: teamUrl + team.id,
        },
        template_name: prefix + 'TeamRequestAccepted',
        required_reply: false,
        email: request.email,
        source: currentUser.source,
      };

      sendNotificationEmail(data);

      /** **********
       *  Mark read true dashboard notification for accepted users
       *  */
      const requestNotification = await Notification.findOne({
        team: team.id,
        user: currentUser.id,
        criteria: 'team_requested',
      }).catch((err) => {
        console.log('invite notification getting err', err);
      });
      if (requestNotification) {
        requestNotification['is_read'] = true;
        requestNotification.save().catch((err) => {
          console.log('mark as read failed', err);
        });

        const acceptNotification = new Notification({
          team: team.id,
          creator: currentUser._id,
          user: request.id,
          criteria: 'join_accept',
        });
        acceptNotification.save().catch((err) => {
          console.log('accept notification is failed.', err);
        });
      } else {
        const acceptNotification = new Notification({
          team: team.id,
          creator: currentUser._id,
          user: request.id,
          criteria: 'join_accept',
        });
        acceptNotification.save().catch((err) => {
          console.log('accept notification is failed.', err);
        });
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
};

const declineRequest = async (req, res) => {
  const { currentUser } = req;
  const { team_id, request_id } = req.body;

  const team = await Team.findOne({
    _id: team_id,
    $or: [{ owner: currentUser.id }, { editors: currentUser.id }],
  })
    .populate({ path: 'owner', select: { user_name: 1 } })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || 'Team found err',
      });
    });

  if (!team) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }
  const owner_name = team.owner[0].user_name;
  const request = await User.findOne({ _id: request_id, del: false });

  if (!request) {
    return res.status(400).send({
      status: false,
      error: 'No exist user',
    });
  }

  const requests = team.requests;

  if (requests.indexOf(request_id) !== -1) {
    const pos = requests.indexOf(request_id);
    requests.splice(pos, 1);
  }
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  Team.updateOne(
    {
      _id: team_id,
    },
    {
      $set: {
        requests,
      },
    }
  )
    .then(async () => {
      const time_zone = getUserTimezone(currentUser);

      const data = {
        template_data: {
          user_name: request.user_name,
          owner_name,
          created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
          team_name: team.name,
        },
        template_name: prefix + 'TeamRequestDeclined',
        required_reply: false,
        email: request.email,
        source: currentUser.source,
      };

      sendNotificationEmail(data);

      /** **********
       *  Mark read true dashboard notification for accepted users
       *  */
      const requestNotification = await Notification.findOne({
        team: team.id,
        user: currentUser.id,
        criteria: 'team_requested',
      }).catch((err) => {
        console.log('invite notification getting err', err);
      });
      if (requestNotification) {
        requestNotification['is_read'] = true;
        requestNotification.save().catch((err) => {
          console.log('mark as read failed', err);
        });

        const rejectNotification = new Notification({
          team: team.id,
          creator: currentUser._id,
          user: request.id,
          criteria: 'join_reject',
        });
        rejectNotification.save().catch((err) => {
          console.log('accept notification is failed.', err);
        });
      } else {
        const rejectNotification = new Notification({
          team: team.id,
          creator: currentUser._id,
          user: request.id,
          criteria: 'join_reject',
        });
        rejectNotification.save().catch((err) => {
          console.log('accept notification is failed.', err);
        });
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
};

const shareTeamMaterials = async (req, res) => {
  const { currentUser } = req;
  const { material_ids, team_ids, type } = req.body;
  const company = currentUser.company || 'eXp Realty';

  const teams = await Team.find({
    _id: { $in: team_ids },
    $or: [
      {
        owner: currentUser.id,
      },
      { editors: currentUser.id },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (teams.length === 0) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  if (type === 'video') {
    await Video.updateMany(
      {
        _id: { $in: material_ids },
        user: currentUser.id,
      },
      {
        $set: { role: 'team' },
      }
    );
  }

  if (type === 'pdf') {
    await PDF.updateMany(
      {
        _id: { $in: material_ids },
        user: currentUser.id,
      },
      {
        $set: { role: 'team' },
      }
    );
  }

  if (type === 'image') {
    await Image.updateMany(
      {
        _id: { $in: material_ids },
        user: currentUser.id,
      },
      {
        $set: { role: 'team' },
      }
    );
  }

  const failedTeams = [];
  const updatedData = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const videoIds = team.videos;
    const pdfIds = team.pdfs;
    const imageIds = team.images;
    const newTeamMaterials = [];
    let query;
    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (type === 'video') {
      material_ids.forEach((e) => {
        if (videoIds.indexOf(e) === -1) {
          videoIds.push(e);
          newTeamMaterials.push(e);
        }
      });
      query = {
        $addToSet: {
          videos: { $each: material_ids },
        },
      };
    }

    if (type === 'pdf') {
      material_ids.forEach((e) => {
        if (pdfIds.indexOf(e) === -1) {
          pdfIds.push(e);
          newTeamMaterials.push(e);
        }
      });
      query = {
        $addToSet: {
          pdfs: { $each: material_ids },
        },
      };
    }

    if (type === 'image') {
      material_ids.forEach((e) => {
        if (imageIds.indexOf(e) === -1) {
          imageIds.push(e);
          newTeamMaterials.push(e);
        }
      });
      query = {
        $addToSet: {
          images: { $each: material_ids },
        },
      };
    }

    await Folder.updateOne({ _id: teamFolder._id }, query).catch((err) => {
      console.log('err', err.message);
    });

    await Team.updateOne({ _id: team._id }, query)
      .then(async (_data) => {
        const data = [];

        let updatedMaterials = [];
        let action;
        if (type === 'video') {
          updatedMaterials = await Video.find({
            _id: { $in: newTeamMaterials },
          });
          action = {
            object: type,
            video: newTeamMaterials,
          };
        }

        if (type === 'pdf') {
          updatedMaterials = await PDF.find({ _id: { $in: newTeamMaterials } });
          action = {
            object: type,
            pdf: newTeamMaterials,
          };
        }

        if (type === 'image') {
          updatedMaterials = await Image.find({
            _id: { $in: newTeamMaterials },
          });
          action = {
            object: type,
            image: newTeamMaterials,
          };
        }

        if (updatedMaterials.length > 0) {
          updatedData.push(updatedMaterials);
        }

        /**
         * Create Notification for the Material Share
         */
        createNotificationTeamMember(
          [team],
          currentUser,
          'share_material',
          action
        );
      })
      .catch((err) => {
        console.log('err', err.message);
        failedTeams.push(team);
      });
  }
  if (failedTeams.length > 0) {
    res.send({
      status: false,
      error: failedTeams,
    });
  } else {
    res.send({
      status: true,
      data: updatedData,
    });
  }
};

const shareMaterials = async (req, res) => {
  const { currentUser } = req;
  const { data, team_id } = req.body;
  const { folders, videos, pdfs, images } = data;
  const _team = await Team.findOne({
    _id: team_id,
    $or: [
      {
        owner: currentUser.id,
      },
      { editors: currentUser.id },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team Found Err',
    });
  });

  if (!_team) {
    return res.status(400).send({
      status: false,
      error: 'Not Found Team',
    });
  }
  let _folders = [];
  let _videos = [];
  let _pdfs = [];
  let _images = [];
  let _folderVideos = [];
  let _folderPdfs = [];
  let _folderImages = [];
  let _folderIds = [];
  let _videoIds = [];
  let _imageIds = [];
  let _pdfIds = [];
  // let _teamVideos = [];
  // let _teamImages = [];
  // let _teamPdfs = [];

  if (folders && folders.length) {
    _folders = await Folder.find({ _id: { $in: folders } });
    _folders.forEach((_folder) => {
      _folderVideos = [..._folderVideos, ..._folder.videos];
      _folderImages = [..._folderImages, ..._folder.images];
      _folderPdfs = [..._folderPdfs, ..._folder.pdfs];
    });
    _folderIds = _folders.map((e) => e._id);
  }
  if (videos && videos.length) {
    _videos = await Video.find({ _id: { $in: videos } });
    _videoIds = _videos.map((e) => e._id);
  }
  if (pdfs && pdfs.length) {
    _pdfs = await PDF.find({ _id: { $in: pdfs } });
    _pdfIds = _pdfs.map((e) => e._id);
  }
  if (images && images.length) {
    _images = await Image.find({ _id: { $in: images } });
    _imageIds = _images.map((e) => e._id);
  }

  Team.updateOne(
    { _id: team_id },
    {
      $push: {
        videos: { $each: _videoIds },
        images: { $each: _imageIds },
        pdfs: { $each: _pdfIds },
        folders: { $each: _folderIds },
      },
    }
  ).then(async () => {
    const responseData = [];
    const _updatedVideoIds = [..._folderVideos, ..._videoIds];
    const _updatedImageIds = [..._folderImages, ..._imageIds];
    const _updatedPdfIds = [..._folderPdfs, ..._pdfIds];

    const updatedVideos = await Video.find({
      _id: { $in: _updatedVideoIds },
      user: currentUser._id,
      del: false,
    });
    const updatedImages = await Image.find({
      _id: { $in: _updatedImageIds },
      user: currentUser._id,
      del: false,
    });
    const updatedPdfs = await PDF.find({
      _id: { $in: _updatedPdfIds },
      user: currentUser._id,
      del: false,
    });

    for (let i = 0; i < updatedVideos.length; i++) {
      const video = updatedVideos[i];
      if (video) {
        const views = await VideoTracker.countDocuments({
          video: video.id,
          user: currentUser.id,
        });
        const video_detail = {
          ...video._doc,
          views,
          material_type: 'video',
        };
        responseData.push(video_detail);
      }
    }
    for (let i = 0; i < updatedPdfs.length; i++) {
      const pdf = updatedPdfs[i];
      if (pdf) {
        const views = await PDFTracker.countDocuments({
          pdf: pdf.id,
          user: currentUser.id,
        });
        const pdf_detail = {
          ...pdf._doc,
          views,
          material_type: 'pdf',
        };
        responseData.push(pdf_detail);
      }
    }
    for (let i = 0; i < updatedImages.length; i++) {
      const image = updatedImages[i];
      if (image) {
        const views = await ImageTracker.countDocuments({
          image: image.id,
          user: currentUser.id,
        });
        const image_detail = {
          ...image._doc,
          views,
          material_type: 'image',
        };
        responseData.push(image_detail);
      }
    }
    _folders.forEach((e) => {
      const el = { ...e };
      const folder = { ...el._doc, material_type: 'folder' };
      responseData.push(folder);
    });

    const action = {
      video: videos,
      pdf: pdfs,
      image: images,
      folder: folders,
    };

    createNotificationTeamMember(
      [_team],
      currentUser,
      'share_material',
      action
    );

    return res.send({
      status: true,
      data: responseData,
    });
  });
};

const shareAutomations = async (req, res) => {
  const { currentUser } = req;
  const { automation_ids, team_ids } = req.body;
  const company = currentUser.company || 'eXp Realty';
  const teams = await Team.find({
    _id: { $in: team_ids },
    $or: [
      {
        owner: currentUser.id,
      },
      { editors: currentUser.id },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (teams.length === 0) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }
  const ids = automation_ids;
  const data = await getMaterials(automation_ids, ids, [], [], [], currentUser);
  const videoIds = [...new Set([...data.videos])];
  const imageIds = [...new Set([...data.images])];
  const pdfIds = [...new Set([...data.pdfs])];

  const all_automation_ids = [];
  data['ids'].forEach((e) => {
    if (all_automation_ids.indexOf(e) === -1) {
      all_automation_ids.push(e);
    }
  });
  await Automation.updateMany(
    { _id: { $in: all_automation_ids }, user: currentUser.id },
    {
      $set: { role: 'team' },
    }
  );
  await Video.updateMany(
    {
      _id: { $in: videoIds },
      user: currentUser.id,
    },
    {
      $set: { role: 'team' },
    }
  );
  await PDF.updateMany(
    {
      _id: { $in: pdfIds },
      user: currentUser.id,
    },
    {
      $set: { role: 'team' },
    }
  );
  await Image.updateMany(
    {
      _id: { $in: imageIds },
      user: currentUser.id,
    },
    {
      $set: { role: 'team' },
    }
  );

  const failedTeams = [];
  const updatedData = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const automationIds = team.automations;
    const newTeamAutomations = [];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    const query = {
      $addToSet: {
        automations: { $each: all_automation_ids },
      },
    };

    if (videoIds.length || pdfIds.length || imageIds.length) {
      const materialQuery = {
        $addToSet: {
          videos: { $each: videoIds },
          pdfs: { $each: pdfIds },
          images: { $each: imageIds },
        },
      };
      await Folder.updateOne({ _id: teamFolder._id }, materialQuery).catch(
        (err) => {
          console.log('err', err.message);
        }
      );
    }

    all_automation_ids.forEach((e) => {
      if (automationIds.indexOf(e) === -1) {
        automationIds.push(e);
        newTeamAutomations.push(e);
      }
    });
    const newVideos = team.videos;
    videoIds.forEach((e) => {
      if (team.videos.indexOf(e) === -1) {
        newVideos.push(e);
      }
    });
    const newImages = team.images;
    imageIds.forEach((e) => {
      if (team.images.indexOf(e) === -1) {
        newImages.push(e);
      }
    });
    const newPdfs = team.pdfs;
    pdfIds.forEach((e) => {
      if (team.videos.indexOf(e) === -1) {
        newPdfs.push(e);
      }
    });
    await Team.updateOne(
      { _id: team._id },
      {
        $addToSet: {
          automations: { $each: automationIds },
          videos: { $each: newVideos },
          images: { $each: newImages },
          pdfs: { $each: newPdfs },
        },
      }
    )
      .then(async (data) => {
        await Folder.updateOne({ _id: teamFolder._id }, query).catch((err) => {
          console.log('err', err.message);
        });
        const updatedAutomations = await Automation.find({
          _id: { $in: newTeamAutomations },
        });

        if (updatedAutomations.length > 0) {
          updatedData.push(updatedAutomations);
        }
        /**
         * Create Notifications
         */
        const action = {
          object: 'automation',
          automation: newTeamAutomations,
        };
        createNotificationTeamMember(
          [team],
          currentUser,
          'share_automation',
          action
        );
      })
      .catch((err) => {
        console.log('err', err.message);
        // res.status(500).json({
        //   status: false,
        //   error: err.message,
        // });
        failedTeams.push(team);
      });
  }
  if (failedTeams.length > 0) {
    res.send({
      status: false,
      error: failedTeams,
    });
  } else {
    res.send({
      status: true,
      data: updatedData,
    });
  }
};

const shareEmailTemplates = async (req, res) => {
  const { currentUser } = req;
  const { template_ids, team_ids } = req.body;
  const company = currentUser.company || 'eXp Realty';

  const teams = await Team.find({
    _id: { $in: team_ids },
    $or: [
      {
        owner: currentUser.id,
      },
      { editors: currentUser.id },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (teams.length === 0) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  const updatedData = [];
  const failedTeams = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    const query = {
      $addToSet: {
        templates: { $each: template_ids },
      },
    };

    await Folder.updateOne({ _id: teamFolder._id }, query).catch((err) => {
      console.log('err', err.message);
    });

    const templates = await EmailTemplate.find({ _id: { $in: template_ids } });
    const newVideos = team.videos;
    const newImages = team.images;
    const newPdfs = team.pdfs;

    if (newVideos.length || newPdfs.length || newImages.length) {
      const materialQuery = {
        $addToSet: {
          videos: { $each: newVideos },
          pdfs: { $each: newPdfs },
          images: { $each: newImages },
        },
      };
      await Folder.updateOne({ _id: teamFolder._id }, materialQuery).catch(
        (err) => {
          console.log('err', err.message);
        }
      );
    }

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      let video_ids = [];
      let pdf_ids = [];
      let image_ids = [];
      if (template.type === 'email') {
        video_ids = template.video_ids || [];
        pdf_ids = template.pdf_ids || [];
        image_ids = template.image_ids || [];
      } else {
        const { videoIds, pdfIds, imageIds } = getTextMaterials(
          template.content
        );
        video_ids = videoIds;
        pdf_ids = pdfIds;
        image_ids = imageIds;
      }
      video_ids.forEach((e) => {
        if (team.videos.indexOf(e) === -1) {
          newVideos.push(e);
        }
      });
      image_ids.forEach((e) => {
        if (team.images.indexOf(e) === -1) {
          newImages.push(e);
        }
      });
      pdf_ids.forEach((e) => {
        if (team.videos.indexOf(e) === -1) {
          newPdfs.push(e);
        }
      });

      const query = {
        $addToSet: {
          videos: { $each: video_ids },
          pdfs: { $each: pdf_ids },
          images: { $each: image_ids },
        },
      };

      await Folder.updateOne({ _id: teamFolder._id }, query).catch((err) => {
        console.log('err', err.message);
      });

      Video.updateMany(
        {
          _id: { $in: video_ids },
          user: currentUser.id,
        },
        {
          $set: { role: 'team' },
        }
      );
      PDF.updateMany(
        {
          _id: { $in: pdf_ids },
          user: currentUser.id,
        },
        {
          $set: { role: 'team' },
        }
      );
      Image.updateMany(
        {
          _id: { $in: image_ids },
          user: currentUser.id,
        },
        {
          $set: { role: 'team' },
        }
      );
    }

    await EmailTemplate.updateMany(
      { _id: { $in: template_ids } },
      {
        $set: { role: 'team' },
      }
    ).catch((err) => {
      console.log('Error', err);
    });

    const templateIds = team.email_templates;
    const newTeamTemplates = [];
    template_ids.forEach((e) => {
      if (templateIds.indexOf(e) === -1) {
        templateIds.push(e);
        newTeamTemplates.push(e);
      }
    });

    await Team.updateOne(
      { _id: team._id },
      {
        $addToSet: {
          email_templates: { $each: templateIds },
          videos: { $each: newVideos },
          images: { $each: newImages },
          pdfs: { $each: newPdfs },
        },
      }
    )
      .then(async () => {
        const updatedTemplates = await EmailTemplate.find({
          _id: { $in: newTeamTemplates },
        });

        if (updatedTemplates.length > 0) {
          updatedData.push(updatedTemplates);
        }
        /**
         * Create Notifications
         */
        const action = {
          object: 'template',
          template: newTeamTemplates,
        };
        createNotificationTeamMember(
          [team],
          currentUser,
          'share_template',
          action
        );
      })
      .catch((err) => {
        console.log('err', err.message);
        // res.status(500).json({
        //   status: false,
        //   error: err.message,
        // });
        failedTeams.push(team);
      });
  }
  if (failedTeams.length > 0) {
    res.send({
      status: false,
      error: failedTeams,
    });
  } else {
    res.send({
      status: true,
      data: updatedData,
    });
  }
};

const shareFolders = async (req, res) => {
  const { currentUser } = req;
  const { folder_ids, team_ids } = req.body;

  const teams = await Team.find({
    _id: { $in: team_ids },
    $or: [
      {
        owner: currentUser.id,
      },
      { editors: currentUser.id },
    ],
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || 'Team found err',
    });
  });

  if (!teams) {
    return res.status(400).send({
      status: false,
      error: 'Invalid Permission',
    });
  }

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    let folder;
    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    const query = {
      $addToSet: {
        folders: { $each: folder_ids },
      },
    };

    await Folder.updateOne({ _id: teamFolder._id }, query).catch((err) => {
      console.log('err', err.message);
    });
  }

  Folder.updateMany(
    { _id: { $in: folder_ids } },
    {
      $set: { role: 'team' },
    }
  ).catch((err) => {
    console.log('Error', err);
  });

  Team.updateMany(
    { _id: { $in: teams } },
    {
      $addToSet: { folders: folder_ids },
    }
  )
    .then(async () => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const searchTeam = async (req, res) => {
  const search = req.body.search;
  const { currentUser } = req;
  const skip = req.body.skip || 0;

  /**
  const user_array = await User.find({
    $or: [
      {
        user_name: { $regex: '.*' + search + '.*', $options: 'i' },
        del: false,
      },
      {
        email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
        del: false,
      },
      {
        cell_phone: {
          $regex:
            '.*' +
            search
              .split('')
              .filter((char) => /^[^\(\)\- ]$/.test(char))
              .join('') +
            '.*',
          $options: 'i',
        },
        del: false,
      },
    ],
    _id: { $nin: [currentUser.id] },
  })
    .sort({ user_name: 1 })
    .skip(skip)
    .limit(8)
    .catch((err) => {
      console.log('err', err);
    });
   */

  const team_array = await Team.aggregate([
    {
      $match: {
        ...(search
          ? { name: { $regex: '.*' + search + '.*', $options: 'i' } }
          : {}),
        is_public: true,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'owner',
        foreignField: '_id',
        as: 'owner',
      },
    },
    {
      $match: {
        owner: { $elemMatch: { source: currentUser.source } },
      },
    },
    { $limit: 8 },
    { $skip: skip },
  ]);

  return res.send({
    status: true,
    // user_array,
    team_array,
  });
};

const requestTeam = async (req, res) => {
  const { currentUser } = req;
  const { searchedUser, team_id } = req.body;
  const team = await Team.findById(team_id);
  if (team.owner.indexOf(currentUser._id) !== -1) {
    return res.status(400).send({
      status: false,
      error: 'You are a owner already.',
    });
  }
  if (team.members.indexOf(currentUser._id) !== -1) {
    return res.status(400).send({
      status: false,
      error: 'You are a member already.',
    });
  }
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  const teamUrl =
    currentUser.source === 'vortex' ? urls.VORTEX_TEAM_URL : urls.TEAM_URL;
  let owners;
  if (searchedUser && team.editors.indexOf(searchedUser) !== -1) {
    const editor = await User.findOne({ _id: searchedUser });
    owners = [editor];
  } else if (searchedUser && team.owner.indexOf(searchedUser) !== -1) {
    const owner = await User.findOne({ _id: searchedUser });
    owners = [owner];
  } else {
    const owner = await User.find({ _id: { $in: team.owner } });
    owners = owner;
  }
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i];

    const time_zone = getUserTimezone(owner);

    const data = {
      template_data: {
        owner_name: owner.user_name,
        user_name: currentUser.user_name,
        created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
        team_name: team.name,
        team_url: teamUrl + team.id,
        accept_url: `${teamUrl}${team.id}/request?join=accept&user=${currentUser.id}`,
        decline_url: `${teamUrl}${team.id}/request?join=decline&user=${currentUser.id}`,
      },
      template_name: prefix + 'TeamRequest',
      required_reply: false,
      email: owner.email,
      source: currentUser.source,
    };

    sendNotificationEmail(data);

    const team_url = `<a href="${teamUrl}">${team.name}</a>`;
    const notification = new Notification({
      creator: currentUser._id,
      team: team.id,
      user: owner.id,
      criteria: 'team_requested',
      content: `${currentUser.user_name} has requested to join your ${team_url} in CRMGrow`,
    });
    notification.save().catch((err) => {
      console.log('notification save err', err.message);
    });
  }

  if (team.requests.indexOf(currentUser._id) === -1) {
    team.requests.push(currentUser._id);
    team.save().catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
  }
  return res.send({
    status: true,
  });
};

const remove = async (req, res) => {
  const team = await Team.findOne({ _id: req.params.id }).catch((err) => {
    console.log('team found error', err.message);
  });

  if (team.videos && team.videos.length > 0) {
    Video.updateMany(
      {
        _id: {
          $in: team.videos,
        },
        role: 'team',
      },
      { $unset: { role: true } }
    );
  }

  if (team.pdfs && team.pdfs.length > 0) {
    PDF.updateMany(
      {
        _id: { $in: team.pdfs },
        role: 'team',
      },
      { $unset: { role: true } }
    );
  }

  if (team.images && team.images.length > 0) {
    Image.updateMany(
      {
        _id: { $in: team.images },
        role: 'team',
      },
      { $unset: { role: true } }
    );
  }

  if (team.email_templates && team.email_templates.length > 0) {
    EmailTemplate.updateMany(
      {
        _id: { $in: team.email_templates },
        role: 'team',
      },
      { $unset: { role: true } }
    );
  }

  if (team.automations && team.automations.length > 0) {
    Automation.updateMany(
      {
        _id: { $in: team.automations },
        role: 'team',
      },
      { $unset: { role: true } }
    );
  }

  await Contact.updateMany(
    {
      shared_team: req.params.id,
    },
    {
      $unset: {
        shared_members: true,
        shared_team: true,
      },
    }
  ).catch((err) => {
    console.log('contact update team member remove err', err.message);
  });

  Team.deleteOne({
    _id: req.params.id,
  })
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
};

/**
 * Load the shared teams of data
 * @param {*} req: {body: {type: material type ('video' | 'pdfs' | 'images' ), id: material id}}
 * @param {*} res
 */
const loadSharedTeams = async (req, res) => {
  const { currentUser } = req;
  const { type, id } = req.body;

  const findQuery = { [type]: id };
  Team.find(findQuery)
    .select({ title: true, _id: true })
    .then((_teams) => {
      return res.send({
        status: true,
        data: _teams,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || err,
      });
    });
};

/**
 * Stop share the material from team
 * @param {*} req: {body: {type: material type ('video' | 'pdfs' | 'images' | 'email_templates' | 'automations'), id: material id, teams: team id array}}
 * @param {*} res
 */
const stopShare = async (req, res) => {
  const { currentUser } = req;
  const { type, id, teams } = req.body;

  const pullQuery = { [type]: mongoose.Types.ObjectId(id) };
  const findQuery = { [type]: mongoose.Types.ObjectId(id) };
  Team.updateMany(
    {
      _id: { $in: teams },
    },
    { $pull: pullQuery }
  )
    .then(async () => {
      const sharedTeamCount = await Team.countDocuments(findQuery);
      if (!sharedTeamCount) {
        if (type === 'videos') {
          await Video.updateOne(
            {
              _id: id,
            },
            { $unset: { role: true } }
          );
        } else if (type === 'pdfs') {
          await PDF.updateOne(
            {
              _id: id,
            },
            { $unset: { role: true } }
          );
        } else if (type === 'images') {
          await Image.updateOne(
            {
              _id: id,
            },
            { $unset: { role: true } }
          );
        } else if (type === 'folders') {
          await Folder.updateOne(
            {
              _id: id,
            },
            { $unset: { role: true } }
          );
        } else if (type === 'email_templates') {
          await EmailTemplate.updateOne(
            {
              _id: id,
            },
            { $unset: { role: true } }
          );
        } else if (type === 'automations') {
          await Automation.updateOne(
            {
              _id: id,
            },
            { $unset: { role: true } }
          );
        }
      }
      await Folder.updateMany(
        {
          team: { $in: teams },
        },
        { $pull: pullQuery }
      );

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || err,
      });
    });
};

/**
 * Stop share the material from team
 * @param {*} req: {body: {type: material type ('videos' | 'pdfs' | 'images' | 'email_templates' | 'automations'), ids: material id array, teams: team id array}}
 * @param {*} res
 */
const stopShares = async (req, res) => {
  const { currentUser } = req;
  const { type, ids, teams } = req.body;

  const pullQuery = { [type]: { $in: ids } };
  const findQuery = { [type]: { $in: ids } };
  Team.updateMany(
    {
      _id: { $in: teams },
    },
    { $pull: pullQuery }
  )
    .then(async () => {
      const sharedTeamCount = await Team.countDocuments(findQuery);
      if (!sharedTeamCount) {
        if (type === 'videos') {
          await Video.updateMany(
            {
              _id: { $in: ids },
            },
            { $unset: { role: true } }
          );
        } else if (type === 'pdfs') {
          await PDF.updateMany(
            {
              _id: { $in: ids },
            },
            { $unset: { role: true } }
          );
        } else if (type === 'images') {
          await Image.updateMany(
            {
              _id: { $in: ids },
            },
            { $unset: { role: true } }
          );
        } else if (type === 'folders') {
          await Folder.updateMany(
            {
              _id: { $in: ids },
            },
            { $unset: { role: true } }
          );
        } else if (type === 'email_templates') {
          await EmailTemplate.updateMany(
            {
              _id: { $in: ids },
            },
            { $unset: { role: true } }
          );
        } else if (type === 'automations') {
          await Automation.updateMany(
            {
              _id: { $in: ids },
            },
            { $unset: { role: true } }
          );
        }
      }

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message || err,
      });
    });
};

const removeVideos = async (req, res) => {
  const { currentUser } = req;
  const video = await Video.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!video) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission',
    });
  }

  const teams = await Team.find({
    videos: req.params.id,
    $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  }).catch((err) => {
    console.log('team finding error', err);
  });

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (teamFolder) {
      await Folder.updateOne(
        { _id: teamFolder._id },
        {
          $pull: { videos: mongoose.Types.ObjectId(req.params.id) },
        }
      );
    }
    Team.updateOne(
      { videos: req.params.id },
      {
        $pull: { videos: mongoose.Types.ObjectId(req.params.id) },
      }
    ).catch((err) => {
      console.log('team remove video error', err.message);
    });

    /**
     * Create Notifications
     */
    const action = {
      object: 'video',
      video: [req.params.id],
    };
    createNotificationTeamMember(
      [team],
      currentUser,
      'stop_share_material',
      action
    );
  }

  Video.updateOne(
    {
      _id: req.params.id,
      role: 'team',
    },
    { $unset: { role: true } }
  ).catch((err) => {
    console.log('err', err.message);
  });

  return res.send({
    status: true,
  });
};

const removePdfs = async (req, res) => {
  const { currentUser } = req;
  const pdf = await PDF.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!pdf) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission',
    });
  }

  const teams = await Team.find({
    pdfs: req.params.id,
    $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  }).catch((err) => {
    console.log('team finding error', err);
  });

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (teamFolder) {
      await Folder.updateOne(
        { _id: teamFolder._id },
        {
          $pull: { pdfs: mongoose.Types.ObjectId(req.params.id) },
        }
      );
    }

    Team.updateOne(
      { pdfs: req.params.id },
      {
        $pull: { pdfs: mongoose.Types.ObjectId(req.params.id) },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });

    /**
     * Create Notifications
     */
    const action = {
      object: 'pdf',
      pdf: [req.params.id],
    };
    createNotificationTeamMember(
      [team],
      currentUser,
      'stop_share_material',
      action
    );
  }

  PDF.updateOne(
    {
      _id: req.params.id,
      role: 'team',
    },
    { $unset: { role: true } }
  ).catch((err) => {
    console.log('err', err.message);
  });

  return res.send({
    status: true,
  });
};

const removeImages = async (req, res) => {
  const { currentUser } = req;
  const image = await Image.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!image) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission',
    });
  }

  const teams = await Team.find({
    images: req.params.id,
    $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  }).catch((err) => {
    console.log('team finding error', err);
  });

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (teamFolder) {
      await Folder.updateOne(
        { _id: teamFolder._id },
        {
          $pull: { images: mongoose.Types.ObjectId(req.params.id) },
        }
      );
    }

    Team.updateOne(
      { images: req.params.id },
      {
        $pull: { images: mongoose.Types.ObjectId(req.params.id) },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });

    /**
     * Create Notifications
     */
    const action = {
      object: 'image',
      image: [req.params.id],
    };
    createNotificationTeamMember(
      [team],
      currentUser,
      'stop_share_material',
      action
    );
  }

  Image.updateOne(
    {
      _id: req.params.id,
      role: 'team',
    },
    { $unset: { role: true } }
  ).catch((err) => {
    console.log('err', err.message);
  });

  return res.send({
    status: true,
  });
};

const removeFolders = async (req, res) => {
  const { currentUser } = req;
  const team_id = req.params.id;
  const folder = req.body.folder_id;
  const _folder = await Folder.findOne({
    _id: folder,
    user: currentUser.id,
  });

  if (!_folder) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission',
    });
  }

  const team = await Team.findOne({ _id: team_id }).catch((err) => {
    console.log('team finding error', err);
  });

  Team.updateOne(
    { _id: mongoose.Types.ObjectId(team_id) },
    {
      $pull: { folders: mongoose.Types.ObjectId(folder) },
    }
  )
    .then(async () => {
      /**
       * Remove folder from team folder
       */
      await Folder.updateOne(
        { team: team_id },
        {
          $pull: { folders: mongoose.Types.ObjectId(folder) },
        }
      );
    })
    .catch((err) => {
      console.log('err', err.message);
    });

  /**
   * Create Notifications
   */
  const action = {
    object: 'folder',
    folder: [folder],
  };
  createNotificationTeamMember(
    [team],
    currentUser,
    'stop_share_material',
    action
  );

  return res.send({
    status: true,
  });
};

const removeAutomations = async (req, res) => {
  const { currentUser } = req;
  const automation = await Automation.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!automation) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission',
    });
  }

  const team = await Team.findOne({ automations: req.params.id }).catch(
    (err) => {
      console.log('team finding error', err);
    }
  );

  Team.updateOne(
    { automations: req.params.id },
    {
      $pull: { automations: mongoose.Types.ObjectId(req.params.id) },
    }
  ).catch((err) => {
    console.log('err', err.message);
  });

  Automation.updateOne(
    {
      _id: req.params.id,
      role: 'team',
    },
    { $unset: { role: true } }
  ).catch((err) => {
    console.log('err', err.message);
  });

  /**
   * Create Notifications
   */
  const action = {
    object: 'automation',
    automation: [req.params.id],
  };
  createNotificationTeamMember(
    [team],
    currentUser,
    'stop_share_automation',
    action
  );

  return res.send({
    status: true,
  });
};

const removeEmailTemplates = async (req, res) => {
  const { currentUser } = req;
  const email_template = await EmailTemplate.findOne({
    _id: req.params.id,
    user: currentUser.id,
  });

  if (!email_template) {
    return res.status(400).send({
      status: false,
      error: 'Invalid permission',
    });
  }

  const team = await Team.findOne({ email_templates: req.params.id }).catch(
    (err) => {
      console.log('team finding error', err);
    }
  );

  Team.updateOne(
    { email_templates: req.params.id },
    {
      $pull: { email_templates: mongoose.Types.ObjectId(req.params.id) },
    }
  ).catch((err) => {
    console.log('err', err.message);
  });

  EmailTemplate.updateOne(
    {
      _id: req.params.id,
      role: 'team',
    },
    { $unset: { role: true } }
  ).catch((err) => {
    console.log('err', err.message);
  });

  /**
   * Create Notifications
   */
  const action = {
    object: 'template',
    template: [req.params.id],
  };
  createNotificationTeamMember(
    [team],
    currentUser,
    'stop_share_template',
    action
  );

  return res.send({
    status: true,
  });
};

const unshareFolders = async (req, res) => {
  const { currentUser } = req;
  const folders = req.body.folders || [];
  const type = req.body.type;

  const teams = await Team.find({
    folders: { $elemMatch: { $in: folders } },
    $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  }).catch((err) => {
    console.log('team finding error', err);
  });

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (teamFolder) {
      await Folder.updateOne(
        { _id: teamFolder._id },
        {
          $pull: { folders: { $in: folders } },
        }
      );
    }
  }

  Team.updateMany(
    { folders: { $elemMatch: { $in: folders } } },
    { $pull: { folders: { $in: folders } } }
  ).then(() => {
    Folder.updateMany(
      { _id: { $in: folders } },
      { $unset: { role: true } }
    ).then(() => {
      console.log('updated role');
    });
    return res.send({
      status: true,
    });
  });
};

const unshareTemplates = async (req, res) => {
  const { currentUser } = req;
  const templates = req.body.templates || [];

  const teams = await Team.find({
    email_templates: { $elemMatch: { $in: templates } },
    $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  }).catch((err) => {
    console.log('team finding error', err);
  });

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (teamFolder) {
      await Folder.updateOne(
        { _id: teamFolder._id },
        {
          $pull: { templates: { $in: templates } },
        }
      );
    }
  }

  Team.updateMany(
    { email_templates: { $elemMatch: { $in: templates } } },
    { $pull: { email_templates: { $in: templates } } }
  ).then(() => {
    EmailTemplate.updateMany(
      { _id: { $in: templates } },
      { $unset: { role: true } }
    ).then(() => {
      console.log('updated role');
    });
    return res.send({
      status: true,
    });
  });
};

const unshareAutomations = async (req, res) => {
  const { currentUser } = req;
  const automations = req.body.automations || [];
  const teams = await Team.find({
    automations: { $elemMatch: { $in: automations } },
    $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  }).catch((err) => {
    console.log('team finding error', err);
  });

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];

    const teamFolder = await Folder.findOne({
      team: team._id,
      role: 'team',
      del: false,
    });

    if (teamFolder) {
      await Folder.updateOne(
        { _id: teamFolder._id },
        {
          $pull: { automations: { $in: automations } },
        }
      );
    }
  }
  Team.updateMany(
    { automations: { $elemMatch: { $in: automations } } },
    { $pull: { automations: { $in: automations } } }
  ).then(() => {
    Automation.updateMany(
      { _id: { $in: automations } },
      { $unset: { role: true } }
    ).then(() => {
      console.log('updated role');
    });
    return res.send({
      status: true,
    });
  });
};

const unshareMaterials = (req, res) => {
  const materials = req.body.materials || [];
  const material_type = req.body.type || 'videos';

  Team.updateMany(
    { [material_type]: { $elemMatch: { $in: materials } } },
    { $pull: { [material_type]: { $in: materials } } }
  ).then(() => {
    if (material_type === 'videos') {
      Video.updateMany(
        { _id: { $in: materials } },
        { $unset: { role: true } }
      ).then(() => {
        console.log('updated role');
      });
    } else if (material_type === 'pdfs') {
      PDF.updateMany(
        { _id: { $in: materials } },
        { $unset: { role: true } }
      ).then(() => {
        console.log('updated role');
      });
    } else if (material_type === 'images') {
      Image.updateMany(
        { _id: { $in: materials } },
        { $unset: { role: true } }
      ).then(() => {
        console.log('updated role');
      });
    }
    return res.send({
      status: true,
    });
  });
};

const updateTeam = async (req, res) => {
  const { team_id, data } = req.body;
  const members = [...data.members, ...data.editors];
  Team.updateOne({ _id: team_id }, { $set: data })
    .then(async () => {
      // Update contact shared with this team
      await Contact.updateMany(
        {
          shared_team: [team_id],
        },
        {
          $set: {
            shared_members: members,
          },
        }
      ).catch((err) => {
        console.log('Update contacts', err.message);
      });
      res.send({ status: true });
    })
    .catch((err) => {
      res.status(500).send({ status: false, error: err.message });
    });
};

const getLeaders = (req, res) => {
  const { currentUser } = req;
  Team.find({
    $or: [
      {
        members: currentUser.id,
      },
      { owner: currentUser.id },
    ],
  })
    .populate([
      {
        path: 'owner',
        select: {
          _id: 1,
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
        },
      },
      {
        path: 'editors',
        select: {
          _id: 1,
          user_name: 1,
          picture_profile: 1,
          email: 1,
          phone: 1,
        },
      },
    ])
    .then((data) => {
      let users = [];
      data.forEach((e) => {
        if (users.length) {
          users = [...users, ...e.editors, ...e.owner];
        } else {
          users = [...e.editors, ...e.owner];
        }
      });
      return res.send({
        status: true,
        data: users,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const getSharedContacts = async (req, res) => {
  const { currentUser } = req;
  const count = req.body.count || 50;
  const skip = req.body.skip || 0;
  const sort = req.body.sort || { first_name: 1 };
  const total = await Contact.countDocuments({
    $or: [
      {
        user: currentUser.id,
        shared_team: req.body.team,
      },
      {
        shared_members: currentUser.id,
        shared_team: req.body.team,
      },
    ],
  });

  const contacts = await Contact.find({
    $or: [
      {
        shared_members: currentUser.id,
        shared_team: req.body.team,
      },
      {
        user: currentUser.id,
        shared_team: req.body.team,
      },
    ],
  })
    .populate([
      {
        path: 'user',
        select:
          'user_name email picture_profile phone location time_zone_info company',
      },
      {
        path: 'last_activity',
      },
      {
        path: 'shared_members',
        select:
          'user_name email picture_profile phone location time_zone_info company',
      },
    ])
    .skip(skip)
    .limit(count)
    .collation({ locale: 'en' })
    .sort(sort)
    .catch((err) => {
      console.log('get shared contact', err.message);
    });

  return res.send({
    status: true,
    data: {
      count: total,
      contacts,
    },
  });
};

const searchContact = async (req, res) => {
  const { currentUser } = req;

  const searchStr = req.body.search;
  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const phoneSearch = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
  let contacts = [];

  const { share_by, share_with, team } = req.body;
  const teamQuery = [];
  if (
    (share_by && share_by.flag !== -1) ||
    (share_with && share_with.flag !== -1)
  ) {
    const shareWithQuery = {};
    const shareByQuery = {};
    if (share_with.flag !== -1) {
      shareWithQuery['user'] = currentUser._id;
      shareWithQuery['shared_team'] = [team];
      if (share_with.members && share_with.members.length) {
        shareWithQuery['shared_members'] = share_with.members;
      }
      teamQuery.push(shareWithQuery);
    }
    if (share_by.flag !== -1) {
      shareByQuery['user'] = currentUser._id;
      shareByQuery['shared_team'] = [team];
      if (share_by.members && share_by.members.length) {
        shareByQuery['user'] = { $in: share_by.members };
      }
      teamQuery.push(shareByQuery);
    }
  }

  var stringSearchQuery;
  if (search) {
    if (search.split(' ').length > 1) {
      stringSearchQuery = {
        $or: [
          {
            first_name: { $regex: search.split(' ')[0], $options: 'i' },
            last_name: { $regex: search.split(' ')[1], $options: 'i' },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            first_name: { $regex: search.split(' ')[0], $options: 'i' },
            last_name: { $regex: search.split(' ')[1], $options: 'i' },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
          {
            first_name: { $regex: search, $options: 'i' },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            first_name: { $regex: search, $options: 'i' },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
          {
            last_name: { $regex: search, $options: 'i' },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            last_name: { $regex: search, $options: 'i' },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
          {
            cell_phone: {
              $regex: '.*' + phoneSearch + '.*',
              $options: 'i',
            },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            cell_phone: {
              $regex: '.*' + phoneSearch + '.*',
              $options: 'i',
            },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
        ],
      };
    } else {
      stringSearchQuery = {
        $or: [
          {
            first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
          {
            email: {
              $regex: '.*' + search.split(' ')[0] + '.*',
              $options: 'i',
            },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            email: {
              $regex: '.*' + search.split(' ')[0] + '.*',
              $options: 'i',
            },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
          {
            last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
          {
            cell_phone: {
              $regex: '.*' + phoneSearch + '.*',
              $options: 'i',
            },
            user: currentUser.id,
            shared_team: req.body.team,
          },
          {
            cell_phone: {
              $regex: '.*' + phoneSearch + '.*',
              $options: 'i',
            },
            shared_members: currentUser.id,
            shared_team: req.body.team,
          },
        ],
      };
    }
  }

  var query;
  if (teamQuery.length && stringSearchQuery) {
    query = {
      $and: [{ $or: teamQuery }, stringSearchQuery],
    };
  } else if (teamQuery.length && !stringSearchQuery) {
    query = { $or: teamQuery };
  } else if (!teamQuery.length && stringSearchQuery) {
    query = stringSearchQuery;
  }

  contacts = await Contact.find(query)
    .populate([
      {
        path: 'user',
        select: 'user_name email picture_profile phone',
      },
      {
        path: 'last_activity',
      },
      {
        path: 'shared_members',
        select: 'user_name email picture_profile phone',
      },
    ])
    .sort({ first_name: 1 });

  return res.send({
    status: true,
    data: {
      contacts,
      search,
    },
  });
};

const loadMaterial = async (req, res) => {
  const { currentUser } = req;
  const { folder, teamId } = req.body;
  let { search } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  let root_folder;
  let prevId = '';
  const folder_data = [];
  const video_data = [];
  const pdf_data = [];
  const image_data = [];

  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      team: teamId,
      role: 'team',
      del: { $ne: true },
    });
  } else {
    root_folder = await Folder.findById(folder);
    const prev_folder = await Folder.findOne({
      folders: { $in: root_folder.id },
    });
    if (
      prev_folder &&
      !prev_folder.rootFolder &&
      prev_folder.role !== 'team' &&
      !prev_folder.team
    ) {
      prevId = prev_folder.id;
    }
  }

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

  if (search) {
    const videos = await Video.find(video_query);
    const pdfs = await PDF.find(pdf_query);
    const images = await Image.find(image_query);
    const folders = await getAllFolders(
      'material',
      root_folder.folders,
      root_folder.folders
    );
    Array.prototype.push.apply(video_data, videos);
    Array.prototype.push.apply(pdf_data, pdfs);
    Array.prototype.push.apply(image_data, images);
    Array.prototype.push.apply(folder_data, folders);

    let videoIds = root_folder.videos;
    let pdfIds = root_folder.pdfs;
    let imageIds = root_folder.images;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_data.length; i++) {
      videoIds = [...videoIds, ...folder_data[i].videos];
      pdfIds = [...pdfIds, ...folder_data[i].pdfs];
      imageIds = [...imageIds, ...folder_data[i].images];
      folderIds = [...folderIds, ...folder_data[i].folders];
    }
    video_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    video_query['_id'] = { $in: videoIds };
    pdf_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    pdf_query['_id'] = { $in: pdfIds };
    image_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    image_query['_id'] = { $in: imageIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
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

  const _folder_detail_list = [];
  const _video_detail_list = [];
  const _pdf_detail_list = [];
  const _image_detail_list = [];

  const materialOwnerIds = [];
  video_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  pdf_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  image_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });
  folder_list.forEach((e) => {
    materialOwnerIds.push(e.user);
  });

  const _material_owners = await User.find({
    _id: { $in: materialOwnerIds },
  }).select('_id user_name');
  const _material_owner_objects = {};
  _material_owners.forEach((e) => {
    _material_owner_objects[e._id] = e;
  });

  const videoIds = video_list.map((_video) => _video._id);
  const videoTrackerInfo = await VideoTracker.aggregate([
    { $match: { video: { $in: videoIds }, user: currentUser._id } },
    { $group: { _id: '$video', count: { $sum: 1 } } },
  ]);
  const videoTrackerCounts = {};
  videoTrackerInfo.forEach((e) => {
    videoTrackerCounts[e._id] = e.count;
  });
  const videosInfo = await Video.aggregate([
    { $match: { original_id: { $in: videoIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const videoDownloadCount = {};
  videosInfo.forEach((e) => {
    videoDownloadCount[e._id] = e.count;
  });

  const pdfIds = pdf_list.map((_pdf) => _pdf._id);
  const pdfTrackerInfo = await PDFTracker.aggregate([
    { $match: { pdf: { $in: pdfIds }, user: currentUser._id } },
    { $group: { _id: '$pdf', count: { $sum: 1 } } },
  ]);
  const pdfTrackerCounts = {};
  pdfTrackerInfo.forEach((e) => {
    pdfTrackerCounts[e._id] = e.count;
  });
  const pdfsInfo = await PDF.aggregate([
    { $match: { original_id: { $in: pdfIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const pdfDownloadCount = {};
  pdfsInfo.forEach((e) => {
    pdfDownloadCount[e._id] = e.count;
  });

  const imageIds = image_list.map((_image) => _image._id);
  const imageTrackerInfo = await ImageTracker.aggregate([
    { $match: { image: { $in: imageIds }, user: currentUser._id } },
    { $group: { _id: '$image', count: { $sum: 1 } } },
  ]);
  const imageTrackerCounts = {};
  imageTrackerInfo.forEach((e) => {
    imageTrackerCounts[e._id] = e.count;
  });
  const imagesInfo = await Image.aggregate([
    { $match: { original_id: { $in: imageIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const imageDownloadCount = {};
  imagesInfo.forEach((e) => {
    imageDownloadCount[e._id] = e.count;
  });

  for (let i = 0; i < folder_list.length; i++) {
    const myJSON = JSON.stringify(folder_list[i]);
    const _folder = JSON.parse(myJSON);
    const folder = await Object.assign(_folder, {
      material_type: 'folder',
      item_type: 'folder',
      owner: _material_owner_objects[_folder.user],
    });
    _folder_detail_list.push(folder);
  }

  for (let i = 0; i < video_list.length; i++) {
    let video_detail = video_list[i]._doc || video_list[i];
    video_detail = {
      ...video_detail,
      views: videoTrackerCounts[video_detail._id] || 0,
      material_type: 'video',
      item_type: 'video',
      downloads: videoDownloadCount[video_detail._id] || 0,
      owner: _material_owner_objects[video_detail.user],
    };

    _video_detail_list.push(video_detail);
  }

  for (let i = 0; i < pdf_list.length; i++) {
    let pdf_detail = pdf_list[i]._doc || pdf_list[i];
    pdf_detail = {
      ...pdf_detail,
      views: pdfTrackerCounts[pdf_detail._id] || 0,
      material_type: 'pdf',
      item_type: 'pdf',
      downloads: pdfDownloadCount[pdf_detail._id] || 0,
      owner: _material_owner_objects[pdf_detail.user],
    };

    _pdf_detail_list.push(pdf_detail);
  }

  for (let i = 0; i < image_list.length; i++) {
    let image_detail = image_list[i]._doc || image_list[i];
    image_detail = {
      ...image_detail,
      views: imageTrackerCounts[image_detail._id] || 0,
      material_type: 'image',
      item_type: 'image',
      downloads: imageDownloadCount[image_detail._id] || 0,
      owner: _material_owner_objects[image_detail.user],
    };

    _image_detail_list.push(image_detail);
  }

  return res.send({
    status: true,
    data: {
      results: [
        ..._video_detail_list,
        ..._pdf_detail_list,
        ..._image_detail_list,
        ..._folder_detail_list,
      ],
      prevFolder: prevId,
    },
  });
};

const loadAutomation = async (req, res) => {
  const { currentUser } = req;
  const { folder, teamId } = req.body;
  let { search } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  let root_folder;
  let prevId = '';
  const folder_data = [];
  const automation_data = [];

  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      team: teamId,
      role: 'team',
      del: { $ne: true },
    });
  } else {
    root_folder = await Folder.findById(folder);
    const prev_folder = await Folder.findOne({
      folders: { $in: root_folder.id },
    });
    if (
      prev_folder &&
      !prev_folder.rootFolder &&
      prev_folder.role !== 'team' &&
      !prev_folder.team
    ) {
      prevId = prev_folder.id;
    }
  }

  const automation_query = {
    _id: { $in: root_folder.automations },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'automation',
    del: { $ne: true },
  };

  if (search) {
    const automations = await Automation.find(automation_query);
    const folders = await getAllFolders(
      'automation',
      root_folder.folders,
      root_folder.folders
    );
    Array.prototype.push.apply(automation_data, automations);
    Array.prototype.push.apply(folder_data, folders);

    let automationIds = root_folder.automations;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_data.length; i++) {
      automationIds = [...automationIds, ...folder_data[i].automations];
      folderIds = [...folderIds, ...folder_data[i].folders];
    }
    automation_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    automation_query['_id'] = { $in: automationIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
  const automations_list = await Automation.find(automation_query)
    .select('-automations')
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const automationIds = automations_list.map((_automation) => _automation._id);
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
  automations_list.forEach((e) => {
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
    };
  });

  const automation_detail_list = [];
  for (let i = 0; i < automations_list.length; i++) {
    let automation_detail = automations_list[i]._doc || automations_list[i];
    automation_detail = {
      ...automation_detail,
      item_type: automation_detail.type,
      downloads: automationDownloadCount[automation_detail._id] || 0,
      owner: _automation_owner_objects[automation_detail.user],
    };
    automation_detail_list.push(automation_detail);
  }

  return res.send({
    status: true,
    data: {
      results: [...automation_detail_list, ..._folders],
      prevFolder: prevId,
    },
  });
};

const loadTemplate = async (req, res) => {
  const { currentUser } = req;
  const { folder, teamId } = req.body;
  let { search } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }

  let root_folder;
  let prevId = '';
  const folder_data = [];
  const template_data = [];

  if (!folder || folder === 'root') {
    root_folder = await Folder.findOne({
      team: teamId,
      role: 'team',
      del: { $ne: true },
    });
  } else {
    root_folder = await Folder.findById(folder);
    const prev_folder = await Folder.findOne({
      folders: { $in: root_folder.id },
    });
    if (
      prev_folder &&
      !prev_folder.rootFolder &&
      prev_folder.role !== 'team' &&
      !prev_folder.team
    ) {
      prevId = prev_folder.id;
    }
  }

  const template_query = {
    _id: { $in: root_folder.templates },
    del: { $ne: true },
  };
  const folder_query = {
    _id: { $in: root_folder.folders },
    type: 'template',
    del: { $ne: true },
  };

  if (search) {
    const templates = await EmailTemplate.find(template_query);
    const folders = await getAllFolders(
      'template',
      root_folder.folders,
      root_folder.folders
    );
    Array.prototype.push.apply(template_data, templates);
    Array.prototype.push.apply(folder_data, folders);

    let templateIds = root_folder.templates;
    let folderIds = root_folder.folders;
    for (let i = 0; i < folder_data.length; i++) {
      templateIds = [...templateIds, ...folder_data[i].templates];
      folderIds = [...folderIds, ...folder_data[i].folders];
    }
    template_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    template_query['_id'] = { $in: templateIds };
    folder_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    folder_query['_id'] = { $in: folderIds };
  }
  const template_list = await EmailTemplate.find(template_query)
    .select('-content')
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const folder_list = await Folder.find(folder_query)
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  const templateIds = template_list.map((_template) => _template._id);
  const templatesInfo = await EmailTemplate.aggregate([
    { $match: { original_id: { $in: templateIds }, del: false } },
    { $group: { _id: '$original_id', count: { $sum: 1 } } },
  ]);
  const templateDownloadCount = {};
  templatesInfo.forEach((e) => {
    templateDownloadCount[e._id] = e.count;
  });

  const templateOwnerIds = [];
  folder_list.forEach((e) => {
    templateOwnerIds.push(e.user);
  });
  template_list.forEach((e) => {
    templateOwnerIds.push(e.user);
  });
  const _template_owners = await User.find({
    _id: { $in: templateOwnerIds },
  }).select('_id user_name');
  const _template_owner_objects = {};
  _template_owners.forEach((e) => {
    _template_owner_objects[e._id] = e;
  });

  const folders = (folder_list || []).map((e) => {
    return {
      ...e._doc,
      isFolder: true,
      item_type: 'folder',
      owner: _template_owner_objects[e.user],
    };
  });

  const template_detail_list = [];
  for (let i = 0; i < template_list.length; i++) {
    let template_detail = template_list[i]._doc || template_list[i];
    template_detail = {
      ...template_detail,
      item_type: template_detail.type,
      downloads: templateDownloadCount[template_detail._id] || 0,
      owner: _template_owner_objects[template_detail.user],
    };
    template_detail_list.push(template_detail);
  }
  const templates = [...template_detail_list, ...folders];

  return res.send({
    status: true,
    data: {
      results: templates,
      prevFolder: prevId,
    },
  });
};

const loadPipeline = async (req, res) => {
  const { currentUser } = req;
  const { folder, teamId } = req.body;
  let { search } = req.body;
  if (!search) {
    search = '';
  } else {
    search = search.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  }
  const team = await Team.findOne({ _id: teamId }).catch((err) => {
    console.log('team find err', err.message);
  });
  if (team) {
    const pipelineIds = team.pipelines;
    const pipeline_query = {
      _id: { $in: pipelineIds },
    };
    if (search) {
      pipeline_query['title'] = { $regex: `.*${search}.*`, $options: 'i' };
    }
    const pipeline_list = await Pipeline.find(pipeline_query).sort({
      created_at: 1,
    });

    // Get owner
    const pipelineOwnerIds = [];
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

    // Download count
    const pipelinesInfo = await Pipeline.aggregate([
      { $match: { original_id: { $in: pipelineIds } } },
      { $group: { _id: '$original_id', count: { $sum: 1 } } },
    ]);
    const pipelineDownloadCount = {};
    pipelinesInfo.forEach((e) => {
      pipelineDownloadCount[e._id] = e.count;
    });

    const pipeline_detail_list = [];
    for (let i = 0; i < pipeline_list.length; i++) {
      let pipeline_detail = pipeline_list[i]._doc || pipeline_list[i];
      pipeline_detail = {
        ...pipeline_detail,
        item_type: 'pipeline',
        downloads: pipelineDownloadCount[pipeline_detail._id] || 0,
        owner: _pipeline_owner_objects[pipeline_detail.user],
      };
      pipeline_detail_list.push(pipeline_detail);
    }
    const pipelines = [...pipeline_detail_list];
    return res.send({
      status: true,
      data: {
        results: pipelines,
      },
    });
  } else {
    return res.send({
      status: false,
    });
  }
};

const getAllSharedContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    $or: [
      {
        shared_members: currentUser.id,
        shared_team: req.body.team,
      },
      {
        user: currentUser.id,
        shared_team: req.body.team,
      },
    ],
  }).select({
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    phone: 1,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const getFolderItems = async (folders, folderIds, type, isFiltered = false) => {
  let folderItems = [];
  while (folders.length > 0) {
    const filteredFolders = !isFiltered
      ? folders.filter((item) => folderIds.includes(`${item._id}`))
      : folders;
    for (const item of filteredFolders) {
      isFiltered = true;
      folderItems = [...folderItems, ...(item[`${type}s`] || [])];
    }
    const newFolderIds = filteredFolders.map((e) => e._id);
    const newFolders = await Folder.find({
      _id: { $in: newFolderIds },
      type,
    }).populate('folders');
    folders = [];
    for (const folder of newFolders) {
      folders = [...folders, ...folder.folders];
    }
  }
  return folderItems;
};

const unshareCheckMaterialsV2 = async (req, res) => {
  const { currentUser } = req;
  const { materials, team_ids } = req.body;
  const videos = [];
  const pdfs = [];
  const images = [];
  materials.forEach((e) => {
    if (e.type === 'video') {
      videos.push(e._id);
    } else if (e.type === 'pdf') {
      pdfs.push(e._id);
    } else {
      images.push(e._id);
    }
  });
  const automations = await Automation.find({
    user: currentUser.id,
    $or: [
      {
        'meta.videos': { $elemMatch: { $in: videos } },
      },
      {
        'meta.pdfs': { $elemMatch: { $in: pdfs } },
      },
      {
        'meta.images': { $elemMatch: { $in: images } },
      },
    ],
    clone_assign: { $ne: true },
    role: 'team',
  })
    .select({ _id: 1, title: 1 })
    .catch((err) => {
      console.log('err', err.message);
    });

  const templates = await EmailTemplate.find({
    user: currentUser.id,
    $or: [
      { video_ids: { $in: videos } },
      { pdf_ids: { $in: pdfs } },
      { image_ids: { $in: images } },
    ],
    role: 'team',
  })
    .select({ _id: 1, title: 1 })
    .catch((err) => {
      console.log('err', err.message);
    });
  // {
  //   content: {
  //     $regex: urls.MAIN_DOMAIN + '/video/' + video.id,
  //     $options: 'i',
  //   },
  // },
  const automationIds = automations.map((e) => e._id);
  const templateIds = templates.map((e) => e._id);

  // Team Folders Getting
  const teamFolders = await Folder.find({
    team: { $in: team_ids },
  });
  const teamFolderIds = teamFolders.map((e) => e._id);
  const teamSubFolders = await getAllFolders(
    null,
    teamFolderIds,
    teamFolderIds,
    currentUser._id
  );
  const teamSubFolderIds = teamSubFolders.map((e) => e._id);
  const sharedFolder = await Folder.find({
    _id: { $in: teamSubFolderIds },
    $or: [
      {
        automations: {
          $elemMatch: { $in: automationIds },
        },
      },
      {
        templates: {
          $elemMatch: { $in: templateIds },
        },
      },
    ],
    role: 'team',
  })
    .select({ _id: 1, title: 1 })
    .catch((err) => {
      console.log('err', err.message);
    });

  return res.send({
    status: true,
    data: {
      folders: sharedFolder,
      titles: automations,
      templates,
    },
  });
};

const unshareCheckAutomationsV2 = async (req, res) => {
  const { currentUser } = req;
  const { automations, team_ids } = req.body;
  const folderIds = automations
    .filter((e) => e.type === 'folder')
    .map((e) => e._id);
  const automationIds = automations
    .filter((e) => e.type !== 'folder')
    .map((e) => e._id);

  const allSubFolders = await getAllFolders('automation', folderIds, folderIds);
  let folder_automations = [];
  allSubFolders.forEach((e) => {
    folder_automations = [...folder_automations, ...e.automations];
  });
  const allAutomations = [...automationIds, ...folder_automations];

  // Parent Automations
  const parentAutomations = await Automation.find({
    user: currentUser.id,
    automations: {
      $elemMatch: {
        'action.type': 'automation',
        'action.automation_id': { $in: allAutomations },
      },
    },
    clone_assign: { $ne: true },
  })
    .select({ _id: 1, title: 1 })
    .catch((err) => {
      console.log('err', err.message);
    });

  if (!parentAutomations.length) {
    const { childAutomationIds } = await getAutomationRelated(
      automations,
      team_ids
    );
    const allParentAutomations = await Automation.find({
      user: currentUser.id,
      automations: {
        $elemMatch: {
          'action.type': 'automation',
          'action.automation_id': { $in: childAutomationIds },
        },
      },
      clone_assign: { $ne: true },
      role: 'team',
    });
    const allParentAutomationIds = allParentAutomations.map((e) => e._id);
    const otherParentAutomationIds = allParentAutomationIds.filter(
      (e) =>
        !childAutomationIds.includes(e + '') && !allAutomations.includes(e + '')
    );
    const { childAutomationIds: otherChildAutomationIds } =
      await getAutomationRelated(otherParentAutomationIds, team_ids);
    const stopSharableAutomationIds = childAutomationIds.filter(
      (e) => !otherChildAutomationIds.includes(e)
    );
    if (stopSharableAutomationIds.length) {
      const childAutomations = await Automation.find({
        _id: { $in: stopSharableAutomationIds },
      })
        .select({ _id: 1, title: 1 })
        .catch((err) => {
          console.log('err', err.message);
        });
      return res.send({
        status: true,
        is_root: true,
        data: {
          titles: childAutomations,
        },
      });
    }
  }

  const parentAutomationIds = parentAutomations.map((e) => e._id);

  // check parent automations is shared
  let sharedParentAutomations = parentAutomations;
  const teamObjectIds = team_ids.map((item) => mongoose.Types.ObjectId(item));
  const teamRootFolders = await Folder.aggregate([
    {
      $match: {
        team: { $in: teamObjectIds },
      },
    },
    {
      $group: {
        _id: null,
        folders: { $addToSet: '$folders' },
        automations: { $addToSet: '$automations' },
      },
    },
    {
      $addFields: {
        folders: {
          $reduce: {
            input: '$folders',
            initialValue: [],
            in: { $setUnion: ['$$value', '$$this'] },
          },
        },
      },
    },
    {
      $addFields: {
        automations: {
          $reduce: {
            input: '$automations',
            initialValue: [],
            in: { $setUnion: ['$$value', '$$this'] },
          },
        },
      },
    },
  ]);
  if (teamRootFolders.length > 0) {
    const rootFolders = teamRootFolders[0].folders;
    const allFolders = await getAllFolders(
      'automation',
      rootFolders,
      rootFolders
    );
    const allFolderIds = allFolders.map((item) => item._id);
    const rootAutomations = teamRootFolders[0].automations;
    const folderAutomations = await Folder.aggregate([
      {
        $match: {
          _id: { $in: allFolderIds },
        },
      },
      {
        $group: {
          _id: null,
          automations: { $addToSet: '$automations' },
        },
      },
      {
        $addFields: {
          automations: {
            $reduce: {
              input: '$automations',
              initialValue: [],
              in: { $setUnion: ['$$value', '$$this'] },
            },
          },
        },
      },
    ]);
    let allTeamsAutomations =
      rootAutomations.map((item) => item.toString()) || [];
    if (folderAutomations.length > 0) {
      const folderAutomationIds =
        folderAutomations[0].automations.map((item) => item.toString()) || [];
      allTeamsAutomations = [...allTeamsAutomations, ...folderAutomationIds];
    }
    if (allTeamsAutomations.length > 0) {
      sharedParentAutomations = parentAutomations.filter((item) =>
        allTeamsAutomations.indexOf(item._id.toString())
      );
    }
  }

  // Team Folders Getting
  const teamFolders = await Folder.find({
    team: { $in: team_ids },
  });
  const teamFolderIds = teamFolders.map((e) => e._id);
  const teamSubFolders = await getAllFolders(
    null,
    teamFolderIds,
    teamFolderIds,
    currentUser._id
  );
  const teamSubFolderIds = teamSubFolders.map((e) => e._id);
  const sharedFolder = await Folder.find({
    _id: { $in: teamSubFolderIds },
    automations: {
      $elemMatch: { $in: parentAutomationIds },
    },
  });

  return res.send({
    status: true,
    data: {
      folders: sharedFolder,
      titles: sharedParentAutomations,
    },
  });
};

const leaveTeam = async (req, res) => {
  const { currentUser } = req;
  const { teamId, memberId } = req.body;

  const team = await Team.findOne({ _id: teamId }).catch((err) => {
    console.log('team find err', err.message);
  });
  if (team) {
    const automations = [];
    const templates = [];
    const materials = [];
    const folders = [];
    const error_message = [];
    if (team.automations && team.automations.length > 0) {
      const automation_ids = team.automations;
      for (let i = 0; i < automation_ids.length; i++) {
        const automation = await Automation.findOne({
          _id: automation_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('automation find err', err.message);
        });
        if (automation) {
          automations.push(automation);
        }
      }
      if (automations.length > 0) {
        error_message.push({
          reason: 'automations',
          automations,
        });
      }
    }

    if (team.email_templates && team.email_templates.length > 0) {
      const template_ids = team.email_templates;
      for (let i = 0; i < template_ids.length; i++) {
        const template = await EmailTemplate.findOne({
          _id: template_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('template find err', err.message);
        });
        if (template) {
          templates.push(template);
        }
      }
      if (templates.length > 0) {
        error_message.push({
          reason: 'templates',
          templates,
        });
      }
    }

    if (team.pdfs && team.pdfs.length > 0) {
      const pdf_ids = team.pdfs;
      for (let i = 0; i < pdf_ids.length; i++) {
        const pdf = await PDF.findOne({
          _id: pdf_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('pdf find err', err.message);
        });
        if (pdf) {
          materials.push({
            material: pdf,
            type: 'pdf',
          });
        }
      }
    }

    if (team.images && team.images.length > 0) {
      const image_ids = team.images;
      for (let i = 0; i < image_ids.length; i++) {
        const image = await Image.findOne({
          _id: image_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('image find err', err.message);
        });
        if (image) {
          materials.push({
            material: image,
            type: 'image',
          });
        }
      }
    }

    if (team.videos && team.videos.length > 0) {
      const video_ids = team.videos;
      for (let i = 0; i < video_ids.length; i++) {
        const video = await Video.findOne({
          _id: video_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('video find err', err.message);
        });
        if (video) {
          materials.push({
            material: video,
            type: 'video',
          });
        }
      }
    }

    if (materials.length > 0) {
      error_message.push({
        reason: 'materials',
        materials,
      });
    }

    if (team.folders && team.folders.length > 0) {
      const folder_ids = team.folders;
      for (let i = 0; i < folder_ids.length; i++) {
        const folder = await Folder.findOne({
          _id: folder_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('video find err', err.message);
        });
        if (folder) {
          folders.push(folder);
        }
      }
      if (folders.length > 0) {
        error_message.push({
          reason: 'folders',
          folders,
        });
      }
    }

    // Check share contacts for all member
    const contacts = await Contact.find({
      shared_team: [team._id],
      shared_all_member: true,
      user: memberId,
    }).catch((err) => {
      console.log('contact find err', err.message);
    });

    if (contacts.length > 0) {
      error_message.push({
        reason: 'contacts',
        contacts,
      });
    }

    // check share pipeline for team
    const pipelines = [];
    if (team.pipelines && team.pipelines.length > 0) {
      const pipeline_ids = team.pipelines;
      for (let i = 0; i < pipeline_ids.length; i++) {
        const pipeline = await Pipeline.findOne({
          _id: pipeline_ids[i],
          user: memberId,
        }).catch((err) => {
          console.log('pipeline find err', err.message);
        });
        if (pipeline) {
          pipelines.push(pipeline);
        }
      }
      if (pipelines.length > 0) {
        error_message.push({
          reason: 'pipelines',
          pipelines,
        });
      }
    }

    if (error_message.length > 0) {
      return res.json({
        status: true,
        failed: [
          {
            team: {
              id: team.id,
              name: team.name,
              picture: team.picture,
            },
            error_message,
          },
        ],
      });
    } else {
      return res.send({
        status: true,
      });
    }
  }
};

const removeTeamMemberItems = async (req, res) => {
  const { teamId, memberId } = req.body;
  await removeSharedItems(teamId, memberId);
  return res.send({
    status: true,
  });
};

const removeTeamMember = async (req, res) => {
  const { teamId, memberId } = req.body;
  await removeSharedItems(teamId, memberId);
  await Team.updateOne(
    { _id: teamId },
    { $pull: { members: { $in: [memberId] }, editors: { $in: [memberId] } } }
  ).catch(() => {});
  return res.send({
    status: true,
  });
};

/**
 * Share Materials
 * @param {*} req  {team_ids: ID[], materials: [{ids: ID, type: 'videos' | 'pdfs' | 'images' | 'folders'}]}
 * @param {*} res
 */
const shareMaterialsV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, materials } = req.body;
  const errors = [];
  // Find the team list
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});

  // - Extract all pure materials (videos|pdfs|images) from requests
  const videoIds = materials
    .filter((e) => e.type === 'video')
    .map((e) => e._id);
  const pdfIds = materials.filter((e) => e.type === 'pdf').map((e) => e._id);
  const imageIds = materials
    .filter((e) => e.type === 'image')
    .map((e) => e._id);
  // - Getting all folders from requests
  const folderIds = materials
    .filter((e) => e.type === 'folder')
    .map((e) => e._id);

  let sharableVideoIds = [];
  let sharablePdfIds = [];
  let sharableImageIds = [];
  let sharableFolderIds = [];
  if (videoIds.length) {
    const sharableVideos = await Video.find(
      { _id: { $in: videoIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableVideoIds = sharableVideos.map((e) => e._id);
    if (videoIds.length !== sharableVideoIds.length) {
      const unsharableVideos = await Video.find(
        { _id: { $in: videoIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1, thumbnail: 1, preview: 1 }
      );
      unsharableVideos.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'video',
            thumbnail: e.thumbnail,
            preview: e.preview,
          },
        });
      });
    }
  }
  if (pdfIds.length) {
    const sharablePdfs = await PDF.find(
      { _id: { $in: pdfIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharablePdfIds = sharablePdfs.map((e) => e._id);
    if (pdfIds.length !== sharablePdfIds.length) {
      const unsharablePdfs = await PDF.find(
        { _id: { $in: pdfIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1, thumbnail: 1, preview: 1 }
      );
      unsharablePdfs.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'pdf',
            thumbnail: e.thumbnail,
            preview: e.preview,
          },
        });
      });
    }
  }
  if (imageIds.length) {
    const sharableImages = await Image.find(
      { _id: { $in: imageIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableImageIds = sharableImages.map((e) => e._id);
    if (imageIds.length !== sharableImageIds.length) {
      const unsharableImages = await Image.find(
        { _id: { $in: imageIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1, thumbnail: 1, preview: 1 }
      );
      unsharableImages.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'image',
            thumbnail: e.thumbnail,
            preview: e.preview,
          },
        });
      });
    }
  }
  if (folderIds.length) {
    const sharableFolders = await Folder.find(
      { _id: { $in: folderIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableFolderIds = sharableFolders.map((e) => e._id);
    if (folderIds.length !== sharableFolderIds.length) {
      const unsharableFolders = await Folder.find(
        { _id: { $in: folderIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1 }
      );
      unsharableFolders.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'folder',
          },
        });
      });
    }
  }

  if (materials.length === errors.length) {
    return res.send({
      status: true,
      errors,
    });
  }

  // Loop the teams
  // - Team Folder Checking or Create
  const teamFolderIds = [];
  for (let i = 0; i < teams.length; i++) {
    const folder = await findOrCreateTeamFolder(teams[i]);
    teamFolderIds.push(folder._id);
  }

  // - Pure Materials share (shareMaterialHelper)
  // - Folder Add to Team & Team
  const resources = [
    { ids: sharableVideoIds, type: 'videos' },
    { ids: sharablePdfIds, type: 'pdfs' },
    { ids: sharableImageIds, type: 'images' },
    { ids: sharableFolderIds, type: 'folders' },
  ];
  const rootFolderIds = [];
  materials.forEach((e) => {
    if (e.type === 'folder') {
      rootFolderIds.push(e._id);
    }
  });

  await shareResourcesHelper(
    teams,
    teamFolderIds,
    resources,
    currentUser,
    rootFolderIds
  );

  return res.send({
    status: true,
    errors,
  });
};

const unshareMaterialsV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, materials } = req.body;
  // Find the team list
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});

  // - Extract all pure materials (videos|pdfs|images) from requests
  const videoIds = materials
    .filter((e) => e.type === 'video')
    .map((e) => e._id);
  const pdfIds = materials.filter((e) => e.type === 'pdf').map((e) => e._id);
  const imageIds = materials
    .filter((e) => e.type === 'image')
    .map((e) => e._id);
  const folderIds = materials
    .filter((e) => e.type === 'folder')
    .map((e) => e._id);

  // - Team Folder Checking or Create
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }

  // unshare query
  const resources = [
    { ids: videoIds, type: 'videos' },
    { ids: pdfIds, type: 'pdfs' },
    { ids: imageIds, type: 'images' },
    { ids: folderIds, type: 'folders' },
  ];

  await unshareResourcesHelper(team_ids, teamFolderIds, resources, currentUser);

  return res.send({
    status: true,
  });
};

const getTemplateRelated = async (templates, user) => {
  // - Extract all template Ids from requests
  // - Getting Folders from Requests
  const templateIds = [];
  let folderTemplateIds = [];
  const folderIds = [];
  templates.forEach((e) => {
    if (e.type === 'folder') {
      folderIds.push(e._id);
    } else {
      templateIds.push(e._id);
    }
  });
  // - Extract all templates from Folders
  const folders = await getAllFolders('template', folderIds, folderIds);
  folderTemplateIds = [...templateIds];
  folders.forEach((folder) => {
    folderTemplateIds = [...folderTemplateIds, ...folder.templates];
  });
  const templateDocs = await EmailTemplate.find({
    _id: { $in: folderTemplateIds },
    user,
  }).catch(() => {});
  // - Extract all related materials from templates(above step)
  let videoIds = [];
  let pdfIds = [];
  let imageIds = [];
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
  const resources = {
    videoIds,
    pdfIds,
    imageIds,
    templateIds,
    folderIds,
  };

  return resources;
};

const checkShareTemplateV2 = async (req, res) => {
  const { currentUser } = req;
  const { templates } = req.body;
  const { videoIds, imageIds, pdfIds } = await getTemplateRelated(
    templates,
    currentUser._id
  );

  const videos = await Video.find({ _id: { $in: videoIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const images = await Image.find({ _id: { $in: imageIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
    },
  });
};

/**
 *
 * @param {*} req {team_id: ID[], templates: [{id: ID, type: 'template' | 'folder'}]}
 * @param {*} res
 */
const shareTemplatesV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, templates } = req.body;
  const errors = [];

  const templateIds = [];
  const folderIds = [];
  templates.forEach((e) => {
    if (e.type === 'folder') {
      folderIds.push(e._id);
    } else {
      templateIds.push(e._id);
    }
  });
  let sharableFolderIds = [];
  let sharableTemplateIds = [];
  if (templateIds.length) {
    const sharableTemplates = await EmailTemplate.find(
      { _id: { $in: templateIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableTemplateIds = sharableTemplates.map((e) => e._id);
    if (templateIds.length !== sharableTemplateIds.length) {
      const unsharableTemplates = await EmailTemplate.find(
        { _id: { $in: templateIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1 }
      );
      unsharableTemplates.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'tempalte',
          },
        });
      });
    }
  }
  if (folderIds.length) {
    const sharableFolders = await Folder.find(
      { _id: { $in: folderIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableFolderIds = sharableFolders.map((e) => e._id);
    if (folderIds.length !== sharableFolderIds.length) {
      const unsharableFolders = await Folder.find(
        { _id: { $in: folderIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1 }
      );
      unsharableFolders.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'folder',
          },
        });
      });
    }
  }
  const resources = [
    { ids: sharableTemplateIds, type: 'templates' },
    { ids: sharableFolderIds, type: 'folders' },
  ];
  // Find the team list
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  // Loop the teams
  // - Team Folder checking or create
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }

  const rootFolderIds = [];
  templates.forEach((e) => {
    if (e.type === 'folder') {
      rootFolderIds.push(e._id);
    }
  });
  // - Insert the folders to Team & Team Folder
  // - Share the extracted templates to Team & Team Folders
  // - Extracted materials share (shareMaterialsHelper)
  await shareResourcesHelper(
    teams,
    teamFolderIds,
    resources,
    currentUser,
    rootFolderIds
  );
  // TODO: Notification Create

  return res.send({
    status: true,
    errors,
  });
};

const getAutomationRelated = async (automations, user) => {
  // - Getting all automations from requests
  // - Getting all folders from requests
  const automationIds = [];
  let folderAutomationIds = [];
  const folderIds = [];
  automations.forEach((e) => {
    if (e.type === 'folder') {
      folderIds.push(e._id);
    } else {
      automationIds.push(e._id);
    }
  });
  // - Getting from folder automations from folders
  const folders = await getAllFolders('automation', folderIds, folderIds);
  folders.forEach((folder) => {
    folderAutomationIds = [...folderAutomationIds, ...folder.automations];
  });
  // - Getting from sub automations && materials from req automations & folder automations
  const data = await getMaterials(
    [...automationIds, ...folderAutomationIds],
    [...automationIds, ...folderAutomationIds],
    [],
    [],
    [],
    user
  );
  const videoIds = [...new Set([...data.videos])];
  const imageIds = [...new Set([...data.images])];
  const pdfIds = [...new Set([...data.pdfs])];
  const stageIds = [...new Set([...(data.stages || [])])];
  const allAutomationIds = [...new Set([...data.ids])];
  const allFolderAutomationIds = [...automationIds, ...folderAutomationIds];
  const childAutomationIds = allAutomationIds.filter(
    (e) => !allFolderAutomationIds.includes(e)
  );
  const automationIdsToShare = [...automationIds, ...childAutomationIds];

  return {
    videoIds,
    pdfIds,
    imageIds,
    stageIds,
    childAutomationIds,
    automationIdsToShare,
    automationIds,
    folderIds,
  };
};

const checkShareAutomationV2 = async (req, res) => {
  const { currentUser } = req;
  const { automations } = req.body;
  const { videoIds, imageIds, pdfIds, stageIds, childAutomationIds, ...rest } =
    await getAutomationRelated(automations, currentUser);

  const videos = await Video.find({ _id: { $in: videoIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const images = await Image.find({ _id: { $in: imageIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const dealStages = await DealStage.find({ _id: { $in: stageIds } }).select({
    title: 1,
    _id: 1,
  });
  const childAutomations = await Automation.find({
    _id: { $in: childAutomationIds },
  }).select({
    title: 1,
    _id: 1,
  });

  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
      dealStages,
      titles: childAutomations,
      ...rest,
    },
  });
};

const getRelatedResources = async (req, res) => {
  const { currentUser } = req;
  const _id = req.body._id;
  const data = await getResources(_id, [], [], [], [], currentUser);
  const videoIds = [...new Set([...data.videos])];
  const imageIds = [...new Set([...data.images])];
  const pdfIds = [...new Set([...data.pdfs])];
  const childAutomationIds = [...new Set([...data.ids])];
  const videos = await Video.find({ _id: { $in: videoIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const images = await Image.find({ _id: { $in: imageIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const automations = await Automation.find({
    _id: { $in: childAutomationIds },
  }).select({
    title: 1,
    _id: 1,
  });

  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
      automations,
    },
  });
};

/**
 *
 * @param {*} req {team_id: ID[], automations: [{id: ID[], type: 'automations' | 'folders'}]}
 * @param {*} res
 */
const shareAutomationsV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, automations } = req.body;
  const errors = [];

  const automationIdsToShare = [];
  const folderIds = [];
  automations.forEach((e) => {
    if (e.type === 'folder') {
      folderIds.push(e._id);
    } else {
      automationIdsToShare.push(e._id);
    }
  });
  let sharableFolderIds = [];
  let sharableAutomationIds = [];
  if (automationIdsToShare.length) {
    const sharableAutomations = await Automation.find(
      { _id: { $in: automationIdsToShare }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableAutomationIds = sharableAutomations.map((e) => e._id);
    if (automationIdsToShare.length !== sharableAutomationIds.length) {
      const unsharableAutomations = await Automation.find(
        { _id: { $in: automationIdsToShare }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1 }
      );
      unsharableAutomations.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'automation',
          },
        });
      });
    }
  }
  if (folderIds.length) {
    const sharableFolders = await Folder.find(
      { _id: { $in: folderIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableFolderIds = sharableFolders.map((e) => e._id);
    if (folderIds.length !== sharableFolderIds.length) {
      const unsharableFolders = await Folder.find(
        { _id: { $in: folderIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1 }
      );
      unsharableFolders.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'folder',
          },
        });
      });
    }
  }

  // Find the Team List
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  // Loop the teams
  // - Team Folder checking or create
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }

  const rootFolderIds = [];
  automations.forEach((e) => {
    if (e.type === 'folder') {
      rootFolderIds.push(e._id);
    }
  });
  // - Insert folders to Team & Team Folder
  // - Share the extracted sub automations and automations to Team
  // - Extracted materials share
  const resources = [
    { ids: sharableAutomationIds, type: 'automations' },
    { ids: sharableFolderIds, type: 'folders' },
  ];
  await shareResourcesHelper(
    teams,
    teamFolderIds,
    resources,
    currentUser,
    rootFolderIds
  );
  // TODO: Notification Create

  return res.send({
    status: true,
    errors,
  });
};

const unshareAutomationsV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, automations } = req.body;
  const folderIds = automations
    .filter((e) => e.type === 'folder')
    .map((e) => e._id);
  const automationIds = automations
    .filter((e) => e.type !== 'folder')
    .map((e) => e._id);
  // const { videoIds, pdfIds, imageIds, automationIds, folderIds } =
  //   await getAutomationRelated(automations, currentUser);

  // Find the Team List
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  // - Team Folder checking or create
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }

  // const resources = [
  //   { ids: videoIds, type: 'videos' },
  //   { ids: pdfIds, type: 'pdfs' },
  //   { ids: imageIds, type: 'images' },
  //   { ids: automationIds, type: 'automations' },
  //   { ids: folderIds, type: 'folders' },
  // ];
  const resources = [
    { ids: automationIds, type: 'automations' },
    { ids: folderIds, type: 'folders' },
  ];
  await unshareResourcesHelper(team_ids, teamFolderIds, resources, currentUser);
  return res.send({
    status: true,
  });
};

const checkSharePipelineV2 = async (req, res) => {
  const { currentUser } = req;
  const { pipelines } = req.body;

  const automationIds = [];
  const pipelineIds = pipelines.map((e) => e._id);

  await DealStage.find({ pipe_line: { $in: pipelineIds } }).then((stages) => {
    stages.forEach((e) => {
      if (
        e.automation &&
        automationIds.findIndex((o) => o._id === e.automation) === -1
      )
        automationIds.push({ _id: e.automation, type: 'automation' });
    });
  });

  const { videoIds, imageIds, pdfIds, stageIds, childAutomationIds, ...rest } =
    await getAutomationRelated(automationIds, currentUser);

  const videos = await Video.find({ _id: { $in: videoIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const images = await Image.find({ _id: { $in: imageIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } }).select({
    title: 1,
    preview: 1,
    _id: 1,
  });
  const dealStages = await DealStage.find({ _id: { $in: stageIds } }).select({
    title: 1,
    _id: 1,
  });
  const allAutomationIds = [...automationIds, ...childAutomationIds];
  const allChildAutomations = await Automation.find({
    _id: { $in: allAutomationIds },
  }).select({
    title: 1,
    _id: 1,
  });

  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
      dealStages,
      titles: allChildAutomations,
      ...rest,
    },
  });
};

const sharePipelinesV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, pipelines } = req.body;

  const errors = [];

  const automationIds = [];
  const pipelineIds = pipelines.map((e) => e._id);

  await DealStage.find({ pipe_line: { $in: pipelineIds } }).then((stages) => {
    stages.forEach((e) => {
      if (
        e.automation &&
        automationIds.findIndex((o) => o._id === e.automation) === -1
      )
        automationIds.push({ _id: e.automation, type: 'automation' });
    });
  });

  const { videoIds, pdfIds, imageIds, automationIdsToShare } =
    await getAutomationRelated(automationIds, currentUser);

  let sharableVideoIds = [];
  let sharablePdfIds = [];
  let sharableImageIds = [];
  let sharableAutomationIds = [];
  let sharablePipelineIds = [];

  if (pipelines.length) {
    sharablePipelineIds = pipelines.map((e) => e._id);
  }

  if (automationIdsToShare.length) {
    const sharableAutomations = await Automation.find(
      { _id: { $in: automationIdsToShare }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableAutomationIds = sharableAutomations.map((e) => e._id);
    if (automationIdsToShare.length !== sharableAutomationIds.length) {
      const unsharableAutomations = await Automation.find(
        { _id: { $in: automationIdsToShare }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1 }
      );
      unsharableAutomations.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'automation',
          },
        });
      });
    }
  }

  if (videoIds.length) {
    const sharableVideos = await Video.find(
      { _id: { $in: videoIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableVideoIds = sharableVideos.map((e) => e._id);
    if (videoIds.length !== sharableVideoIds.length) {
      const unsharableVideos = await Video.find(
        { _id: { $in: videoIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1, thumbnail: 1, preview: 1 }
      );
      unsharableVideos.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'video',
            thumbnail: e.thumbnail,
            preview: e.preview,
          },
        });
      });
    }
  }
  if (pdfIds.length) {
    const sharablePdfs = await PDF.find(
      { _id: { $in: pdfIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharablePdfIds = sharablePdfs.map((e) => e._id);
    if (pdfIds.length !== sharablePdfIds.length) {
      const unsharablePdfs = await PDF.find(
        { _id: { $in: pdfIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1, thumbnail: 1, preview: 1 }
      );
      unsharablePdfs.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'pdf',
            thumbnail: e.thumbnail,
            preview: e.preview,
          },
        });
      });
    }
  }
  if (imageIds.length) {
    const sharableImages = await Image.find(
      { _id: { $in: imageIds }, is_sharable: true },
      { _id: 1, type: 1, is_sharable: 1 }
    );
    sharableImageIds = sharableImages.map((e) => e._id);
    if (imageIds.length !== sharableImageIds.length) {
      const unsharableImages = await Image.find(
        { _id: { $in: imageIds }, is_sharable: false },
        { _id: 1, type: 1, is_sharable: 1, title: 1, thumbnail: 1, preview: 1 }
      );
      unsharableImages.forEach((e) => {
        errors.push({
          material: {
            id: e._id,
            title: e.title,
            type: 'image',
            thumbnail: e.thumbnail,
            preview: e.preview,
          },
        });
      });
    }
  }
  // Find the Team List
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  // Loop the teams
  // - Team Folder checking or create
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }
  // - Insert folders to Team & Team Folder
  // - Share the extracted sub automations and automations to Team
  // - Extracted materials share
  const resources = [
    { ids: sharableVideoIds, type: 'videos' },
    { ids: sharablePdfIds, type: 'pdfs' },
    { ids: sharableImageIds, type: 'images' },
    { ids: sharableAutomationIds, type: 'automations' },
    { ids: sharablePipelineIds, type: 'pipelines' },
  ];

  await shareResourcesHelper(teams, teamFolderIds, resources, currentUser);
  // TODO: Notification Create

  return res.send({
    status: true,
    errors,
  });
};

const unshareCheckPipelinesV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, pipelines } = req.body;

  const automations = [];
  const automationIds = [];
  const pipelineIds = pipelines
    .filter((e) => e.type !== 'folder')
    .map((e) => e._id);

  let owner = false;
  await DealStage.find({
    pipe_line: { $in: pipelineIds },
  }).then((stages) => {
    stages.forEach((e) => {
      if (e.user !== currentUser._id) {
        owner = true;
      }
      if (e.automation && !automationIds.includes(e.automation + '')) {
        automationIds.push(e.automation + '');
        automations.push({ _id: e.automation + '', type: 'automation' });
      }
    });
  });

  if (!owner) {
    return res.send({
      status: false,
      error: 'not owner pipeline',
    });
  }

  const { childAutomationIds } = await getAutomationRelated(
    automations,
    team_ids
  );
  const allAutomationIds = [...automationIds, ...childAutomationIds];

  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  let allPipeline = [];
  let teamAllAutomationIds = [];
  teams.forEach(async (e) => {
    allPipeline = [...allPipeline, ...e.pipelines];
    teamAllAutomationIds = [...teamAllAutomationIds, ...e.automations];
  });

  const otherPipeline = [];
  allPipeline.forEach(async (e) => {
    if (!pipelineIds.includes(e + '')) otherPipeline.push(e);
  });

  const otherAutomations = [];
  const otherAutomationIds = [];
  await DealStage.find({ pipe_line: { $in: otherPipeline } }).then((stages) => {
    stages.forEach((e) => {
      if (e.automation && !otherAutomationIds.includes(e.automation + '')) {
        otherAutomationIds.push(e.automation + '');
        otherAutomations.push({ _id: e.automation + '', type: 'automation' });
      }
    });
  });

  const { childAutomationIds: otherChildAutomationIds } =
    await getAutomationRelated(otherAutomations, team_ids);
  const otherAllAutomationIds = [
    ...otherAutomationIds,
    ...otherChildAutomationIds,
  ];

  const unsharablePipelineAssignAutomationIds = [];
  allAutomationIds.forEach(async (e) => {
    if (!otherAllAutomationIds.includes(e))
      unsharablePipelineAssignAutomationIds.push(e);
  });

  const allPipelineAssignAutomationIds = [
    ...allAutomationIds,
    ...otherAllAutomationIds,
  ];
  const teamRestAutomation = [];
  const teamRestAutomationIds = [];
  teamAllAutomationIds.forEach(async (e) => {
    if (!allPipelineAssignAutomationIds.includes(e + '')) {
      teamRestAutomation.push({ _id: e, type: 'automation' });
      teamRestAutomationIds.push(e + '');
    }
  });

  const { childAutomationIds: teamRestChildAutomationIds } =
    await getAutomationRelated(teamRestAutomation, team_ids);

  const teamRestAllAutomation = [
    ...teamRestAutomationIds,
    ...teamRestChildAutomationIds,
  ];

  const unsharableAutomationIds = [];
  unsharablePipelineAssignAutomationIds.forEach(async (e) => {
    if (!teamRestAllAutomation.includes(e))
      unsharableAutomationIds.push(mongoose.Types.ObjectId(e));
  });

  const unsharableAutomations = await Automation.find({
    _id: { $in: unsharableAutomationIds },
  })
    .select({ _id: 1, title: 1 })
    .catch((err) => {
      console.log('err', err.message);
    });

  return res.send({
    status: true,
    data: {
      titles: unsharableAutomations,
    },
  });
};

const unsharePipelinesV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, pipelines, bulk_data } = req.body;

  const pipelineIds = pipelines
    .filter((e) => e.type !== 'folder')
    .map((e) => e._id);

  const bulk_automations = (bulk_data?.titles || []).map((e) => e._id);
  const resources = [
    { ids: pipelineIds, type: 'pipelines' },
    { ids: bulk_automations, type: 'automations' },
  ];

  // team automations
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }

  await unshareResourcesHelper(team_ids, teamFolderIds, resources, currentUser);
  return res.send({
    status: true,
  });
};

/**
 * Unshare the material(folder) from specific team or all team
 * All team unshare is possible?
 * Check the reference before unshare
 * @param {*} req
 * @param {*} res
 */
const unshareResourceV2 = async (req, res) => {
  const { currentUser } = req;
  const { resource, team } = req.body;

  const resourceId = resource.id;
  const type = resource.type;

  const folderUpdateQuery = {
    $pull: {
      [type + 's']: { $in: [resourceId] },
    },
  };
  const teamUpdateQuery = folderUpdateQuery;
  if (type === 'template') {
    teamUpdateQuery['$pull'] = {
      email_templates: { $in: [resourceId] },
    };
  }
  const checkOtherQuery = {
    [type + 's']: { $elemMatch: { $in: [resourceId] } },
  };

  let teamQuery;
  let folderQuery;
  if (team) {
    teamQuery = { _id: team };
    folderQuery = { team };

    await Team.updateMany(teamQuery, teamUpdateQuery);
    await Folder.updateMany(folderQuery, folderUpdateQuery);

    // Find other teams
    const count = await Team.countDocuments({
      ...checkOtherQuery,
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    }).catch((err) => {
      console.log('team finding error', err);
    });
    if (!count) {
      resetResourceTeamSetting(resource);
    }
    res.send({
      status: true,
    });
  } else {
    teamQuery = {
      $or: [{ members: currentUser.id }, { owner: currentUser.id }],
    };
    const teams = await Team.find(teamQuery).catch(() => {
      console.error('DB ACCESS: Team finding is failed');
    });
    const teamIds = teams.map((e) => e._id);
    folderQuery = { team: { $in: teamIds } };

    await Team.updateMany(teamQuery, teamUpdateQuery);
    await Folder.updateMany(folderQuery, folderUpdateQuery);

    resetResourceTeamSetting(resource);

    res.send({
      status: true,
    });
  }
};

const resetResourceTeamSetting = (resource) => {
  const type = resource.type;
  const id = resource.id;

  const unsetQuery = { $unset: { role: true } };
  switch (type) {
    case 'video':
      Video.updateOne({ _id: id }, unsetQuery);
      break;
    case 'pdf':
      PDF.updateOne({ _id: id }, unsetQuery);
      break;
    case 'image':
      Image.updateOne({ _id: id }, unsetQuery);
      break;
    case 'template':
      EmailTemplate.updateOne({ _id: id }, unsetQuery);
      break;
    case 'automation':
      Automation.updateOne({ _id: id }, unsetQuery);
      break;
    case 'folder':
      Folder.updateOne({ _id: id }, unsetQuery);
      break;
  }
};

/**
 * Unshare the template(folder) from specific team or all team
 * @param {*} req
 * @param {*} res
 */
const unshareTemplatesV2 = async (req, res) => {
  const { currentUser } = req;
  const { team_ids, templates } = req.body;
  const folderIds = templates
    .filter((e) => e.type === 'folder')
    .map((e) => e._id);
  const templateIds = templates
    .filter((e) => e.type !== 'folder')
    .map((e) => e._id);
  // const { videoIds, imageIds, pdfIds, templateIds, folderIds } =
  //   await getTemplateRelated(templates, currentUser._id);
  // const resources = [
  //   { ids: videoIds, type: 'videos' },
  //   { ids: pdfIds, type: 'pdfs' },
  //   { ids: imageIds, type: 'images' },
  //   { ids: templateIds, type: 'templates' },
  //   { ids: folderIds, type: 'folders' },
  // ];
  const resources = [
    { ids: templateIds, type: 'templates' },
    { ids: folderIds, type: 'folders' },
  ];
  // Find the team list
  const teams = await Team.find({ _id: { $in: team_ids } }).catch(() => {});
  // - Team Folder checking or create
  const teamFolderIds = [];
  for (let index = 0; index < teams.length; index++) {
    const folder = await findOrCreateTeamFolder(teams[index]);
    teamFolderIds.push(folder._id);
  }

  await unshareResourcesHelper(team_ids, teamFolderIds, resources, currentUser);

  return res.send({
    status: true,
  });
  // const { currentUser } = req;
  // const { templates, team } = req.body;

  // const templateIds = [];
  // const folderIds = [];
  // templates.forEach((e) => {
  //   if (e.type === 'folders') {
  //     folderIds.push(e.id);
  //   } else {
  //     templateIds.push(e.id);
  //   }
  // });
  // const updateQuery = {
  //   $pull: {
  //     email_templates: { $in: templateIds },
  //     folders: { $in: folderIds },
  //   },
  // };

  // let teamQuery;
  // let folderQuery;
  // if (team) {
  //   teamQuery = { _id: team };
  //   folderQuery = { team };

  //   await Team.updateMany(teamQuery, updateQuery);
  //   await Folder.updateMany(folderQuery, updateQuery);

  //   // Find other teams
  //   folderIds.forEach(async (e) => {
  //     const count = await Team.countDocuments({
  //       folders: { $elemMatch: { $in: [e] } },
  //       $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  //     }).catch((err) => {
  //       console.log('team finding error', err);
  //     });
  //     if (!count) {
  //       Folder.updateOne({ _id: e }, { $unset: { role: true } }).catch(
  //         () => {}
  //       );
  //     }
  //   });
  //   templateIds.forEach(async (e) => {
  //     const count = await Team.countDocuments({
  //       email_templates: { $elemMatch: { $in: [e] } },
  //       $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
  //     }).catch((err) => {
  //       console.log('team finding error', err);
  //     });
  //     if (!count) {
  //       EmailTemplate.updateOne({ _id: e }, { $unset: { role: true } }).catch(
  //         () => {}
  //       );
  //     }
  //   });
  //   res.send({
  //     status: true,
  //   });
  // } else {
  //   teamQuery = {
  //     $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  //   };
  //   const teams = await Team.find(teamQuery).catch(() => {
  //     console.error('DB ACCESS: Team finding is failed');
  //   });
  //   const teamIds = teams.map((e) => e._id);
  //   folderQuery = { team: { $in: teamIds } };

  //   await Team.updateMany(teamQuery, updateQuery);
  //   await Folder.updateMany(folderQuery, updateQuery);

  //   Folder.updateMany(
  //     { _id: { $in: folderIds } },
  //     { $unset: { role: true } }
  //   ).catch(() => {});
  //   EmailTemplate.updateMany(
  //     { _id: { $in: templateIds } },
  //     { $unset: { role: true } }
  //   ).catch(() => {});

  //   res.send({
  //     status: true,
  //   });
  // }
};

const downloadMaterialCheck = async (req, res) => {
  const { currentUser } = req;
  const { materials, team } = req.body;

  let count = 0;
  let max_upload_count = 0;

  if (!currentUser.material_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable download materials',
    });
  }

  if (currentUser.material_info['is_limit']) {
    const userVideoCount = await Video.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const userPDFCount = await PDF.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const userImageCount = await Image.countDocuments({
      user: currentUser.id,
      del: false,
    });
    count = userVideoCount + userPDFCount + userImageCount;
    max_upload_count =
      currentUser.material_info.upload_max_count ||
      PACKAGE.PRO.material_info.upload_max_count;
  }

  if (currentUser.material_info['is_limit'] && max_upload_count <= count) {
    return res.status(412).send({
      status: false,
      error: 'Exceed upload max materials',
    });
  }
  const existFolders = [];
  const folderIds = [];
  const videoIds = [];
  const imageIds = [];
  const pdfIds = [];
  materials.forEach((e) => {
    switch (e.type) {
      case 'video':
        videoIds.push(e._id);
        break;
      case 'pdf':
        pdfIds.push(e._id);
        break;
      case 'image':
        imageIds.push(e._id);
        break;
      case 'folder':
        folderIds.push(e._id);
        break;
    }
  });
  // check shared item and downloaded items
  const unsharedItems = [];
  const downloadedItems = [];
  const reqVideos = await Video.find({
    _id: { $in: videoIds },
  }).catch((err) => {
    console.log('Can not find videos', err);
  });
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  for (let i = 0; i < reqVideos.length; i++) {
    const video = reqVideos[i];
    if (video.role !== 'admin') {
      const shared = await checkShared(video._id, 'videos', teamFolder);
      if (!shared) {
        unsharedItems.push(video);
      }
    }
    const downloadedVideo = await Video.findOne({
      original_id: video._id,
      original_version: video.version,
      version: 0,
      del: false,
      user: currentUser._id,
    }).catch((err) => {
      console.log('Can not find downloaded video', err);
    });
    if (downloadedVideo) {
      downloadedItems.push(downloadedVideo);
      const index = reqVideos.findIndex((e) => e._id !== downloadedVideo._id);
      if (index !== -1) {
        videoIds.splice(index, 1);
      }
    }
  }
  const reqPdfs = await PDF.find({
    _id: { $in: pdfIds },
  }).catch((err) => {
    console.log('Can not find pdfs', err);
  });
  for (let i = 0; i < reqPdfs.length; i++) {
    const pdf = reqPdfs[i];
    if (pdf.role !== 'admin') {
      const shared = await checkShared(pdf._id, 'pdfs', teamFolder);
      if (!shared) {
        unsharedItems.push(pdf);
      }
    }
    const downloadedPdf = await PDF.findOne({
      original_id: pdf._id,
      original_version: pdf.version,
      version: 0,
      del: false,
      user: currentUser.id,
    }).catch((err) => {
      console.log('Can not find downloaded video', err);
    });
    if (downloadedPdf) {
      downloadedItems.push(downloadedPdf);
      const index = reqPdfs.findIndex((e) => e._id !== downloadedPdf._id);
      if (index !== -1) {
        pdfIds.splice(index, 1);
      }
    }
  }
  const reqImages = await Image.find({
    _id: { $in: imageIds },
  }).catch((err) => {
    console.log('Can not find images', err);
  });
  for (let i = 0; i < reqImages.length; i++) {
    const image = reqImages[i];
    if (image.role !== 'admin') {
      const shared = await checkShared(image._id, 'images', teamFolder);
      if (!shared) {
        unsharedItems.push(image);
      }
    }
    const downloadedImage = await Image.findOne({
      original_id: image._id,
      original_version: image.version,
      version: 0,
      del: false,
      user: currentUser.id,
    }).catch((err) => {
      console.log('Can not find downloaded image', err);
    });
    if (downloadedImage) {
      downloadedItems.push(downloadedImage);
      const index = reqImages.findIndex((e) => e._id !== downloadedImage._id);
      if (index !== -1) {
        imageIds.splice(index, 1);
      }
    }
  }
  await Folder.find({
    original_id: { $in: folderIds },
    user: currentUser.id,
    del: false,
  }).then((_res) => {
    _res.forEach((e) => {
      if (!existFolders.includes(e.original_id)) {
        existFolders.push(e.original_id);
      }
    });
  });
  const folders = await Folder.find({ _id: { $in: existFolders } });
  return res.send({
    status: true,
    data: {
      folders,
      unsharedItems,
      downloadedItems,
    },
  });
};

const downloadMaterial = async (req, res) => {
  const { currentUser } = req;
  const { materials, team } = req.body;
  let folderIds = [];
  const originalFolderIds = [];
  let videoIds = [];
  let imageIds = [];
  let pdfIds = [];
  materials.forEach((e) => {
    switch (e.type) {
      case 'video':
        videoIds.push(e._id);
        break;
      case 'pdf':
        pdfIds.push(e._id);
        break;
      case 'image':
        imageIds.push(e._id);
        break;
      case 'folder':
        folderIds.push(e._id);
        originalFolderIds.push(e._id);
        break;
    }
  });
  // check shared item
  let shared = true;
  const reqVideos = await Video.find({
    _id: { $in: videoIds },
  }).catch((err) => {
    console.log('Can not find videos', err);
  });
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  for (let i = 0; i < reqVideos.length; i++) {
    const video = reqVideos[i];
    if (video.role !== 'admin') {
      shared = await checkShared(video._id, 'videos', teamFolder);
      if (!shared) {
        break;
      }
    }
  }
  const reqPdfs = await PDF.find({
    _id: { $in: pdfIds },
  }).catch((err) => {
    console.log('Can not find pdfs', err);
  });
  for (let i = 0; i < reqPdfs.length; i++) {
    const pdf = reqPdfs[i]._id;
    if (pdf.role !== 'admin') {
      shared = await checkShared(pdf._id, 'pdfs', teamFolder);
      if (!shared) {
        break;
      }
    }
  }
  const reqImages = await Image.find({
    _id: { $in: imageIds },
  }).catch((err) => {
    console.log('Can not find images', err);
  });
  for (let i = 0; i < reqImages.length; i++) {
    const image = reqImages[i];
    if (image.role !== 'admin') {
      shared = await checkShared(image._id, 'images', teamFolder);
      if (!shared) {
        break;
      }
    }
  }
  if (!shared) {
    return res.send({
      status: false,
      error: 'You have not permission to download materials',
    });
  }

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
      original_folders: originalFolderIds,
    },
    currentUser._id,
    team
  );
  return res.send({
    status: true,
  });
};

const getResourcesToDownloadTemplates = async (templates) => {
  const folderIds = [];
  const originalFolderIds = [];
  const templateIds = [];
  templates.forEach((e) => {
    if (e.type === 'folder') {
      folderIds.push(e._id);
      originalFolderIds.push(e._id);
    } else {
      templateIds.push(e._id);
    }
  });
  let relatedFolderIds = [];
  let relatedTemplateIds = [];
  const folders = await getAllFolders('template', folderIds, folderIds);
  folders.forEach((e) => {
    relatedFolderIds = [...relatedFolderIds, ...e.folders];
    relatedTemplateIds = [...relatedTemplateIds, ...e.templates];
  });
  relatedFolderIds = relatedFolderIds.filter((e) => !folderIds.includes(e));

  const { videoIds, pdfIds, imageIds } = await getTemplateMaterials([
    ...templateIds,
    ...relatedTemplateIds,
  ]);

  return {
    relatedVideos: videoIds,
    relatedPdfs: pdfIds,
    relatedImages: imageIds,
    relatedFolders: relatedFolderIds,
    relatedTemplates: relatedTemplateIds,
    folders: folderIds,
    templates: templateIds,
    original_folders: originalFolderIds.map((e) => e + ''),
  };
};

const checkShared = async (resourceId, resourceType, teamFolder) => {
  if (!teamFolder) {
    return false;
  }

  if ((teamFolder[resourceType] || []).includes(resourceId)) {
    return true;
  }

  const folder = await Folder.findOne({
    [resourceType]: resourceId,
    team: { $exists: false },
  }).catch((err) => {
    console.log('Can not find folder', err);
  });

  if (!folder) {
    return false;
  }

  if ((teamFolder.folders || []).includes(folder._id)) {
    return true;
  } else {
    const result = await checkFolderIsShared(
      folder.user,
      folder._id,
      teamFolder
    );
    return result;
  }
};

const downloadTemplateCheck = async (req, res) => {
  const { currentUser } = req;
  const { templates, team } = req.body;

  // Check permission and download
  const unsharedItems = [];
  const downloadedItems = [];
  const {
    relatedVideos,
    relatedPdfs,
    relatedImages,
    templates: templateIds,
    relatedTemplates,
  } = await getResourcesToDownloadTemplates(templates);

  const reqTemplates = await EmailTemplate.find({
    _id: { $in: [...templateIds, ...relatedTemplates] },
  }).catch((err) => {
    console.log('Can not find email template', err);
  });
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  const realTemplates = [...reqTemplates];
  for (let i = 0; i < reqTemplates.length; i++) {
    const template = reqTemplates[i];
    if (template.role !== 'admin') {
      const shared = await checkShared(template._id, 'templates', teamFolder);
      if (!shared) {
        unsharedItems.push(template);
      }
    }
    const downloadedTemplate = await EmailTemplate.findOne({
      original_id: template._id,
      original_version: template.version,
      version: 0,
      del: false,
      user: currentUser.id,
    }).catch((err) => {
      console.log('Can not find downloaded email template', err);
    });
    if (downloadedTemplate) {
      downloadedItems.push(template);
      const index = realTemplates.findIndex(
        (e) => `${e._id}` !== `${downloadedTemplate.original_id}`
      );
      if (index !== -1) {
        realTemplates.splice(index, 1);
      }
    }
  }

  const videos = await Video.find({ _id: { $in: relatedVideos } });
  const downloadedVideos = await Video.find({
    original_id: relatedVideos,
    version: 0,
    del: false,
    user: currentUser.id,
  });

  const undownloadVideos = [...videos];
  videos.forEach((e) => {
    const downloadedVideo = downloadedVideos.find(
      (v) =>
        `${v.original_id}` === `${e.__id}` && v.original_version === e.version
    );
    if (downloadedVideo) {
      downloadedItems.push(e);
      const index = undownloadVideos.findIndex(
        (v) => `${v._id}` === `${downloadedVideo.original_id}`
      );
      if (index !== -1) {
        undownloadVideos.splice(index, 1);
      }
    }
  });
  const images = await Image.find({ _id: { $in: relatedImages } });
  const downloadedImages = await Image.find({
    original_id: relatedImages,
    version: 0,
    del: false,
    user: currentUser.id,
  });

  const undownloadImages = [...images];
  images.forEach((e) => {
    const downloadedImage = downloadedImages.find(
      (v) =>
        `${v.original_id}` === `${e.__id}` && v.original_version === e.version
    );
    if (downloadedImage) {
      downloadedItems.push(e);
      const index = undownloadImages.findIndex(
        (v) => `${v._id}` === `${downloadedImage.original_id}`
      );
      if (index !== -1) {
        undownloadImages.splice(index, 1);
      }
    }
  });
  const pdfs = await PDF.find({ _id: { $in: relatedPdfs } });
  const downloadedPdfs = await PDF.find({
    original_id: relatedPdfs,
    version: 0,
    del: false,
    user: currentUser.id,
  });

  const undownloadPdfs = [...pdfs];
  pdfs.forEach((e) => {
    const downloadedPdf = downloadedPdfs.find(
      (v) =>
        `${v.original_id}` === `${e.__id}` && v.original_version === e.version
    );
    if (downloadedPdf) {
      downloadedItems.push(e);
      const index = undownloadPdfs.findIndex(
        (v) => `${v._id}` === `${downloadedPdf.original_id}`
      );
      if (index !== -1) {
        undownloadPdfs.splice(index, 1);
      }
    }
  });

  return res.send({
    status: true,
    data: {
      videos: undownloadVideos,
      pdfs: undownloadPdfs,
      images: undownloadImages,
      unsharedItems,
      downloadedItems,
    },
  });
};

const downloadTemplate = async (req, res) => {
  const { currentUser } = req;
  const { templates, team } = req.body;
  // Check shared item
  const related = await getResourcesToDownloadTemplates(templates);

  const reqTemplates = await EmailTemplate.find({
    _id: { $in: [...related.templates, ...related.relatedTemplates] },
  }).catch((err) => {
    console.log('Can not find email template', err);
  });
  let shared = true;
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  for (let i = 0; i < reqTemplates.length; i++) {
    const template = reqTemplates[i];
    if (template.role !== 'admin') {
      shared = await checkShared(template._id, 'templates', teamFolder);
      if (!shared) {
        break;
      }
    }
  }
  if (!shared) {
    return res.send({
      status: false,
      error: 'You have not permission to download templates',
    });
  }

  const duplicatedTokens = await downloadResources(
    related,
    currentUser._id,
    team
  );
  return res.send({
    status: true,
    data: {
      duplicatedTokens,
    },
  });
};

const downloadAutomationCheck = async (req, res) => {
  const { currentUser } = req;
  const { automations, team } = req.body;

  // Check permission and download
  const downloadedItems = [];
  const unsharedItems = [];

  const {
    relatedVideos,
    relatedPdfs,
    relatedImages,
    relatedStages,
    relatedAllAutomations,
  } = await getResourcesToDownloadAutomations(automations);

  const reqAutomations = await Automation.find({
    _id: { $in: relatedAllAutomations },
  }).catch((err) => {
    console.log('Can not find automations', err);
  });
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }

  const realAutomations = [...reqAutomations];
  for (let i = 0; i < reqAutomations.length; i++) {
    const automation = reqAutomations[i];
    if (automation.role !== 'admin') {
      const shared = await checkShared(
        automation._id,
        'automations',
        teamFolder
      );
      if (!shared) {
        unsharedItems.push(automation);
      }
    }
    const downloadedAutomation = await Automation.findOne({
      original_id: automation._id,
      original_version: automation.version,
      version: 0,
      del: false,
      user: currentUser.id,
    }).catch((err) => {
      console.log('Can not find downloaded automations', err);
    });
    if (downloadedAutomation) {
      downloadedItems.push(automation);
      const index = realAutomations.findIndex(
        (e) => `${e._id}` === `${downloadedAutomation.original_id}`
      );
      if (index !== -1) {
        realAutomations.splice(index, 1);
      }
    }
  }

  const videos = await Video.find({ _id: { $in: relatedVideos } });
  const downloadedVideos = await Video.find({
    original_id: relatedVideos,
    version: 0,
    del: false,
    user: currentUser.id,
  });

  const undownloadVideos = [...videos];
  videos.forEach((e) => {
    const downloadedVideo = downloadedVideos.find(
      (v) =>
        `${v.original_id}` === `${e.__id}` && v.original_version === e.version
    );
    if (downloadedVideo) {
      downloadedItems.push(e);
      const index = undownloadVideos.findIndex(
        (v) => `${v._id}` === `${downloadedVideo.original_id}`
      );
      if (index !== -1) {
        undownloadVideos.splice(index, 1);
      }
    }
  });
  const images = await Image.find({ _id: { $in: relatedImages } });
  const downloadedImages = await Image.find({
    original_id: relatedImages,
    version: 0,
    del: false,
    user: currentUser.id,
  });

  const undownloadImages = [...images];
  images.forEach((e) => {
    const downloadedImage = downloadedImages.find(
      (v) =>
        `${v.original_id}` === `${e.__id}` && v.original_version === e.version
    );
    if (downloadedImage) {
      downloadedItems.push(e);
      const index = undownloadImages.findIndex(
        (v) => `${v._id}` === `${downloadedImage.original_id}`
      );
      if (index !== -1) {
        undownloadImages.splice(index, 1);
      }
    }
  });
  const pdfs = await PDF.find({ _id: { $in: relatedPdfs } });
  const downloadedPdfs = await PDF.find({
    original_id: relatedPdfs,
    version: 0,
    del: false,
    user: currentUser.id,
  });

  const undownloadPdfs = [...pdfs];
  pdfs.forEach((e) => {
    const downloadedPdf = downloadedPdfs.find(
      (v) =>
        `${v.original_id}` === `${e.__id}` && v.original_version === e.version
    );
    if (downloadedPdf) {
      downloadedItems.push(e);
      const index = undownloadPdfs.findIndex(
        (v) => `${v._id}` === `${downloadedPdf.original_id}`
      );
      if (index !== -1) {
        undownloadPdfs.splice(index, 1);
      }
    }
  });
  const realAutomationIds = realAutomations.map((e) => `${e._id}`);
  const data = await getMaterials(
    [...realAutomationIds],
    [...realAutomationIds],
    [],
    [],
    [],
    null,
    []
  );
  const stageIds = [...new Set([...(data.stages || [])])];
  const dealStages = await DealStage.find({
    _id: { $in: stageIds },
  })
    .select({
      title: 1,
      _id: 1,
      pipe_line: 1,
    })
    .populate('pipe_line');

  return res.send({
    status: true,
    data: {
      videos: undownloadVideos,
      pdfs: undownloadPdfs,
      images: undownloadImages,
      dealStages,
      titles: realAutomations,
      unsharedItems,
      downloadedItems,
    },
  });
};

const downloadAutomation = async (req, res) => {
  const { currentUser } = req;
  const { automations, team, stages } = req.body;

  const related = await getResourcesToDownloadAutomations(automations);
  // Check shared item
  const reqAutomations = await Automation.find({
    _id: { $in: related?.relatedAllAutomations },
  }).catch((err) => {
    console.log('Can not find email pipelines', err);
  });
  let shared = true;
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  for (let i = 0; i < reqAutomations.length; i++) {
    const automation = reqAutomations[i];
    if (automation.role !== 'admin') {
      shared = await checkShared(automation._id, 'automations', teamFolder);
      if (!shared) {
        break;
      }
    }
  }
  if (!shared) {
    return res.send({
      status: false,
      error: 'You have not permission to download automations',
    });
  }
  if (stages) {
    related['stages'] = stages;
  }

  const duplicatedTokens = await downloadResources(
    related,
    currentUser._id,
    team
  );
  // const duplicatedTokens = null;

  return res.send({
    status: true,
    data: { duplicatedTokens },
  });
};

const downloadPipelineCheck = async (req, res) => {
  const { currentUser } = req;
  const { pipelines, team } = req.body;
  // check limit
  let count = 0;
  let max_pipeline_count = 0;
  if (currentUser.pipe_info['is_limit']) {
    count = await Pipeline.countDocuments({
      user: currentUser.id,
    });
    max_pipeline_count =
      currentUser.pipe_info.max_count || PACKAGE.PRO.pipe_info.max_count;
  }

  if (currentUser.pipe_info['is_limit'] && max_pipeline_count <= count) {
    return res.status(412).send({
      status: false,
      error: 'Exceed max pipelines',
    });
  }

  // Check permission and download
  const downloadedItems = [];
  const unsharedItems = [];

  const realPipelines = pipelines.filter((e) => e.type !== 'folder');

  const pipelineIds = Array.from(new Set([...realPipelines.map((e) => e._id)]));
  const reqPipelines = await PipeLine.find({
    _id: { $in: pipelineIds },
  }).catch((err) => {
    console.log('Can not find pipelines', err);
  });
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  for (let i = 0; i < reqPipelines.length; i++) {
    const pipeline = reqPipelines[i];
    const shared = await checkShared(pipeline._id, 'pipelines', teamFolder);
    if (!shared) {
      unsharedItems.push(pipeline);
    }
    const downloadedPipeline = await Pipeline.findOne({
      original_id: pipeline._id,
      original_version: pipeline.version,
      version: 0,
      user: currentUser._id,
    }).catch((err) => {
      console.log('Can not find downloaded pipeline', err);
    });
    if (downloadedPipeline) {
      downloadedItems.push(downloadedPipeline);
      const index = realPipelines.findIndex(
        (e) => e._id !== downloadedPipeline._id
      );
      if (index !== -1) {
        realPipelines.splice(index, 1);
        pipelineIds.splice(index, 1);
      }
    }
  }

  if (currentUser.pipe_info['is_limit']) {
    count =
      (await Pipeline.countDocuments({
        user: currentUser.id,
      })) + pipelines.length;
  }
  let limited = false;

  if (currentUser.pipe_info['is_limit'] && max_pipeline_count < count) {
    limited = true;
    const diffCount = count - max_pipeline_count;
    pipelines.splice(pipelines.length - diffCount - 1, diffCount);
    pipelineIds.splice(pipelines.length - diffCount - 1, diffCount);
  }

  const automations = [];
  const original_dealStages = [];
  await DealStage.find({ pipe_line: { $in: pipelineIds } }).then((stages) => {
    stages.forEach((e) => {
      original_dealStages.push(e._id.toString());
      if (
        e.automation &&
        automations.findIndex((o) => o._id === e.automation) === -1
      )
        automations.push({ _id: e.automation, type: 'automation' });
    });
  });

  const {
    relatedVideos,
    relatedPdfs,
    relatedImages,
    relatedStages,
    relatedAutomations,
  } = await getResourcesToDownloadAutomations(automations);
  const filteredStages = relatedStages.filter(
    (dealStage) => !original_dealStages.includes(dealStage)
  );

  const videos = await Video.find({ _id: { $in: relatedVideos } }).select({
    title: 1,
    _id: 1,
    preview: 1,
  });
  const images = await Image.find({ _id: { $in: relatedImages } }).select({
    title: 1,
    _id: 1,
    preview: 1,
  });
  const pdfs = await PDF.find({ _id: { $in: relatedPdfs } }).select({
    title: 1,
    _id: 1,
    preview: 1,
  });
  const dealStages = await DealStage.find({
    _id: { $in: filteredStages },
  })
    .select({
      title: 1,
      _id: 1,
      pipe_line: 1,
    })
    .populate('pipe_line');

  const stageAutomations = automations.map((e) => e._id);
  const childAutomations = await Automation.find({
    _id: { $in: [...stageAutomations, ...relatedAutomations] },
  }).select({
    title: 1,
    _id: 1,
  });

  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
      dealStages,
      titles: childAutomations,
      unsharedItems,
      downloadedItems,
      limited,
    },
  });
};

const downloadPipeline = async (req, res) => {
  const { currentUser } = req;
  const { pipelines, team, stages } = req.body;

  let count = 0;
  let max_pipeline_count = 0;
  if (currentUser.pipe_info['is_limit']) {
    count = await Pipeline.countDocuments({
      user: currentUser.id,
    });
    max_pipeline_count =
      currentUser.pipe_info.max_count || PACKAGE.PRO.pipe_info.max_count;
  }

  if (currentUser.pipe_info['is_limit'] && max_pipeline_count <= count) {
    return res.status(412).send({
      status: false,
      error: 'Exceed max pipelines',
    });
  }

  const realPipelines = pipelines.filter((e) => e.type !== 'folder');

  const pipelineIds = Array.from(new Set([...realPipelines.map((e) => e._id)]));
  // Check shared item
  const reqPipelines = await Pipeline.find({
    _id: { $in: pipelineIds },
  }).catch((err) => {
    console.log('Can not find pipelines', err);
  });
  let shared = true;
  let teamFolder;
  if (team) {
    teamFolder = await Folder.findOne({ team });
  }
  for (let i = 0; i < reqPipelines.length; i++) {
    const pipeline = reqPipelines[i];

    shared = await checkShared(pipeline._id, 'pipelines', teamFolder);
    if (!shared) {
      break;
    }
    const downloadedPipeline = await Pipeline.findOne({
      original_id: pipeline._id,
      original_version: pipeline.version,
      version: 0,
      user: currentUser._id,
    }).catch((err) => {
      console.log('Can not find downloaded pipeline', err);
    });
    if (downloadedPipeline) {
      const index = pipelineIds.findIndex(
        (e) => `${e}` !== `${downloadedPipeline._id}`
      );
      if (index !== -1) {
        pipelineIds.splice(index, 1);
      }
    }
  }
  if (!shared) {
    return res.send({
      status: false,
      error: 'You have not permission to download pipeline',
    });
  }

  if (currentUser.pipe_info['is_limit']) {
    count =
      (await Pipeline.countDocuments({
        user: currentUser.id,
      })) + pipelineIds.length;
  }
  let limited = false;

  if (currentUser.pipe_info['is_limit'] && max_pipeline_count < count) {
    limited = true;
    const diffCount = count - max_pipeline_count;
    pipelineIds.splice(pipelines.length - diffCount - 1, diffCount);
  }

  const automations = [];
  await DealStage.find({ pipe_line: { $in: pipelineIds } }).then((stages) => {
    stages.forEach((e) => {
      if (
        e.automation &&
        automations.findIndex((o) => o._id === e.automation) === -1
      )
        automations.push({ _id: e.automation, type: 'automation' });
    });
  });

  const related = await getResourcesToDownloadAutomations(automations);
  related['stages'] = stages || [];
  related['pipelines'] = pipelineIds;

  const duplicatedTokens = await downloadResources(
    related,
    currentUser._id,
    team
  );

  return res.send({
    status: true,
    data: {
      duplicatedTokens,
    },
  });
};

const downloadResourceData = async (req, res) => {
  const { currentUser } = req;
  const { resources, team } = req.body;

  downloadResources(resources, currentUser._id, team);

  return res.send({
    status: true,
  });
};

const bulkStopShare = async (req, res) => {
  const currentUser = req.body;
  const { team_ids, automations, bulk_data } = req.body;
  const parentFolderIds = automations
    .filter((e) => e.type === 'folder')
    .map((e) => e._id);
  const parentAutomationIds = automations
    .filter((e) => e.type !== 'folder')
    .map((e) => e._id);
  const bulk_folders = (bulk_data?.folders || []).map((e) => e._id);
  const bulk_automations = (bulk_data?.titles || []).map((e) => e._id);
  const bulk_videos = (bulk_data?.videos || []).map((e) => e._id);
  const bulk_pdfs = (bulk_data?.pdfs || []).map((e) => e._id);
  const bulk_images = (bulk_data?.images || []).map((e) => e._id);
  const bulk_templates = (bulk_data?.templates || []).map((e) => e._id);
  const stopSharableFolders = [...parentFolderIds, ...bulk_folders];
  const stopSharableAutomations = [...parentAutomationIds, ...bulk_automations];

  await stopSharableFolders.forEach(async (e) => {
    const count = await Team.countDocuments({
      folders: { $in: [e] },
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    });
    if (!count) {
      await Folder.updateOne({ _id: e }, { $unset: { role: true } }).catch(
        () => {}
      );
    }
  });

  await stopSharableAutomations.forEach(async (e) => {
    const count = await Team.countDocuments({
      automations: { $in: [e] },
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    });
    if (!count) {
      await Automation.updateOne({ _id: e }, { $unset: { role: true } }).catch(
        () => {}
      );
    }
  });

  await bulk_videos.forEach(async (e) => {
    const count = await Team.countDocuments({
      videos: { $in: [e] },
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    });
    if (!count) {
      await Video.updateOne({ _id: e }, { $unset: { role: true } }).catch(
        () => {}
      );
    }
  });

  await bulk_pdfs.forEach(async (e) => {
    const count = await Team.countDocuments({
      pdfs: { $in: [e] },
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    });
    if (!count) {
      await PDF.updateOne({ _id: e }, { $unset: { role: true } }).catch(
        () => {}
      );
    }
  });

  await bulk_images.forEach(async (e) => {
    const count = await Team.countDocuments({
      images: { $in: [e] },
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    });
    if (!count) {
      await Image.updateOne({ _id: e }, { $unset: { role: true } }).catch(
        () => {}
      );
    }
  });

  await bulk_templates.forEach(async (e) => {
    const count = await Team.countDocuments({
      email_templates: { $in: [e] },
      $or: [{ owner: currentUser._id }, { editors: currentUser._id }],
    });
    if (!count) {
      await EmailTemplate.updateOne(
        { _id: e },
        { $unset: { role: true } }
      ).catch(() => {});
    }
  });

  await Team.updateMany(
    {
      _id: { $in: team_ids },
    },
    {
      $pull: {
        folders: { $in: stopSharableFolders },
        automations: { $in: stopSharableAutomations },
        videos: { $in: bulk_videos },
        pdfs: { $in: bulk_pdfs },
        images: { $in: bulk_images },
        email_templates: { $in: bulk_templates },
      },
    }
  );

  await Folder.updateMany(
    {
      team: { $in: team_ids },
    },
    {
      $pull: {
        folders: { $in: stopSharableFolders },
        automations: { $in: stopSharableAutomations },
        videos: { $in: bulk_videos },
        pdfs: { $in: bulk_pdfs },
        images: { $in: bulk_images },
        email_templates: { $in: bulk_templates },
      },
    }
  );

  return res.send({
    status: true,
  });
};

const downloadDuplicatedTokens = async (req, res) => {
  const { currentUser } = req;
  const { tokens } = req.body;
  await downloadDuplicatedCustomTokens(tokens, currentUser._id);
  return res.send({
    status: true,
  });
};

module.exports = {
  getAll,
  getLeaders,
  getTeam,
  loadMaterial,
  loadAutomation,
  loadTemplate,
  loadPipeline,
  getSharedContacts,
  getAllSharedContacts,
  searchContact,
  getInvitedTeam,
  getRequestedTeam,
  get,
  create,
  update,
  remove,
  cancelRequest,
  bulkInvites,
  cancelInvite,
  acceptInviation,
  declineInviation,
  acceptRequest,
  declineRequest,
  searchTeam,
  // shareVideos,
  // sharePdfs,
  // shareImages,
  shareAutomations,
  shareEmailTemplates,
  shareFolders,
  removeVideos,
  removePdfs,
  removeImages,
  removeFolders,
  removeAutomations,
  removeEmailTemplates,
  requestTeam,
  updateTeam,
  shareMaterials,
  unshareFolders,
  unshareTemplates,
  unshareAutomations,
  unshareMaterials,
  loadSharedTeams,
  stopShare,
  stopShares,
  shareTeamMaterials,
  leaveTeam,
  removeTeamMemberItems,
  removeTeamMember,
  shareMaterialsV2,
  unshareMaterialsV2,
  downloadMaterialCheck,
  downloadMaterial,
  checkShareAutomationV2,
  shareAutomationsV2,
  unshareAutomationsV2,
  sharePipelinesV2,
  checkSharePipelineV2,
  unshareCheckPipelinesV2,
  unsharePipelinesV2,
  downloadAutomationCheck,
  downloadAutomation,
  downloadPipelineCheck,
  downloadPipeline,
  checkShareTemplateV2,
  shareTemplatesV2,
  unshareTemplatesV2,
  downloadTemplateCheck,
  downloadTemplate,
  unshareCheckMaterialsV2,
  unshareCheckAutomationsV2,
  bulkStopShare,
  downloadDuplicatedTokens,
  getRelatedResources,
  updateOrganization,
};
