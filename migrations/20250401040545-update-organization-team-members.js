module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const orgs = await db
      .collection('organizations')
      .find({
        vortex_team: { $exists: true },
      })
      .toArray();
    console.log('orgs', orgs.length);

    for (const org of orgs) {
      console.log('org', org?._id);
      let team = await db
        .collection('teams')
        .findOne({ _id: org.team })
        .catch((err) => {
          console.log('team getting error', err);
        });
      let donot_match_team_count = 0;
      let donot_match_member_team_count = 0;
      let donot_match_member_org_count = 0;
      if (!team) {
        donot_match_team_count++;
        console.log('team match failed in organization: ', org?._id);
        team = await db
          .collection('teams')
          .findOne({
            owner: org.owner,
            is_internal: true,
          })
          .catch((err) => {
            console.log('interal team getting error', err);
          });
        if (team) {
          await db
            .collection('organizations')
            .updateOne({ _id: org._id }, { $set: { team: team._id } });
        } else {
          console.log('do not find interal team for organization: ', org?._id);
        }
      }

      if (team) {
        for (const orgUser of org.members || []) {
          if (
            orgUser.status === 'ACTIVE' &&
            !(team?.members ?? []).some((member) => member.equals(orgUser.user))
          ) {
            donot_match_member_team_count++;
            console.log(
              'organization member does not exist in team members: ',
              orgUser,
              team?.members
            );
            await db
              .collection('teams')
              .updateOne(
                { _id: team._id },
                { $addToSet: { members: { $each: [orgUser.user] } } }
              );
          }
        }

        for (const teamMember of team?.members || []) {
          if (
            !(org.members ?? []).some((member) =>
              member?.user.equals(teamMember)
            )
          ) {
            donot_match_member_org_count++;
            console.log(
              'team member does not exist in organization members: ',
              teamMember,
              org?.members
            );
            const orgMember = {
              user: teamMember,
              role: org.owner.equals(teamMember) ? 'OWNER' : 'MEMBER',
              status: 'ACTIVE',
            };
            await db
              .collection('organizations')
              .updateOne(
                { _id: org._id },
                { $addToSet: { members: { $each: [orgMember] } } }
              );
          }
        }
      }
      console.log('org: ', org?._id);
      console.log('donot_match_team_count: ', donot_match_team_count);
      console.log(
        'donot_match_member_team_count: ',
        donot_match_member_team_count
      );
      console.log(
        'donot_match_member_org_count: ',
        donot_match_member_org_count
      );
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
