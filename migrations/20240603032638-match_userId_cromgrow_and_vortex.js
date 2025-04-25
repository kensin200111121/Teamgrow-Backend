var mongoose = require('mongoose');

module.exports = {
  async up(db, client) {
    const vortexUsers = [
      // {
      //  crm_user_id: '665de000846790fa2fdf0d2f',
      //  vortex_id: '123456789',
      //  email: 'liwei@crmgrow.com',
      // },
    ];
    for (let i = 0; i < vortexUsers.length; i++) {
      const user = await db
        .collection('users')
        .findOne({ _id: mongoose.Types.ObjectId(vortexUsers[i].crm_user_id) });
      if (user) {
        console.log('crm user already exists');
        await db
          .collection('users')
          .updateOne(
            { _id: user.id },
            { $set: { vortex_id: vortexUsers[i].vortex_id, source: 'vortex' } }
          );
      } else {
        const vortex_user = await db
          .collection('users')
          .findOne({
            email: vortexUsers[i].email,
          })
          .catch(() => {});
        if (vortex_user) {
          console.log('user found by email', vortex_user.email);
          const oldUserId = vortex_user._id;
          const newUserId = mongoose.Types.ObjectId(vortexUsers[i].crm_user_id);
          vortex_user._id = newUserId;
          vortex_user.vortex_id = vortexUsers[i].vortex_id;
          vortex_user.source = 'vortex';
          await db
            .collection('users')
            .insertOne(vortex_user)
            .then((_d) => {
              console.log('created user', _d);
            })
            .catch((_e) => {
              console.log('error in creationg user', _e);
            });
          await db
            .collection('users')
            .deleteOne({ _id: oldUserId })
            .then((_d) => {
              console.log('deleted user', _d);
            })
            .catch((_e) => {
              console.log('error in deleting user', _e);
            });
          await db
            .collection('users')
            .updateMany(
              { primary_account: oldUserId },
              { $set: { primary_account: newUserId } }
            )
            .then((_d) => {
              console.log('primary account user', _d);
            })
            .catch((_e) => {
              console.log('error in primary account user', _e);
            });
          // Update some tables like contacts, garbage etc
          // contacts table
          await db
            .collection('contacts')
            .updateMany({ owner: oldUserId }, { $set: { owner: newUserId } })
            .then((_d) => {
              console.log('contact owner update', _d);
            })
            .catch((_e) => {
              console.log('error in contact owner update', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { original_user: oldUserId },
              { $set: { original_user: newUserId } }
            )
            .then((_d) => {
              console.log('contact original_user update', _d);
            })
            .catch((_e) => {
              console.log('error in contact original_user update', _e);
            });
          await db
            .collection('contacts')
            .updateMany({ user: oldUserId }, { $set: { user: [newUserId] } })
            .then((_d) => {
              console.log('contact user update', _d);
            })
            .catch((_e) => {
              console.log('error in contact user update', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { shared_members: oldUserId },
              { $addToSet: { shared_members: newUserId } }
            )
            .then((_d) => {
              console.log('contact shared_members update', _d);
            })
            .catch((_e) => {
              console.log('error in contact shared_members update', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { shared_members: oldUserId },
              { $pull: { shared_members: oldUserId } }
            )
            .then((_d) => {
              console.log('contact shared_members update', _d);
            })
            .catch((_e) => {
              console.log('error in contact shared_members update', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { pending_users: oldUserId },
              { $addToSet: { pending_users: newUserId } }
            )
            .then((_d) => {
              console.log('contact pending_users update1', _d);
            })
            .catch((_e) => {
              console.log('error in contact pending_users update1', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { pending_users: oldUserId },
              { $pull: { pending_users: oldUserId } }
            )
            .then((_d) => {
              console.log('contact pending_users update2', _d);
            })
            .catch((_e) => {
              console.log('error in contact pending_users update2', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { declined_users: oldUserId },
              { $addToSet: { declined_users: newUserId } }
            )
            .then((_d) => {
              console.log('contact declined_users update', _d);
            })
            .catch((_e) => {
              console.log('error in contact declined_users update', _e);
            });
          await db
            .collection('contacts')
            .updateMany(
              { declined_users: oldUserId },
              { $pull: { declined_users: oldUserId } }
            )
            .then((_d) => {
              console.log('contact declined_users update', _d);
            })
            .catch((_e) => {
              console.log('error in contact declined_users update', _e);
            });

          // notifications table
          await db
            .collection('notifications')
            .updateMany({ user: oldUserId }, { $set: { user: newUserId } })
            .then((_d) => {
              console.log('notification user update', _d);
            })
            .catch((_e) => {
              console.log('error in notification user update', _e);
            });
          await db
            .collection('notifications')
            .updateMany(
              { creator: oldUserId },
              { $set: { creator: newUserId } }
            )
            .then((_d) => {
              console.log('notification creator update', _d);
            })
            .catch((_e) => {
              console.log('error in notification creator update', _e);
            });
          await db
            .collection('notifications')
            .updateMany({ sharer: oldUserId }, { $set: { sharer: newUserId } })
            .then((_d) => {
              console.log('notification sharer update', _d);
            })
            .catch((_e) => {
              console.log('error in notification sharer update', _e);
            });
          await db
            .collection('notifications')
            .updateMany(
              { team_requester: oldUserId },
              { $set: { team_requester: newUserId } }
            )
            .then((_d) => {
              console.log('notification team requester update', _d);
            })
            .catch((_e) => {
              console.log('error in notification team requester update', _e);
            });
          // teams
          await db
            .collection('teams')
            .updateMany(
              { owner: oldUserId },
              { $addToSet: { owner: newUserId } }
            )
            .then((_d) => {
              console.log('team owner update1', _d);
            })
            .catch((_e) => {
              console.log('error in team owner update1', _e);
            });
          await db
            .collection('teams')
            .updateMany({ owner: oldUserId }, { $pull: { owner: oldUserId } })
            .then((_d) => {
              console.log('team owner update2', _d);
            })
            .catch((_e) => {
              console.log('error in team owner update2', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { members: oldUserId },
              { $addToSet: { members: newUserId } }
            )
            .then((_d) => {
              console.log('team members update1', _d);
            })
            .catch((_e) => {
              console.log('error in team members update1', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { members: oldUserId },
              { $pull: { members: oldUserId } }
            )
            .then((_d) => {
              console.log('team members update2', _d);
            })
            .catch((_e) => {
              console.log('error in team members update2', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { invites: oldUserId },
              { $addToSet: { invites: newUserId } }
            )
            .then((_d) => {
              console.log('team invites update1', _d);
            })
            .catch((_e) => {
              console.log('error in team invites update1', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { invites: oldUserId },
              { $pull: { invites: oldUserId } }
            )
            .then((_d) => {
              console.log('team invites update2', _d);
            })
            .catch((_e) => {
              console.log('error in team invites update2', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { requests: oldUserId },
              { $addToSet: { requests: newUserId } }
            )
            .then((_d) => {
              console.log('team requests update1', _d);
            })
            .catch((_e) => {
              console.log('error in team requests update1', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { requests: oldUserId },
              { $pull: { requests: oldUserId } }
            )
            .then((_d) => {
              console.log('team requests update2', _d);
            })
            .catch((_e) => {
              console.log('error in team requests update2', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { editors: oldUserId },
              { $addToSet: { editors: newUserId } }
            )
            .then((_d) => {
              console.log('team edirots update1', _d);
            })
            .catch((_e) => {
              console.log('error in team edirots update1', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { editors: oldUserId },
              { $pull: { editors: oldUserId } }
            )
            .then((_d) => {
              console.log('team edirots update2', _d);
            })
            .catch((_e) => {
              console.log('error in team edirots update2', _e);
            });
          await db
            .collection('teams')
            .updateMany(
              { cursor: oldUserId },
              { $addToSet: { cursor: newUserId } }
            )
            .then((_d) => {
              console.log('team cursor update1', _d);
            })
            .catch((_e) => {
              console.log('error in team cursor update1', _e);
            });
          await db
            .collection('teams')
            .updateMany({ cursor: oldUserId }, { $pull: { cursor: oldUserId } })
            .then((_d) => {
              console.log('team cursor update2', _d);
            })
            .catch((_e) => {
              console.log('error in team cursor update2', _e);
            });

          // Other tables
          const neededCollections = [
            'activities',
            'agent_filters',
            'agentfires',
            'api_trackers',
            'appointments',
            'automation_lines',
            'automations',
            'campaign_jobs',
            'campaigns',
            'deal_stage',
            'deals',
            'drafts',
            'email_templates',
            'email_trackers',
            'emails',
            'event_types',
            'events',
            'ext_activities',
            'files',
            'filters',
            'folders',
            'follow_up',
            'garbages',
            'guests',
            'image_trackers',
            'images',
            'label',
            'lead_forms',
            'mail_lists',
            'material_themes',
            'outbounds',
            'pages',
            'paid_demos',
            'pdf_trackers',
            'pdfs',
            'personalities',
            'pipe_lines',
            'reminders',
            'sphere_buckets',
            'sphere_relationships',
            'tags',
            'tasks',
            'texts',
            'time_lines',
            'user_logs',
            'video_trackers',
            'videos',
          ];
          for (let i = 0; i < neededCollections.length; i++) {
            if (
              neededCollections[i] === 'files' ||
              neededCollections[i] === 'garbages' ||
              neededCollections[i] === 'notes' ||
              neededCollections[i] === 'pdf_trackers' ||
              neededCollections[i] === 'phone_logs' ||
              neededCollections[i] === 'user_logs' ||
              neededCollections[i] === 'reminders' ||
              neededCollections[i] === 'texts' ||
              neededCollections[i] === 'video_trackers'
            ) {
              await db
                .collection(neededCollections[i])
                .updateMany(
                  { user: oldUserId },
                  { $addToSet: { user: newUserId } }
                )
                .then((_d) => {
                  console.log(neededCollections[i] + ' update1', _d);
                })
                .catch((_e) => {
                  console.log(
                    'error in ' + neededCollections[i] + ' update1',
                    _e
                  );
                });
              await db
                .collection(neededCollections[i])
                .updateMany({ user: oldUserId }, { $pull: { user: oldUserId } })
                .then((_d) => {
                  console.log(neededCollections[i] + ' update2', _d);
                })
                .catch((_e) => {
                  console.log(
                    'error in ' + neededCollections[i] + ' update2',
                    _e
                  );
                });
            } else {
              await db
                .collection(neededCollections[i])
                .updateMany({ user: oldUserId }, { $set: { user: newUserId } })
                .then((_d) => {
                  console.log(neededCollections[i] + ' update', _d);
                })
                .catch((_e) => {
                  console.log(
                    'error in ' + neededCollections[i] + ' update',
                    _e
                  );
                });
            }
          }
        }
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
