const mongoose = require('mongoose');
const Organization = require('../src/models/organization');
const Team = require('../src/models/team');
const User = require('../src/models/user');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('Connecting to database successful');
    migrate();
    // migrateOrganizationInfoFromSubAccountInfo();
    // migrateOrganizationTeamField();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

/**
 * Create the organization for the internal teams (by primary account)
 * - Find/Create the internal team
 * - Create the organization with internal team information (owner, members)
 * - Update the owner & member organization_info field, organization
 * Warning: This creates the organization without checking if same organization exists there already.
 */
const migrate = async () => {
  const orgPrimaryAccounts = await User.aggregate([
    { $match: { primary_account: { $exists: true }, del: { $ne: true } } },
    { $group: { _id: '$primary_account', users: { $push: '$_id' } } },
  ]).catch(() => {});

  for (let i = 0; i < orgPrimaryAccounts.length; i++) {
    const e = orgPrimaryAccounts[i];

    console.log('generating organization', i, e);
    const owner = e._id;
    const members = e.users;

    const ownerUser = await User.findById(owner).catch(() => {});
    if (!ownerUser) {
      continue;
    }
    // Find the internal team
    const internalTeam = await Team.findOne({ owner, is_internal: true }).catch(
      () => {}
    );
    let internalTeamId = internalTeam?._id;
    console.log('internalTeamId', internalTeamId, ownerUser?.user_name);
    if (!internalTeam) {
      const newInternalTeam = new Team({
        owner,
        members,
        name: ownerUser.user_name + `'s team`,
        is_internal: true,
      });
      await newInternalTeam.save().then(() => {
        internalTeamId = newInternalTeam._id;
      });
    }

    let organizationMembers = members.map((e) => ({
      user: e,
      role: 'MEMBER',
      status: 'ACTIVE',
    }));
    organizationMembers = [
      {
        user: owner,
        role: 'OWNER',
        status: 'ACTIVE',
      },
      ...organizationMembers,
    ];
    const newOrganization = new Organization({
      owner,
      members: organizationMembers,
      name: ownerUser.user_name + `'s organization`,
      team: internalTeamId,
    });
    await newOrganization.save().then(() => {
      console.log('save the organization');
    });
    const newOrganizationId = newOrganization._id;

    await User.updateMany(
      { _id: { $in: [owner, ...members] } },
      {
        $set: {
          organization: newOrganizationId,
          organization_info: { is_enabled: true },
        },
      }
    ).then(() => {});
    await User.updateOne(
      { _id: owner },
      { $set: { 'organization_info.is_owner': true } }
    ).then(() => {});
  }
};

/**
 * Migrate the sub_account_info (of primary account) to the organization_info
 * - If there is no organization_info, it set it newly
 * - If there is organization_info (by above migrate function), it extends the original organization_info with sub_account_info
 */
const migrateOrganizationInfoFromSubAccountInfo = async () => {
  const users = await User.find({
    'sub_account_info.is_enabled': true,
    del: { $ne: true },
  }).catch(() => {});

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.organization_info) {
      const newOrganizationInfo = {
        ...user.organization_info,
        ...user.sub_account_info,
        is_owner: true,
      };
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            organization_info: newOrganizationInfo,
          },
        }
      )
        .then(() => {
          console.log('updated the user', i, user._id, newOrganizationInfo);
        })
        .catch(() => {});
    } else {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            organization_info: { ...user.sub_account_info, is_owner: true },
          },
        }
      )
        .then(() => {
          console.log('updated the user', i, user._id, user.sub_account_info);
        })
        .catch(() => {});
    }
  }
};

/**
 * Set up the team field of the organization
 * This is developed because old organization model doesn't include the team field
 */
const migrateOrganizationTeamField = async () => {
  const organizations = await Organization.find({
    team: { $exists: false },
  }).catch(() => {});

  for (let i = 0; i < organizations.length; i++) {
    const organization = organizations[i];

    const internalTeam = await Team.findOne({
      owner: organization.owner,
      is_internal: true,
    }).catch(() => {});

    console.log('updating the organization', i, organization.name);
    if (internalTeam) {
      await Organization.updateOne(
        { _id: organization._id },
        { $set: { team: internalTeam._id } }
      )
        .then(() => {
          console.log('updated the team');
        })
        .catch(() => {});
    } else {
      console.log('not found the team');
    }
  }
};
