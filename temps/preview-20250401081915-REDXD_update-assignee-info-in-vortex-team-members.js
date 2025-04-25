const mongoose = require('mongoose');
const Organization = require('../src/models/organization');
const User = require('../src/models/user');
const { ENV_PATH } = require('../src/configs/path');

require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    preview();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
  });

const preview = async () => {
  const organizations = await Organization.find({
    vortex_team: { $exists: true, $ne: null },
  }).catch((err) => {
    console.error('Error fetching organizations:', err);
    return [];
  });

  let usersToUpdate = 0;
  let orgsProcessed = 0;

  for (const org of organizations) {
    console.log('Checking organization:', {
      _id: org._id,
      name: org.name,
      vortex_team: org.vortex_team,
      team: org.team,
    });

    const members = org.members || [];

    for (const member of members) {
      console.log('Checking member:', {
        status: member.status,
        user: member.user,
      });

      if (member.status === 'ACTIVE' && member.user) {
        const user = await User.findById(member.user);

        if (user) {
          const info = user.assignee_info || {};
          const needsUpdate = !info.is_enabled || !info.is_editable;

          console.log('---');
          console.log('User Info:', {
            _id: user._id,
            user_name: user.user_name,
            assignee_info: info,
            needs_update: needsUpdate,
          });
          console.log('---');

          if (needsUpdate) {
            usersToUpdate++;
          }
        } else {
          console.log(`User not found for users._id: ${member.user}`);
        }
      }
    }

    orgsProcessed++;
  }

  console.log('Preview complete.');
  console.log(`organizations processed: ${orgsProcessed}`);
  console.log(`users needing assignee_info update: ${usersToUpdate}`);

  mongoose.disconnect();
};
