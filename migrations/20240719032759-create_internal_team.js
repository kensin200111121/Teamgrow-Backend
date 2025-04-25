module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const accountsWithSub = await db
      .collection('users')
      .find({
        del: false,
        is_primary: true,
      })
      .toArray();
    console.log('accountsWithSub count', accountsWithSub.length);

    for (const account of accountsWithSub) {
      const members = await db
        .collection('users')
        .find({
          del: false,
          is_primary: false,
          primary_account: account._id,
        })
        .toArray();
      console.log('members count', members.length, 'on user id ', account._id);

      if (members?.length > 0) {
        console.log('has sub accounts', account.email)
        const internalTeams = await db
          .collection('teams')
          .find({
            owner: account._id,
            is_internal: true,
          })
          .toArray();
        console.log(
          'internalTeams count',
          internalTeams.length,
          'on user id ',
          account._id
        );
        if (internalTeams?.length === 0 && members?.length > 0) {
          console.log('team owner', account.email, account.user_name, account._id);
          await db.collection('teams').insertOne({
            name: account.user_name,
            owner: account._id,
            is_internal: true,
            members: members.map((e) => e._id),
          });
          // insert new internal team if user including sub accounts doesn't includes internal team
        }
      }
    }

    // for internal team root folder create
    const internalTeams = await db.collection('teams').find({
      is_internal: true
    }).toArray();
    console.log('internal teams length', internalTeams.length);
    for (let i = 0; i < internalTeams.length; i++) {
      // find the team folder
      const teamFolder = await db.collection('folders').findOne({
        team: internalTeams[i]._id,
        role: 'team',
        del: false
      });
      if (teamFolder) {
        continue;
      }
      console.log('insert the team folder', i, internalTeams[i]._id);
      // continue;
      await db.collection('folders').insertOne({
        team: internalTeams[i]._id,
        role: 'team',
        del: false,
        title: internalTeams[i].name
      })
    }


  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
